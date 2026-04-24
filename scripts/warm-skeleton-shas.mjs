#!/usr/bin/env node
/**
 * Sequential first-pass skeleton generation across all 37 tractates of Shas.
 *
 * Uses `/api/analyze/:t/:p?skeleton_only=1` — runs Stage A only, caches the
 * skeleton, skips the expensive Stage B enrichment entirely. Each skeleton
 * takes ~90-180s. Concurrency 1 to avoid AI Gateway transient 502s we saw
 * with parallel Kimi K2.6 calls.
 *
 * Resume-aware via the `analyze-skel:v1:*` KV cache — already-cached
 * skeletons return in ~200-500ms so re-running is cheap.
 *
 * Usage:
 *   TALMUD_WORKER_URL=https://<worker> node scripts/warm-skeleton-shas.mjs
 *     [--tractates "Berakhot,Shabbat"]   # optional subset
 *     [--refresh]                         # force regen (default: skip cached)
 *     [--concurrency N]                   # default 1
 *
 * Emits per-tractate audit JSON to scripts/out/skeleton-<tractate>-<stamp>.json
 * and a rollup at scripts/out/skeleton-shas-<stamp>.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKER_URL = process.env.TALMUD_WORKER_URL;
if (!WORKER_URL) {
  console.error('ERROR: set TALMUD_WORKER_URL to the deployed worker URL');
  process.exit(1);
}

const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
const cIdx = args.indexOf('--concurrency');
const CONCURRENCY = cIdx >= 0 ? Math.max(1, parseInt(args[cIdx + 1], 10) || 1) : 1;
const tIdx = args.indexOf('--tractates');
const TRACTATE_FILTER = tIdx >= 0 ? (args[tIdx + 1] || '').split(',').map(s => s.trim()).filter(Boolean) : null;

// Every tractate of the Bavli. Values are end amud (Sefaria 1-indexed amud
// address converted back to daf-side notation). Sourced from
//   curl -s "https://www.sefaria.org/api/v2/index/{Tractate}" | jq '.schema.lengths[0]'
// Kept in sync with src/lib/sefref/amudim.ts TRACTATE_END_AMUD.
const TRACTATES = {
  Berakhot: '64a',
  Shabbat: '157b',
  Eruvin: '105a',
  Pesachim: '121b',
  Shekalim: '22b',
  Yoma: '88a',
  Sukkah: '56b',
  Beitzah: '40b',
  'Rosh Hashanah': '35a',
  Taanit: '31a',
  Megillah: '32a',
  'Moed Katan': '29a',
  Chagigah: '27a',
  Yevamot: '122b',
  Ketubot: '112b',
  Nedarim: '91b',
  Nazir: '66b',
  Sotah: '49b',
  Gittin: '90b',
  Kiddushin: '82b',
  'Bava Kamma': '119b',
  'Bava Metzia': '119a',
  'Bava Batra': '176b',
  Sanhedrin: '113b',
  Makkot: '24b',
  Shevuot: '49b',
  'Avodah Zarah': '76b',
  Horayot: '14a',
  Zevachim: '120b',
  Menachot: '110a',
  Chullin: '142a',
  Bekhorot: '61a',
  Arakhin: '34a',
  Temurah: '34a',
  Keritot: '28b',
  Meilah: '22a',
  Niddah: '73a',
};

function amudToNumber(amud) {
  const m = amud.match(/^(\d+)([ab])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n * 2 + (m[2] === 'a' ? -1 : 0);
}

function numberToAmud(n) {
  const daf = Math.ceil(n / 2);
  const side = n % 2 === 1 ? 'a' : 'b';
  return `${daf}${side}`;
}

function iterAmudim(endAmud) {
  const out = [];
  const end = amudToNumber(endAmud);
  for (let n = 3; n <= end; n++) out.push(numberToAmud(n));
  return out;
}

function curlGet(url, maxSeconds) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const proc = spawn('curl', [
      '-sS',
      '-w', '\n__STATUS__:%{http_code}',
      '--max-time', String(maxSeconds),
      url,
    ]);
    let out = '';
    let errBuf = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { errBuf += d.toString(); });
    proc.on('close', (code) => {
      const ms = Date.now() - t0;
      if (code !== 0) {
        resolve({ status: 0, body: null, error: errBuf.trim() || `curl exit ${code}`, ms });
        return;
      }
      const m = out.match(/__STATUS__:(\d+)\s*$/);
      const status = m ? parseInt(m[1], 10) : 0;
      const bodyStr = m ? out.slice(0, m.index) : out;
      let body = null;
      try { body = JSON.parse(bodyStr); } catch { /* */ }
      resolve({ status, body, error: null, ms });
    });
  });
}

