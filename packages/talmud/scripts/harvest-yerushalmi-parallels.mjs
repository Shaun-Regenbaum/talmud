#!/usr/bin/env node
/**
 * Harvest curated Bavli<->Yerushalmi parallels into a static dataset.
 *
 * Source: Sefaria's editorial collection "'The Talmud says': Shared Stories in
 * the Babylonian and Jerusalem Talmuds" — hand-curated story parallels that the
 * mishnah-mapping can't find (they're cross-tractate, e.g. Bavli Bava Metzia <->
 * Yerushalmi Moed Katan). Sefaria's link graph does NOT expose Bavli<->Yerushalmi
 * parallels (verified: /api/related on Bava Metzia 59a returns zero), so this
 * curated collection is the only Sefaria-side cross-Talmud data.
 *
 * Each collection sheet pairs one Bavli ref with one Yerushalmi ref plus an
 * editorial title + summary. We freeze the result to JSON so the app has no
 * runtime dependency on Sefaria for the curated list; re-run to refresh or grow.
 *
 *   node scripts/harvest-yerushalmi-parallels.mjs
 *
 * Writes src/lib/data/curated-yerushalmi-parallels.json.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COLLECTION_SLUG = 'the-talmud-says-shared-stories-in-the-babylonian-and-jerusalem-talmuds';
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'lib',
  'data',
  'curated-yerushalmi-parallels.json',
);

const strip = (s) =>
  (s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const isYerushalmi = (r) => r.startsWith('Jerusalem Talmud') || r.includes('Yerushalmi');

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function main() {
  const col = await getJson(`https://www.sefaria.org/api/collections/${COLLECTION_SLUG}`);
  const sheets = (col.collection ?? col).sheets ?? [];
  const parallels = [];
  for (const meta of sheets) {
    const sheet = await getJson(`https://www.sefaria.org/api/sheets/${meta.id}`);
    const refs = (sheet.sources ?? []).map((s) => s.ref).filter(Boolean);
    const yer = refs.find(isYerushalmi);
    const bav = refs.find((r) => !isYerushalmi(r));
    if (!yer || !bav) {
      console.warn(`  skip sheet ${meta.id} (${strip(sheet.title)}): refs=${JSON.stringify(refs)}`);
      continue;
    }
    parallels.push({
      bavli: bav,
      yerushalmi: yer,
      title: strip(sheet.title),
      summary: strip(sheet.summary),
      sheetId: meta.id,
      url: `https://www.sefaria.org/sheets/${meta.id}`,
    });
    console.log(`  + ${bav}  <->  ${yer}  (${strip(sheet.title)})`);
  }
  parallels.sort((a, b) => a.bavli.localeCompare(b.bavli));
  const out = {
    source:
      '"The Talmud says": Shared Stories in the Babylonian and Jerusalem Talmuds (Sefaria editorial collection)',
    sourceUrl: `https://www.sefaria.org/collections/${COLLECTION_SLUG}`,
    license: 'Sefaria sheets — CC-BY (see Sefaria terms)',
    count: parallels.length,
    parallels,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote ${parallels.length} parallels -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
