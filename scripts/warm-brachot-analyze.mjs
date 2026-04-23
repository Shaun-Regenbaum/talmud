#!/usr/bin/env node
/**
 * Batch-warm /api/analyze for every amud of Berakhot.
 *
 * Usage:
 *   TALMUD_WORKER_URL=https://<worker>.workers.dev \
 *     node scripts/warm-brachot-analyze.mjs [--refresh] [--dry-run] [--concurrency N]
 *
 * Emits a per-run audit JSON at scripts/out/brachot-run-<timestamp>.json
 * summarizing model, timing, validation warnings, and error counts per amud.
 *
 * --refresh     pass ?refresh=1 on every request (regenerate cached entries)
 * --dry-run     probe each amud with ?cached_only=1, don't trigger AI runs
 * --concurrency limit in-flight requests (default 3; Kimi K2.6 is slow so 3
 *               is a reasonable balance between throughput and upstream load)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKER_URL = process.env.TALMUD_WORKER_URL;
if (!WORKER_URL) {
  console.error('ERROR: set TALMUD_WORKER_URL to the deployed worker URL');
  process.exit(1);
}

const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
const DRY_RUN = args.includes('--dry-run');
const cIdx = args.indexOf('--concurrency');
const CONCURRENCY = cIdx >= 0 ? Math.max(1, parseInt(args[cIdx + 1], 10) || 3) : 3;

// Capital B matches existing cache key convention (analyze:v5:Berakhot:*).
// The worker treats the path parameter as case-sensitive for the cache key.
const TRACTATE = 'Berakhot';
const END_AMUD_NUMBER = 127; // Berakhot 64a = amud #127 (Sefaria 1-indexed)
const START_AMUD_NUMBER = 3; // Berakhot 2a = amud #3

function numberToAmud(n) {
  const daf = Math.ceil(n / 2);
  const side = n % 2 === 1 ? 'a' : 'b';
  return `${daf}${side}`;
}

function iterAmudim() {
  const out = [];
  for (let n = START_AMUD_NUMBER; n <= END_AMUD_NUMBER; n++) out.push(numberToAmud(n));
  return out;
}

async function warmOne(daf) {
  const base = `${WORKER_URL.replace(/\/$/, '')}/api/analyze/${TRACTATE}/${daf}`;
  const params = [];
  if (DRY_RUN) params.push('cached_only=1');
  if (REFRESH) params.push('refresh=1');
  const url = params.length ? `${base}?${params.join('&')}` : base;

  const t0 = Date.now();
  let status = 0;
  let body = null;
  let err = null;
  try {
    const res = await fetch(url);
    status = res.status;
    try { body = await res.json(); } catch { /* body not JSON */ }
  } catch (e) {
    err = String(e);
  }
  const ms = Date.now() - t0;

  return {
    daf,
    status,
    ms,
    model: body?._model ?? null,
    cached: body?._cached ?? null,
    sections: Array.isArray(body?.sections) ? body.sections.length : null,
    rishonim: body?._rishonim ?? null,
    halacha: body?._halacha ?? null,
    warnings: Array.isArray(body?._validationWarnings) ? body._validationWarnings.length : null,
    error: err ?? (status >= 400 ? (body?.error ?? `HTTP ${status}`) : null),
    validationErrors: body?.validationErrors ?? null,
  };
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  const queue = items.slice();
  const running = new Set();
  async function spawn() {
    while (queue.length) {
      const item = queue.shift();
      const p = worker(item).then(r => { running.delete(p); results.push(r); });
      running.add(p);
      if (running.size >= limit) await Promise.race(running);
    }
  }
  await spawn();
  await Promise.all(running);
  return results;
}

function summarize(results) {
  const ok = results.filter(r => r.status === 200 && !r.error);
  const failed = results.filter(r => r.status !== 200 || r.error);
  const validationFailed = results.filter(r => Array.isArray(r.validationErrors) && r.validationErrors.length > 0);
  const times = ok.map(r => r.ms).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : null;
  const p95 = times.length ? times[Math.floor(times.length * 0.95)] : null;
  return {
    total: results.length,
    ok: ok.length,
    failed: failed.length,
    validationFailed: validationFailed.length,
    median_ms: median,
    p95_ms: p95,
    total_wall_ms: results.reduce((s, r) => s + r.ms, 0),
  };
}

async function main() {
  const amudim = iterAmudim();
  console.log(`[warm] ${TRACTATE}: ${amudim.length} amudim, concurrency=${CONCURRENCY}, refresh=${REFRESH}, dryRun=${DRY_RUN}`);
  console.log(`[warm] target: ${WORKER_URL}`);

  const started = new Date();
  const results = await runWithConcurrency(amudim, CONCURRENCY, async (daf) => {
    const r = await warmOne(daf);
    const badge = r.error ? 'ERR' : r.cached ? 'HIT' : 'GEN';
    const detail = r.error ? `err=${String(r.error).slice(0, 80)}` : `model=${r.model ?? '?'} sections=${r.sections ?? '?'} warns=${r.warnings ?? 0}`;
    console.log(`[${badge}] ${daf.padEnd(4)} ${String(r.status).padStart(3)} ${String(r.ms).padStart(6)}ms ${detail}`);
    return r;
  });

  const summary = summarize(results);
  console.log('\n[warm] summary:', summary);

  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = started.toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `${TRACTATE}-run-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    tractate: TRACTATE,
    startedAt: started.toISOString(),
    finishedAt: new Date().toISOString(),
    workerUrl: WORKER_URL,
    refresh: REFRESH,
    dryRun: DRY_RUN,
    concurrency: CONCURRENCY,
    summary,
    results: results.sort((a, b) => a.daf.localeCompare(b.daf, 'en', { numeric: true })),
  }, null, 2));
  console.log(`[warm] audit written to ${outPath}`);

  if (summary.failed > 0 || summary.validationFailed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
