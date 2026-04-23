#!/usr/bin/env node
// scripts/enrich-rabbis.mjs
//
// One-shot enrichment runner. For each of the ~128 rabbinic entries in
// src/lib/data/rabbi-places.json, fires a `/api/admin/enrich-rabbi/:slug`
// request against the local dev worker (or --url) and merges the result
// (generation, region, places, moved) back into the JSON.
//
// Usage:
//   node scripts/enrich-rabbis.mjs                     (against localhost:5173)
//   node scripts/enrich-rabbis.mjs --dry-run           (don't write the file)
//   node scripts/enrich-rabbis.mjs --force             (overwrite populated fields too)
//   node scripts/enrich-rabbis.mjs --concurrency 8     (default 8)
//   node scripts/enrich-rabbis.mjs --url https://...   (different worker)
//   node scripts/enrich-rabbis.mjs --only rav-zera     (single slug, for debug)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'src', 'lib', 'data', 'rabbi-places.json');

const args = process.argv.slice(2);
const getFlag = (name) => args.includes(name);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const URL = getArg('--url', 'http://localhost:5173');
const CONCURRENCY = parseInt(getArg('--concurrency', '8'), 10);
const DRY_RUN = getFlag('--dry-run');
const FORCE = getFlag('--force');
const ONLY = getArg('--only', null);

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; }
  catch { return { status: res.status, json: { error: text.slice(0, 300) } }; }
}

async function main() {
  console.log(`[enrich] loading ${DATA_PATH}`);
  const raw = await readFile(DATA_PATH, 'utf-8');
  const data = JSON.parse(raw);

  console.log(`[enrich] fetching slug list from ${URL}/api/admin/rabbi-slugs`);
  const { status, json } = await fetchJson(`${URL}/api/admin/rabbi-slugs`);
  if (status !== 200) {
    console.error('Failed to fetch slug list:', json);
    process.exit(1);
  }
  let slugs = json.slugs;
  if (ONLY) slugs = slugs.filter((s) => s === ONLY);
  console.log(`[enrich] ${slugs.length} rabbinic entries to process (concurrency=${CONCURRENCY})`);

  const results = new Map();
  const errors = [];
  let done = 0;
  const total = slugs.length;
  const t0 = Date.now();

  const workers = Array.from({ length: CONCURRENCY }, () => (async () => {
    while (slugs.length > 0) {
      const slug = slugs.shift();
      if (!slug) return;
      const { status, json } = await fetchJson(`${URL}/api/admin/enrich-rabbi/${encodeURIComponent(slug)}`);
      done++;
      if (status === 200) {
        results.set(slug, json);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`[${done}/${total}] ${elapsed}s  ${slug.padEnd(35)} gen=${json.generation} region=${json.region ?? 'null'} moved=${json.moved ?? 'null'} places=[${(json.places || []).join(',')}]`);
      } else {
        errors.push({ slug, status, error: json.error ?? json });
        console.error(`[${done}/${total}] FAIL ${slug} status=${status} err=${JSON.stringify(json).slice(0, 200)}`);
      }
    }
  })());

  await Promise.all(workers);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[enrich] complete in ${elapsed}s — ${results.size} succeeded, ${errors.length} failed`);

  if (errors.length) {
    console.log('\n[enrich] errors:');
    for (const e of errors) console.log(`  ${e.slug}: ${e.error}`);
  }

  // Merge results into the dataset.
  let mergedFields = 0;
  for (const [slug, e] of results) {
    const entry = data.rabbis[slug];
    if (!entry) continue;
    // generation: always apply (field was 100% null before).
    if (FORCE || entry.generation == null) { entry.generation = e.generation; mergedFields++; }
    if (FORCE || entry.region == null)     { entry.region = e.region;         mergedFields++; }
    if (FORCE || !(entry.places ?? []).length) { entry.places = e.places;     mergedFields++; }
    // moved is new — always apply.
    entry.moved = e.moved;
    mergedFields++;
  }
  console.log(`[enrich] merged ${mergedFields} field updates`);

  if (DRY_RUN) {
    console.log('[enrich] --dry-run — NOT writing file');
    return;
  }
  data.generatedAt = new Date().toISOString();
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`[enrich] wrote ${DATA_PATH}`);
}

main().catch((err) => {
  console.error('[enrich] fatal:', err);
  process.exit(1);
});
