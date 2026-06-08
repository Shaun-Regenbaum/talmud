#!/usr/bin/env node
// scripts/build-rabbi-family.mjs
//
// Fork of build-rabbi-hierarchy.mjs. For every bio-bearing rabbi, fires
// `/api/admin/rabbi-family/:slug` against the worker to extract familial
// relationships (father / mother / spouse / son / daughter / sibling /
// uncle / aunt / nephew / niece / grandparent / grandchild / in-laws /
// cousin / other). Results are written to src/lib/data/rabbi-family.json
// where the Usage coverage row and the Relations tab pick them up.
//
// Usage:
//   node scripts/build-rabbi-family.mjs                     (localhost:5173)
//   node scripts/build-rabbi-family.mjs --url https://...   (prod)
//   node scripts/build-rabbi-family.mjs --concurrency 4
//   node scripts/build-rabbi-family.mjs --only rabbi-yochanan-b-napacha
//   node scripts/build-rabbi-family.mjs --resume
//   node scripts/build-rabbi-family.mjs --dry-run
//   node scripts/build-rabbi-family.mjs --limit 50

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RABBIS_PATH = join(__dirname, '..', 'src', 'lib', 'data', 'rabbi-places.json');
const OUT_PATH = join(__dirname, '..', 'src', 'lib', 'data', 'rabbi-family.json');

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
  try {
    const raw = await readFile(OUT_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  console.log(`[family] loading ${RABBIS_PATH}`);
  const raw = await readFile(RABBIS_PATH, 'utf-8');
  const rabbisFile = JSON.parse(raw);

  console.log(`[family] fetching slug list from ${URL}/api/admin/rabbi-slugs`);
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
      canonicalHe: entry.canonicalHe ?? null,
      generation: entry.generation ?? 'unknown',
      hasBio: Boolean(entry.bio),
      family: [],                 // [{ name, relation, slug|null }]
      processed: false,
    };
  }

  const existing = RESUME ? await loadExistingOutput() : null;
  if (existing?.nodes) {
    for (const [slug, prev] of Object.entries(existing.nodes)) {
      if (!nodes[slug]) continue;
      nodes[slug].family = prev.family ?? [];
      nodes[slug].processed = prev.processed === true;
    }
    const before = slugs.length;
    slugs = slugs.filter((s) => !nodes[s]?.processed);
    console.log(`[family] --resume: ${before - slugs.length} already processed, ${slugs.length} remain`);
  }

  console.log(`[family] ${slugs.length} slugs to process (concurrency=${CONCURRENCY})`);

  const errors = [];
  let done = 0;
  const total = slugs.length;
  const t0 = Date.now();
  const work = [...slugs];

  const workers = Array.from({ length: CONCURRENCY }, () => (async () => {
    while (work.length > 0) {
      const slug = work.shift();
      if (!slug) return;
      const { status, json } = await fetchJson(`${URL}/api/admin/rabbi-family/${encodeURIComponent(slug)}`);
      done++;
      if (status !== 200) {
        errors.push({ slug, status, error: json.error ?? json });
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.error(`[${done}/${total}] ${elapsed}s FAIL ${slug} status=${status} err=${JSON.stringify(json).slice(0, 160)}`);
        continue;
      }
      const node = nodes[slug];
      if (!node) continue;
      node.family = (json.family ?? []).map((e) => ({
        name: e.name, relation: e.relation, slug: e.slug ?? null,
      }));
      node.processed = true;

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[${done}/${total}] ${elapsed}s  ${slug.padEnd(40)} family=${node.family.length}`);

      if (!DRY_RUN && done % 25 === 0) {
        const processedSoFar = Object.values(nodes).filter((n) => n.processed).length;
        const nodesWithFamily = Object.values(nodes).filter((n) => n.family.length > 0).length;
        const checkpoint = {
          generatedAt: new Date().toISOString(),
          source: `${URL}/api/admin/rabbi-family`,
          totalNodes: Object.keys(nodes).length,
          processedNodes: processedSoFar,
          nodesWithFamily,
          nodes,
        };
        await writeFile(OUT_PATH, JSON.stringify(checkpoint, null, 2) + '\n', 'utf-8');
        console.log(`[family] checkpoint: ${processedSoFar} processed, ${nodesWithFamily} with family`);
      }
    }
  })());

  await Promise.all(workers);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const processedCount = Object.values(nodes).filter((n) => n.processed).length;
  const withFamily = Object.values(nodes).filter((n) => n.family.length > 0).length;
  console.log(`\n[family] complete in ${elapsed}s`);
  console.log(`[family]   processed: ${processedCount} / ${Object.keys(nodes).length}`);
  console.log(`[family]   with family: ${withFamily} / ${Object.keys(nodes).length}`);
  console.log(`[family]   errors: ${errors.length}`);
  if (errors.length && errors.length < 40) {
    console.log('\n[family] errors:');
    for (const e of errors) console.log(`  ${e.slug}: ${e.error}`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: `${URL}/api/admin/rabbi-family`,
    totalNodes: Object.keys(nodes).length,
    processedNodes: processedCount,
    nodesWithFamily: withFamily,
    nodes,
  };

  if (DRY_RUN) {
    console.log('[family] --dry-run — NOT writing file');
    return;
  }
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
  console.log(`[family] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[family] fatal:', err);
  process.exit(1);
});
