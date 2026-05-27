#!/usr/bin/env node
// scripts/scrape-dafyomi.mjs
//
// Ingests per-daf study content from dafyomi.co.il (Kollel Iyun HaDaf) into a
// structured JSON corpus under static/dafyomi/<Tractate>/<daf>.json. One daf =
// one file = both amudim, every content type present. Raw HTML is cached under
// scripts/.cache/dafyomi/ (git-ignored) so re-runs are instant and idempotent;
// a 30s network delay (robots.txt Crawl-delay) gates only real fetches.
//
// We treat dafyomi.co.il as an INGESTION SOURCE for a personal study app, with
// attribution (see the corpus NOTICE.md and the in-app attributions page).
// Nothing is fabricated: a 404 / empty / unparseable page is recorded in the
// daf's `absent` list, never backfilled.
//
// Usage:
//   node scripts/scrape-dafyomi.mjs --tractate Chullin --daf 76        # one daf
//   node scripts/scrape-dafyomi.mjs --tractate Chullin                 # whole masechet (2..lastDaf)
//   node scripts/scrape-dafyomi.mjs --tractate Chullin --from 70 --to 80
//   node scripts/scrape-dafyomi.mjs --tractate Chullin --types tosfos,points
//   node scripts/scrape-dafyomi.mjs --tractate Chullin --daf 76 --dry-run   # parse from cache, write nothing
//   node scripts/scrape-dafyomi.mjs --tractate Chullin --refetch            # ignore HTML cache

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  getDafyomiMasechet, DAFYOMI_CONTENT_TYPES, buildDafyomiUrl, dafToNNN,
} from '../src/lib/sefref/dafyomi/masechtos.ts';
import { assembleDaf } from '../src/lib/sefref/dafyomi/assemble.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '.cache', 'dafyomi');
const OUT_DIR = join(__dirname, '..', 'static', 'dafyomi');
const USER_AGENT = 'talmud-viewer/0.1 (https://github.com/shaunregenbaum/talmud; shaunregenbaum@gmail.com)';
const MIN_DELAY_MS = 30_000;

// --- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const TRACTATE = val('--tractate', null);
const ONE_DAF = val('--daf', null);
const FROM = parseInt(val('--from', '2'), 10);
const TO = val('--to', null);
const TYPES = val('--types', null)?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const DELAY = Math.max(parseInt(val('--delay', String(MIN_DELAY_MS)), 10) || MIN_DELAY_MS, has('--force-fast') ? 0 : MIN_DELAY_MS);
const DRY_RUN = has('--dry-run');
const REFETCH = has('--refetch');

if (!TRACTATE) { console.error('error: --tractate <AppTractateValue> is required (e.g. --tractate Chullin)'); process.exit(1); }

const masechet = getDafyomiMasechet(TRACTATE);
if (!masechet) { console.error(`error: tractate "${TRACTATE}" is not mapped in masechtos.ts (or has no daf bounds)`); process.exit(1); }
if (!masechet.verified) console.warn(`[warn] masechet "${TRACTATE}" (dir=${masechet.dir} prefix=${masechet.prefix}) is UNVERIFIED — wrong dir/prefix will show as all-absent dafim`);

const specs = TYPES
  ? DAFYOMI_CONTENT_TYPES.filter((s) => TYPES.includes(s.type))
  : DAFYOMI_CONTENT_TYPES;
if (specs.length === 0) { console.error(`error: no content types match --types ${TYPES}`); process.exit(1); }

const dafs = ONE_DAF
  ? [parseInt(ONE_DAF, 10)]
  : range(FROM, TO ? parseInt(TO, 10) : masechet.lastDaf);

