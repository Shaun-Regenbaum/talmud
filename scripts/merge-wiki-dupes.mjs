#!/usr/bin/env node
// scripts/merge-wiki-dupes.mjs
//
// Companion cleanup for scrape-wikipedia-rabbis.mjs. The scraper uses
// normalizeHeForResolve() to match a Wikipedia title against the existing
// rabbi dataset, which strips nikkud and punctuation but does NOT expand
// title prefixes — so `רַ' אַבָּהוּ` (normalized to `ר אבהו`) fails to match
// Wikipedia's `רבי אבהו`, causing a duplicate entry (`rabbi-abbahu` vs
// pre-existing `rabbi-abahu`).
//
// This script scans for those title-prefix duplicates and folds the new
// Wikipedia data into the pre-existing slug, then deletes the new slug.
//
//   node scripts/merge-wiki-dupes.mjs           # merge
//   node scripts/merge-wiki-dupes.mjs --dry-run # preview only

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'src', 'lib', 'data', 'rabbi-places.json');
const DRY_RUN = process.argv.includes('--dry-run');

// Manually vetted merges. Each entry: { from: slug-to-delete, into:
// slug-to-keep }. The `from` slug's wiki/generation/bio/aliases are folded
// into `into`, and aliasIndex keys pointing at `from` are repointed.
//
// Auto-detection via normalized-Hebrew matching (ר X ≡ רבי X) produced too
// many false positives — Sefaria treats several near-homographs as distinct
// rabbis on purpose (Rav Avahu ≠ Rabbi Abahu; Yehudah b. Betera I ≠ II; Hallel
// the prayer ≠ Hillel the Elder). Human review keeps this conservative.
const MERGES = [
  // Wikipedia-scraped duplicates caused by the scraper treating `ר' X`
  // (normalized `ר X`) as distinct from `רבי X`. Same rabbi in each case.
  { from: 'rabbi-abbahu',             into: 'rabbi-abahu'              },
  { from: 'rabbi-yosei-b-hanina',     into: 'rabbi-yose-b-chanina'     },
  { from: 'rabbi-yosei-hagelili',     into: 'rabbi-yose-hagelili'      },
  { from: 'rabbi-yochanan-hasandlar', into: 'rabbi-yohanan-hasandlar'  },
];

const raw = await readFile(DATA_PATH, 'utf-8');
const data = JSON.parse(raw);
const rabbis = data.rabbis;

const merges = [];
for (const { from, into } of MERGES) {
  if (!rabbis[from]) { console.log(`[merge] skip: ${from} not found`); continue; }
  if (!rabbis[into]) { console.log(`[merge] skip: ${into} not found`); continue; }
  merges.push({ newSlug: from, oldSlug: into });
}

if (!merges.length) {
  console.log('[merge] no title-prefix duplicates found');
  process.exit(0);
}

console.log(`[merge] ${merges.length} duplicate pair(s) found:`);
for (const { newSlug, oldSlug } of merges) {
  const n = rabbis[newSlug], o = rabbis[oldSlug];
  console.log(`  ${oldSlug.padEnd(40)} ← ${newSlug.padEnd(40)} (${n.canonicalHe} ≈ ${o.canonicalHe})`);
}

if (DRY_RUN) {
  console.log('[merge] --dry-run — NOT writing file');
  process.exit(0);
}

for (const { newSlug, oldSlug } of merges) {
  const newE = rabbis[newSlug];
  const oldE = rabbis[oldSlug];
  // Transfer Wikipedia fields into the pre-existing slug.
  if (!oldE.wiki)        oldE.wiki = newE.wiki;
  if (!oldE.generation)  oldE.generation = newE.generation;
  if (!oldE.region)      oldE.region = newE.region;
  if (!oldE.bio || oldE.bio.length < 50) oldE.bio = newE.bio;
  // Merge aliases (old canonical + new aliases + new canonical).
  const merged = new Set([...(oldE.aliases ?? []), newE.canonical, ...(newE.aliases ?? [])]);
  merged.delete(oldE.canonical);
  oldE.aliases = [...merged].slice(0, 15);
  // aliasIndex: repoint any keys that point at the new slug.
  for (const [k, v] of Object.entries(data.aliasIndex)) {
    if (v === newSlug) data.aliasIndex[k] = oldSlug;
  }
  // Add the new canonical name as an alias key if missing.
  const aliasKey = newE.canonical.toLowerCase();
  if (!data.aliasIndex[aliasKey]) data.aliasIndex[aliasKey] = oldSlug;
  // Drop the duplicate.
  delete rabbis[newSlug];
}

data.generatedAt = new Date().toISOString();
await writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
console.log(`[merge] wrote ${DATA_PATH} — removed ${merges.length} duplicate entries`);