async function warmOne(tractate, daf) {
  const base = `${WORKER_URL.replace(/\/$/, '')}/api/analyze/${encodeURIComponent(tractate)}/${daf}`;
  const params = ['skeleton_only=1'];
  if (REFRESH) params.push('refresh=1');
  const url = `${base}?${params.join('&')}`;
  // 6 min max per daf: Stage A at K2.6 low-effort typically 90-180s, pad for
  // jitter. Cached hits return <1s so this cap doesn't slow the common case.
  const { status, body, error, ms } = await curlGet(url, 360);
  const cached = !!body?._cached;
  return {
    tractate, daf, status, ms, cached,
    sections: Array.isArray(body?.sections) ? body.sections.length : null,
    error: error ?? (status !== 200 ? (body?.error ?? `HTTP ${status}`) : null),
  };
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  const queue = items.slice();
  const running = new Set();
  async function spawnNext() {
    while (queue.length) {
      const item = queue.shift();
      const p = worker(item).then(r => { running.delete(p); results.push(r); });
      running.add(p);
      if (running.size >= limit) await Promise.race(running);
    }
  }
  await spawnNext();
  await Promise.all(running);
  return results;
}

async function processTractate(tractate, endAmud, outDir, stamp) {
  const amudim = iterAmudim(endAmud);
  console.log(`\n[${tractate}] ${amudim.length} amudim starting...`);
  const started = new Date();

  let hits = 0; let gens = 0; let errs = 0; let idx = 0;
  const results = await runWithConcurrency(amudim, CONCURRENCY, async (daf) => {
    const r = await warmOne(tractate, daf);
    idx++;
    if (r.error) { errs++; }
    else if (r.cached) { hits++; }
    else { gens++; }
    const badge = r.error ? 'ERR' : r.cached ? 'HIT' : 'GEN';
    const detail = r.error ? `err=${String(r.error).slice(0, 80)}` : `sections=${r.sections ?? '?'}`;
    console.log(`  [${badge}] ${tractate} ${daf.padEnd(5)} ${String(r.status).padStart(3)} ${String(r.ms).padStart(6)}ms ${detail}  (${idx}/${amudim.length})`);
    return r;
  });

  const tractateOut = path.join(outDir, `skeleton-${tractate.replace(/\s+/g, '-')}-${stamp}.json`);
  fs.writeFileSync(tractateOut, JSON.stringify({
    tractate, amudim_count: amudim.length,
    hits, gens, errs,
    startedAt: started.toISOString(),
    finishedAt: new Date().toISOString(),
    results: results.sort((a, b) => a.daf.localeCompare(b.daf, 'en', { numeric: true })),
  }, null, 2));

  console.log(`[${tractate}] done: ${hits} hit, ${gens} gen, ${errs} err. Audit at ${tractateOut}`);
  return { tractate, hits, gens, errs, amudim_count: amudim.length };
}

async function main() {
  const tractates = Object.entries(TRACTATES).filter(
    ([t]) => !TRACTATE_FILTER || TRACTATE_FILTER.includes(t),
  );

  console.log(`[warm:skeleton:shas] ${tractates.length} tractates, concurrency=${CONCURRENCY}, refresh=${REFRESH}`);
  console.log(`[warm:skeleton:shas] target: ${WORKER_URL}`);

  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const tractateSummaries = [];
  for (const [tractate, endAmud] of tractates) {
    const sum = await processTractate(tractate, endAmud, outDir, stamp);
    tractateSummaries.push(sum);
  }

  const totalHits = tractateSummaries.reduce((s, t) => s + t.hits, 0);
  const totalGens = tractateSummaries.reduce((s, t) => s + t.gens, 0);
  const totalErrs = tractateSummaries.reduce((s, t) => s + t.errs, 0);
  const totalAmudim = tractateSummaries.reduce((s, t) => s + t.amudim_count, 0);

  console.log(`\n[warm:skeleton:shas] FINAL:`);
  console.log(`  tractates: ${tractateSummaries.length}`);
  console.log(`  amudim total: ${totalAmudim}`);
  console.log(`  hits: ${totalHits}, gens: ${totalGens}, errs: ${totalErrs}`);
  console.log(`  success rate: ${((totalHits + totalGens) / totalAmudim * 100).toFixed(1)}%`);

  const rollupPath = path.join(outDir, `skeleton-shas-${stamp}.json`);
  fs.writeFileSync(rollupPath, JSON.stringify({
    startedAt: stamp,
    finishedAt: new Date().toISOString(),
    concurrency: CONCURRENCY,
    refresh: REFRESH,
    totalAmudim, totalHits, totalGens, totalErrs,
    tractates: tractateSummaries,
  }, null, 2));
  console.log(`[warm:skeleton:shas] rollup: ${rollupPath}`);

  if (totalErrs > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