// --- fetch + cache --------------------------------------------------------
let lastFetchTs = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cachePath(typecode, daf) {
  return join(CACHE_DIR, masechet.dir, typecode, `${dafToNNN(daf)}.htm`);
}
function absentMarkerPath(typecode, daf) {
  return join(CACHE_DIR, masechet.dir, typecode, `${dafToNNN(daf)}.absent`);
}

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = Date.now() - lastFetchTs;
    if (wait < DELAY) await sleep(DELAY - wait);
    lastFetchTs = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
      if (res.status === 404) return { absent: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      if (!body.includes('id="content"')) return { absent: true };
      return { html: body };
    } catch (err) {
      lastErr = err;
      await sleep([5_000, 15_000, 45_000][attempt] ?? 45_000);
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

/** Returns { html } | { absent:true }. Reads the on-disk cache unless --refetch. */
async function getHtml(spec, daf) {
  const htmlPath = cachePath(spec.typecode, daf);
  const absPath = absentMarkerPath(spec.typecode, daf);
  if (!REFETCH) {
    if (existsSync(htmlPath)) return { html: await readFile(htmlPath, 'utf-8'), cached: true };
    if (existsSync(absPath)) return { absent: true, cached: true };
  }
  const url = buildDafyomiUrl(masechet, spec, daf);
  const result = await fetchWithRetry(url);
  await mkdir(dirname(htmlPath), { recursive: true });
  if (result.absent) { await writeFile(absPath, '', 'utf-8'); return { absent: true }; }
  await writeFile(htmlPath, result.html, 'utf-8');
  return { html: result.html };
}

// --- main -----------------------------------------------------------------
let interrupted = false;
process.on('SIGINT', () => { console.log('\n[dafyomi] SIGINT — stopping after current daf'); interrupted = true; });

async function main() {
  console.log(`[dafyomi] ${TRACTATE} (dir=${masechet.dir} prefix=${masechet.prefix} lastDaf=${masechet.lastDaf})`);
  console.log(`[dafyomi] dafim=${dafs[0]}..${dafs[dafs.length - 1]} types=${specs.map((s) => s.type).join(',')} delay=${DELAY}ms${DRY_RUN ? ' [dry-run]' : ''}${REFETCH ? ' [refetch]' : ''}\n`);

  const allWarnings = [];
  const allAbsentDafim = [];
  let written = 0, fetchedCount = 0;

  for (const daf of dafs) {
    if (interrupted) break;
    const fetched = [];
    for (const spec of specs) {
      if (interrupted) break;
      let r;
      try { r = await getHtml(spec, daf); }
      catch (err) { console.error(`  [err] ${TRACTATE} ${daf} ${spec.type}: ${err.message}`); r = { absent: true }; }
      if (!r.cached && (r.html || r.absent)) fetchedCount++;
      fetched.push({ type: spec.type, url: buildDafyomiUrl(masechet, spec, daf), html: r.absent ? null : r.html });
    }

    const { daf: dafObj, warnings } = assembleDaf(TRACTATE, daf, fetched);
    for (const w of warnings) allWarnings.push(`${TRACTATE} ${daf} ${w.type}: ${w.warning}`);

    const present = specs.length - dafObj.absent.length;
    if (present === 0) allAbsentDafim.push(daf);
    const flag = present === 0 ? ' !! ALL ABSENT' : '';
    console.log(`  daf ${String(daf).padStart(3)}: ${present}/${specs.length} present; absent=[${dafObj.absent.join(',')}]${flag}`);

    if (!DRY_RUN) {
      const outPath = join(OUT_DIR, TRACTATE, `${daf}.json`);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(dafObj, null, 2) + '\n', 'utf-8');
      written++;
    }
  }

  console.log(`\n[dafyomi] done — ${written} files written, ${fetchedCount} network fetches`);
  if (allAbsentDafim.length) console.warn(`[dafyomi] WARNING all-absent dafim (mapping bug?): ${allAbsentDafim.join(', ')}`);
  if (allWarnings.length) {
    console.log(`[dafyomi] ${allWarnings.length} parse warnings:`);
    for (const w of allWarnings.slice(0, 40)) console.log(`  - ${w}`);
    if (allWarnings.length > 40) console.log(`  ... and ${allWarnings.length - 40} more`);
  }
}

function range(a, b) { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }

main().catch((err) => { console.error('[dafyomi] fatal:', err); process.exit(1); });
