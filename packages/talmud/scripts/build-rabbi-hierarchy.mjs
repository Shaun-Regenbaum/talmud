#!/usr/bin/env node
// scripts/build-rabbi-hierarchy.mjs
//
// For every rabbinic entry in src/lib/data/rabbi-places.json that has a bio,
// fires `/api/admin/rabbi-relationships/:slug` against the local dev worker
// (or --url) to extract teachers / students / colleagues. Results are
// resolved to validated slugs server-side, then merged bidirectionally
// here (if A says B is a teacher, B.students includes A) and written to
// src/lib/data/rabbi-hierarchy.json.
//
// Usage:
//   node scripts/build-rabbi-hierarchy.mjs                     (localhost:5173)
//   node scripts/build-rabbi-hierarchy.mjs --concurrency 4     (default 4)
//   node scripts/build-rabbi-hierarchy.mjs --url https://...   (different worker)
//   node scripts/build-rabbi-hierarchy.mjs --only rabbi-yochanan-b-napacha
//   node scripts/build-rabbi-hierarchy.mjs --resume            (skip slugs already in output file)
//   node scripts/build-rabbi-hierarchy.mjs --dry-run           (don't write output)
//   node scripts/build-rabbi-hierarchy.mjs --limit 50          (first N slugs — for smoke test)

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RABBIS_PATH = join(__dirname, '..', 'src', 'lib', 'data', 'rabbi-places.json');
const OUT_PATH = join(__dirname, '..', 'src', 'lib', 'data', 'rabbi-hierarchy.json');

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

function addEdge(nodes, fromSlug, toSlug, kind) {
  // kind: 'teachers' | 'students' | 'colleagues'
  const node = nodes[fromSlug];
  if (!node) return;
  const list = node[kind];
  if (list.includes(toSlug)) return;
  list.push(toSlug);
}

