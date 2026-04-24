#!/usr/bin/env node
// scripts/build-rabbi-orientation.mjs
//
// For every bio-bearing rabbi, fires `/api/admin/rabbi-orientation/:slug`
// to classify (orientation, domain, academies). Writes
// src/lib/data/rabbi-orientation.json.
//
// Usage matches build-rabbi-family.mjs (--url, --concurrency, --only,
// --resume, --dry-run, --limit).

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RABBIS_PATH = join(__dirname, '..', 'src', 'lib', 'data', 'rabbi-places.json');
const OUT_PATH = join(__dirname, '..', 'src', 'lib', 'data', 'rabbi-orientation.json');

const args = process.argv.slice(2);
const getFlag = (name) => args.includes(name);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const URL = getArg('--url', 'http://localhost:5173');
const CONCURRENCY = parseInt(getArg('--concurrency', '4'), 10);
const DRY_RUN = getFlag('--dry-run');
const RESUME = getFlag('--resume');
const ONLY = getArg('--only', null);
const LIMIT = getArg('--limit', null);

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; }
  catch { return { status: res.status, json: { error: text.slice(0, 300) } }; }
}

async function loadExistingOutput() {
  if (!existsSync(OUT_PATH)) return null;
  try { return JSON.parse(await readFile(OUT_PATH, 'utf-8')); } catch { return null; }
}

async function main() {
  console.log(`[orientation] loading ${RABBIS_PATH}`);
  const rabbisFile = JSON.parse(await readFile(RABBIS_PATH, 'utf-8'));

  console.log(`[orientation] fetching slug list from ${URL}/api/admin/rabbi-slugs`);
  const { status, json } = await fetchJson(`${URL}/api/admin/rabbi-slugs`);
  if (status !== 200) {
    console.error('Failed to fetch slug list:', json);
    process.exit(1);
  }
  let slugs = json.slugs.filter((s) => rabbisFile.rabbis[s]?.bio);
  if (ONLY) slugs = slugs.filter((s) => s === ONLY);
  if (LIMIT) slugs = slugs.slice(0, parseInt(LIMIT, 10));

  const nodes = {};
  for (const [slug, entry] of Object.entries(rabbisFile.rabbis)) {
    nodes[slug] = {
      canonical: entry.canonical,
      generation: entry.generation ?? 'unknown',
      hasBio: Boolean(entry.bio),
      orientation: null,
      domain: null,
      academies: [],
      processed: false,
    };
  }

  const existing = RESUME ? await loadExistingOutput() : null;
  if (existing?.nodes) {
    for (const [slug, prev] of Object.entries(existing.nodes)) {
      if (!nodes[slug]) continue;
      nodes[slug].orientation = prev.orientation ?? null;
      nodes[slug].domain = prev.domain ?? null;
      nodes[slug].academies = prev.academies ?? [];
      nodes[slug].processed = prev.processed === true;
    }
    const before = slugs.length;
    slugs = slugs.filter((s) => !nodes[s]?.processed);
    console.log(`[orientation] --resume: ${before - slugs.length} already processed, ${slugs.length} remain`);
  }

  console.log(`[orientation] ${slugs.length} slugs to process (concurrency=${CONCURRENCY})`);

  const errors = [];
  let done = 0;
  const total = slugs.length;
  const t0 = Date.now();
  const work = [...slugs];

  const workers = Array.from({ length: CONCURRENCY }, () => (async () => {
    while (work.length > 0) {
      const slug = work.shift();
      if (!slug) return;
      const { status, json } = await fetchJson(`${URL}/api/admin/rabbi-orientation/${encodeURIComponent(slug)}`);
      done++;
      if (status !== 200) {
        errors.push({ slug, status, error: json.error ?? json });
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.error(`[${done}/${total}] ${elapsed}s FAIL ${slug} status=${status} err=${JSON.stringify(json).slice(0, 160)}`);
        continue;
      }
      const node = nodes[slug];
      if (!node) continue;
      node.orientation = json.orientation;
      node.domain = json.domain;
      node.academies = json.academies ?? [];
      node.processed = true;

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[${done}/${total}] ${elapsed}s  ${slug.padEnd(40)} ${node.orientation}/${node.domain} @${node.academies.join(',')}`);

      if (!DRY_RUN && done % 25 === 0) {
        const processedSoFar = Object.values(nodes).filter((n) => n.processed).length;
        const checkpoint = {
          generatedAt: new Date().toISOString(),
          source: `${URL}/api/admin/rabbi-orientation`,
          totalNodes: Object.keys(nodes).length,
          processedNodes: processedSoFar,
          nodes,
        };
        await writeFile(OUT_PATH, JSON.stringify(checkpoint, null, 2) + '\n', 'utf-8');
        console.log(`[orientation] checkpoint: ${processedSoFar} processed`);
      }
    }
  })());

  await Promise.all(workers);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const processedCount = Object.values(nodes).filter((n) => n.processed).length;
  console.log(`\n[orientation] complete in ${elapsed}s`);
  console.log(`[orientation]   processed: ${processedCount} / ${Object.keys(nodes).length}`);
  console.log(`[orientation]   errors: ${errors.length}`);
  if (errors.length && errors.length < 40) {
    console.log('\n[orientation] errors:');
    for (const e of errors) console.log(`  ${e.slug}: ${e.error}`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: `${URL}/api/admin/rabbi-orientation`,
    totalNodes: Object.keys(nodes).length,
    processedNodes: processedCount,
    nodes,
  };

  if (DRY_RUN) {
    console.log('[orientation] --dry-run — NOT writing file');
    return;
  }
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
  console.log(`[orientation] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[orientation] fatal:', err);
  process.exit(1);
});
