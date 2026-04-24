#!/usr/bin/env node
// scripts/annotate-bio-provenance.mjs
//
// Git-archaeology one-shot: read src/lib/data/rabbi-places.json at the
// pre-wiki-scrape snapshot (parent of commit ce23b22) and the current
// snapshot, then tag each entry's bioSource:
//
//   'sefaria'    — present pre-scrape with a bio AND bio is unchanged
//   'wikipedia'  — not present pre-scrape (added by the scrape)
//   'both'       — present pre-scrape with a bio but bio text changed
//                  (scrape enriched the existing entry)
//
// Writes the tagged file back to src/lib/data/rabbi-places.json. No AI
// call, no worker hit — pure local git + diff. Run once.
//
// Usage:
//   node scripts/annotate-bio-provenance.mjs
//   node scripts/annotate-bio-provenance.mjs --dry-run
//   node scripts/annotate-bio-provenance.mjs --base <commit>   (default ce23b22^)

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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
const DRY_RUN = getFlag('--dry-run');
const BASE = getArg('--base', 'ce23b22^');

function readPreScrape() {
  // `git show <rev>:path` prints the file content at that rev.
  const raw = execFileSync('git', ['show', `${BASE}:src/lib/data/rabbi-places.json`], {
    cwd: join(__dirname, '..'),
    maxBuffer: 64 * 1024 * 1024,
  }).toString('utf-8');
  return JSON.parse(raw);
}

async function main() {
  console.log(`[provenance] reading current ${DATA_PATH}`);
  const current = JSON.parse(await readFile(DATA_PATH, 'utf-8'));
  console.log(`[provenance] reading pre-scrape snapshot at ${BASE}`);
  const pre = readPreScrape();

  let sefaria = 0, wiki = 0, both = 0, changed = 0;
  for (const [slug, entry] of Object.entries(current.rabbis)) {
    const prev = pre.rabbis?.[slug];
    let source;
    if (!prev) {
      source = 'wikipedia';
      wiki++;
    } else if (!prev.bio) {
      // Present pre-scrape but without a bio — scrape added the bio
      source = entry.bio ? 'wikipedia' : null;
      if (source) wiki++;
    } else if (prev.bio === entry.bio) {
      source = 'sefaria';
      sefaria++;
    } else {
      source = 'both';
      both++;
    }
    if (source && entry.bioSource !== source) {
      entry.bioSource = source;
      changed++;
    }
  }

  console.log(`[provenance] classification:`);
  console.log(`  sefaria   : ${sefaria}`);
  console.log(`  wikipedia : ${wiki}`);
  console.log(`  both      : ${both}`);
  console.log(`  total     : ${sefaria + wiki + both} / ${Object.keys(current.rabbis).length}`);
  console.log(`[provenance] ${changed} entries gained or changed bioSource`);

  if (DRY_RUN) {
    console.log('[provenance] --dry-run — NOT writing file');
    return;
  }
  current.generatedAt = new Date().toISOString();
  await writeFile(DATA_PATH, JSON.stringify(current, null, 2) + '\n', 'utf-8');
  console.log(`[provenance] wrote ${DATA_PATH}`);
}

main().catch((err) => {
  console.error('[provenance] fatal:', err);
  process.exit(1);
});