async function main() {
  console.log(`[hierarchy] loading ${RABBIS_PATH}`);
  const raw = await readFile(RABBIS_PATH, 'utf-8');
  const rabbisFile = JSON.parse(raw);

  console.log(`[hierarchy] fetching slug list from ${URL}/api/admin/rabbi-slugs`);
  const { status, json } = await fetchJson(`${URL}/api/admin/rabbi-slugs`);
  if (status !== 200) {
    console.error('Failed to fetch slug list:', json);
    process.exit(1);
  }
  let slugs = json.slugs.filter((s) => {
    const entry = rabbisFile.rabbis[s];
    return entry && entry.bio;
  });

  if (ONLY) slugs = slugs.filter((s) => s === ONLY);
  if (LIMIT) slugs = slugs.slice(0, parseInt(LIMIT, 10));

  // Build the node index up front so every slug has a stable entry (even
  // those that end up without any edges). This keeps completeness math
  // honest on the Usage page.
  const nodes = {};
  for (const [slug, entry] of Object.entries(rabbisFile.rabbis)) {
    nodes[slug] = {
      canonical: entry.canonical,
      canonicalHe: entry.canonicalHe ?? null,
      generation: entry.generation ?? 'unknown',
      region: entry.region ?? null,
      hasBio: Boolean(entry.bio),
      teachers: [],
      students: [],
      colleagues: [],
      unresolved: { teachers: [], students: [], colleagues: [] },
      processed: false,
    };
  }

  const existing = RESUME ? await loadExistingOutput() : null;
  if (existing && existing.nodes) {
    // Inherit previously-computed edges so --resume can skip already-done slugs.
    for (const [slug, prev] of Object.entries(existing.nodes)) {
      if (!nodes[slug]) continue;
      nodes[slug].teachers = prev.teachers ?? [];
      nodes[slug].students = prev.students ?? [];
      nodes[slug].colleagues = prev.colleagues ?? [];
      nodes[slug].unresolved = prev.unresolved ?? { teachers: [], students: [], colleagues: [] };
      nodes[slug].processed = prev.processed === true;
    }
    const before = slugs.length;
    slugs = slugs.filter((s) => !nodes[s]?.processed);
    console.log(`[hierarchy] --resume: ${before - slugs.length} slugs already processed, ${slugs.length} remain`);
  }

  console.log(`[hierarchy] ${slugs.length} slugs to process (concurrency=${CONCURRENCY})`);

  const errors = [];
  let done = 0;
  const total = slugs.length;
  const t0 = Date.now();
  const work = [...slugs];

  const workers = Array.from({ length: CONCURRENCY }, () => (async () => {
    while (work.length > 0) {
      const slug = work.shift();
      if (!slug) return;
      const { status, json } = await fetchJson(`${URL}/api/admin/rabbi-relationships/${encodeURIComponent(slug)}`);
      done++;
      if (status !== 200) {
        errors.push({ slug, status, error: json.error ?? json });
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.error(`[${done}/${total}] ${elapsed}s FAIL ${slug} status=${status} err=${JSON.stringify(json).slice(0, 160)}`);
        continue;
      }
      const node = nodes[slug];
      if (!node) continue;

      // Apply the subject's own edges.
      for (const kind of ['teachers', 'students', 'colleagues']) {
        for (const ref of json[kind] ?? []) {
          if (ref.slug) addEdge(nodes, slug, ref.slug, kind);
          else node.unresolved[kind].push(ref.name);
        }
      }

      // Bidirectional mirror. A's teacher B → B's students ∋ A.
      //                       A's student B → B's teachers ∋ A.
      //                       A's colleague B → B's colleagues ∋ A.
      for (const ref of json.teachers ?? []) {
        if (ref.slug && nodes[ref.slug]) addEdge(nodes, ref.slug, slug, 'students');
      }
      for (const ref of json.students ?? []) {
        if (ref.slug && nodes[ref.slug]) addEdge(nodes, ref.slug, slug, 'teachers');
      }
      for (const ref of json.colleagues ?? []) {
        if (ref.slug && nodes[ref.slug]) addEdge(nodes, ref.slug, slug, 'colleagues');
      }

      node.processed = true;

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const tCount = (json.teachers ?? []).length;
      const sCount = (json.students ?? []).length;
      const cCount = (json.colleagues ?? []).length;
      console.log(`[${done}/${total}] ${elapsed}s  ${slug.padEnd(40)} T=${tCount} S=${sCount} C=${cCount}`);

      // Checkpoint write every 25 completed slugs so long runs survive
      // interruption (crash / Ctrl-C) and --resume can pick up where we
      // left off rather than re-processing everything from scratch.
      if (!DRY_RUN && done % 25 === 0) {
        const processedSoFar = Object.values(nodes).filter((n) => n.processed).length;
        const withEdgesSoFar = Object.values(nodes).filter((n) =>
          n.teachers.length || n.students.length || n.colleagues.length
        ).length;
        const checkpoint = {
          generatedAt: new Date().toISOString(),
          source: `${URL}/api/admin/rabbi-relationships`,
          totalNodes: Object.keys(nodes).length,
          processedNodes: processedSoFar,
          nodesWithEdges: withEdgesSoFar,
          nodes,
        };
        await writeFile(OUT_PATH, JSON.stringify(checkpoint, null, 2) + '\n', 'utf-8');
        console.log(`[hierarchy] checkpoint: ${processedSoFar} processed, ${withEdgesSoFar} with edges`);
      }
    }
  })());

  await Promise.all(workers);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const processedCount = Object.values(nodes).filter((n) => n.processed).length;
  const withEdges = Object.values(nodes).filter((n) =>
    n.teachers.length || n.students.length || n.colleagues.length
  ).length;
  console.log(`\n[hierarchy] complete in ${elapsed}s`);
  console.log(`[hierarchy]   processed: ${processedCount} / ${Object.keys(nodes).length}`);
  console.log(`[hierarchy]   with edges: ${withEdges} / ${Object.keys(nodes).length}`);
  console.log(`[hierarchy]   errors: ${errors.length}`);

  if (errors.length && errors.length < 40) {
    console.log('\n[hierarchy] errors:');
    for (const e of errors) console.log(`  ${e.slug}: ${e.error}`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: `${URL}/api/admin/rabbi-relationships`,
    totalNodes: Object.keys(nodes).length,
    processedNodes: processedCount,
    nodesWithEdges: withEdges,
    nodes,
  };

  if (DRY_RUN) {
    console.log('[hierarchy] --dry-run — NOT writing file');
    return;
  }
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
  console.log(`[hierarchy] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[hierarchy] fatal:', err);
  process.exit(1);
});
