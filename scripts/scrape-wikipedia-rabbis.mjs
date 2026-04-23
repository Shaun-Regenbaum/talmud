#!/usr/bin/env node
// scripts/scrape-wikipedia-rabbis.mjs
//
// Crawls Hebrew Wikipedia's Tanna/Amora generation categories, fetches the
// lead-paragraph extract for each rabbi page, asks Kimi (via the local dev
// worker's /api/admin/translate-bio endpoint) for a canonical English name
// and an English bio summary, then merges the result into
// src/lib/data/rabbi-places.json — adding new rabbis and filling wiki /
// generation / bio on existing ones.
//
// Usage:
//   pnpm dev                                                                   # worker on :5173
//   node scripts/scrape-wikipedia-rabbis.mjs                                   # full scrape
//   node scripts/scrape-wikipedia-rabbis.mjs --category "הדור השני לאמוראי ארץ ישראל"
//   node scripts/scrape-wikipedia-rabbis.mjs --limit 5 --dry-run               # quick check
//   node scripts/scrape-wikipedia-rabbis.mjs --force                           # overwrite populated fields
//   node scripts/scrape-wikipedia-rabbis.mjs --url https://...                 # different worker
//
// Raw MediaWiki responses are cached under scripts/.cache/wikipedia/ so
// re-runs are cheap and idempotent.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'src', 'lib', 'data', 'rabbi-places.json');
const CACHE_DIR = join(__dirname, '.cache', 'wikipedia');

const USER_AGENT = 'talmud-viewer/0.1 (https://github.com/shaunregenbaum/talmud; shaunregenbaum@gmail.com)';
const WIKI_API = 'https://he.wikipedia.org/w/api.php';

// Generation categories — Hebrew Wikipedia's titles map 1:1 to our generation
// IDs. Order matters: when a rabbi appears in multiple categories, the FIRST
// one wins (earliest generation). So keep tanna-1 before tanna-2, etc.
const GENERATION_CATEGORIES = {
  'זוגות':                             'zugim',
  'הדור הראשון לתנאים':                'tanna-1',
  'הדור השני לתנאים':                  'tanna-2',
  'הדור השלישי לתנאים':                'tanna-3',
  'הדור הרביעי לתנאים':                'tanna-4',
  'הדור החמישי לתנאים':                'tanna-5',
  'הדור השישי לתנאים':                 'tanna-6',
  'הדור הראשון לאמוראי ארץ ישראל':     'amora-ey-1',
  'הדור השני לאמוראי ארץ ישראל':       'amora-ey-2',
  'הדור השלישי לאמוראי ארץ ישראל':     'amora-ey-3',
  'הדור הרביעי לאמוראי ארץ ישראל':     'amora-ey-4',
  'הדור החמישי לאמוראי ארץ ישראל':     'amora-ey-5',
  'הדור הראשון לאמוראי בבל':           'amora-bavel-1',
  'הדור השני לאמוראי בבל':             'amora-bavel-2',
  'הדור השלישי לאמוראי בבל':           'amora-bavel-3',
  'הדור הרביעי לאמוראי בבל':           'amora-bavel-4',
  'הדור החמישי לאמוראי בבל':           'amora-bavel-5',
  'הדור השישי לאמוראי בבל':            'amora-bavel-6',
  'הדור השביעי לאמוראי בבל':           'amora-bavel-7',
  'הדור השמיני לאמוראי בבל':           'amora-bavel-8',
  'סבוראים':                           'savora',
};

// Non-article pages that leak into category listings.
const SKIP_TITLE_PREFIXES = ['קטגוריה:', 'תבנית:', 'פורטל:', 'ויקיפדיה:', 'מיון:'];
const SKIP_TITLE_CONTAINS  = ['רשימת '];

// --- args ---------------------------------------------------------------

const args = process.argv.slice(2);
const getFlag = (name) => args.includes(name);
const getArg  = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const URL_BASE   = getArg('--url', 'http://localhost:5173');
const ONLY_CAT   = getArg('--category', null);
const LIMIT      = parseInt(getArg('--limit', '0'), 10) || 0;
const DRY_RUN    = getFlag('--dry-run');
const FORCE      = getFlag('--force');

// --- helpers ------------------------------------------------------------

// Mirror of src/worker/index.ts normalizeHeForResolve. Keep in sync.
function normalizeHeForResolve(s) {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cacheKey(title) {
  return title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 120);
}

async function readCache(name) {
  const path = join(CACHE_DIR, name);
  if (!existsSync(path)) return null;
  try { return JSON.parse(await readFile(path, 'utf-8')); }
  catch { return null; }
}

async function writeCache(name, value) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(join(CACHE_DIR, name), JSON.stringify(value), 'utf-8');
}

async function wikiApi(params, cacheName) {
  if (cacheName) {
    const hit = await readCache(cacheName);
    if (hit !== null) return hit;
  }
  const qs = new URLSearchParams({ ...params, format: 'json', formatversion: '2' });
  const url = `${WIKI_API}?${qs.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`wiki ${res.status}: ${url}`);
  const json = await res.json();
  if (cacheName) await writeCache(cacheName, json);
  return json;
}

async function listCategoryMembers(category) {
  const titles = [];
  let cmcontinue = null;
  let page = 0;
  while (true) {
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `קטגוריה:${category}`,
      cmlimit: '500',
      cmtype: 'page',
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const cacheName = `cat_${cacheKey(category)}_${page}.json`;
    const json = await wikiApi(params, cacheName);
    const members = json?.query?.categorymembers ?? [];
    for (const m of members) {
      if (!m.title) continue;
      if (SKIP_TITLE_PREFIXES.some((p) => m.title.startsWith(p))) continue;
      if (SKIP_TITLE_CONTAINS.some((p) => m.title.includes(p))) continue;
      titles.push(m.title);
    }
    cmcontinue = json?.continue?.cmcontinue;
    page++;
    if (!cmcontinue) break;
  }
  return titles;
}

async function fetchExtract(title) {
  const params = {
    action: 'query',
    prop: 'extracts|info',
    exintro: '1',
    explaintext: '1',
    exsectionformat: 'plain',
    redirects: '1',
    inprop: 'url',
    titles: title,
  };
  const json = await wikiApi(params, `page_${cacheKey(title)}.json`);
  const page = json?.query?.pages?.[0];
  if (!page || page.missing) return null;
  return {
    title: page.title,
    extract: page.extract ?? '',
    url: page.fullurl ?? `https://he.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
  };
}

async function translateBio({ hebrewBio, nameHe, nameEn }) {
  const res = await fetch(`${URL_BASE}/api/admin/translate-bio`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hebrewBio, nameHe, nameEn }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { return { ok: false, error: `non-JSON response (${res.status}): ${text.slice(0, 200)}` }; }
  if (res.status !== 200) return { ok: false, error: json.error ?? `status ${res.status}` };
  return { ok: true, data: json };
}

function pickUniqueSlug(base, existing) {
  if (!existing.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error(`cannot find unique slug for ${base}`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// --- main ---------------------------------------------------------------

async function main() {
  console.log(`[wiki] loading ${DATA_PATH}`);
  const raw = await readFile(DATA_PATH, 'utf-8');
  const data = JSON.parse(raw);

  // Reverse index: normalized-Hebrew → existing slug (for match-and-update).
  const byHe = new Map();
  for (const [slug, r] of Object.entries(data.rabbis)) {
    if (!r.canonicalHe) continue;
    const key = normalizeHeForResolve(r.canonicalHe);
    if (key && !byHe.has(key)) byHe.set(key, slug);
  }

  const existingSlugs = new Set(Object.keys(data.rabbis));

  const categories = ONLY_CAT
    ? { [ONLY_CAT]: GENERATION_CATEGORIES[ONLY_CAT] ?? 'unknown' }
    : GENERATION_CATEGORIES;

  if (ONLY_CAT && !GENERATION_CATEGORIES[ONLY_CAT]) {
    console.warn(`[wiki] warning: category "${ONLY_CAT}" is not in the generation map; generation will be 'unknown'`);
  }

  // Collect (title, generation) pairs. First-seen generation wins (earliest
  // per the category map order).
  const pageToGen = new Map();
  for (const [category, gen] of Object.entries(categories)) {
    let titles;
    try { titles = await listCategoryMembers(category); }
    catch (err) { console.warn(`[wiki] skip category ${category}: ${err.message}`); continue; }
    console.log(`[wiki] ${category.padEnd(40)} → ${gen.padEnd(14)} (${titles.length} pages)`);
    for (const t of titles) {
      if (!pageToGen.has(t)) pageToGen.set(t, { generation: gen, category });
    }
  }

  let queue = Array.from(pageToGen.entries()).map(([title, meta]) => ({ title, ...meta }));
  if (LIMIT > 0) queue = queue.slice(0, LIMIT);
  console.log(`[wiki] ${queue.length} unique pages to process\n`);

  let added = 0, updated = 0, skipped = 0, failed = 0;
  const newEntries = [];
  const updates = [];
  const t0 = Date.now();

  for (let i = 0; i < queue.length; i++) {
    const { title, generation } = queue[i];
    const progress = `[${i + 1}/${queue.length}]`;

    const page = await fetchExtract(title);
    if (!page || !page.extract || page.extract.length < 40) {
      skipped++;
      console.log(`${progress} SKIP ${title} (no extract)`);
      continue;
    }

    const he = page.title;
    const heNorm = normalizeHeForResolve(he);
    const matchedSlug = byHe.get(heNorm) ?? null;

    // Translate via Kimi.
    const t = await translateBio({ hebrewBio: page.extract, nameHe: he, nameEn: matchedSlug ? data.rabbis[matchedSlug].canonical : undefined });
    if (!t.ok) {
      failed++;
      console.log(`${progress} FAIL ${title}: ${t.error}`);
      continue;
    }
    const { canonicalEn, bioEn, aliases } = t.data;
    if (!canonicalEn || !bioEn) {
      skipped++;
      console.log(`${progress} SKIP ${title} (not a rabbi per Kimi)`);
      continue;
    }

    if (matchedSlug) {
      const entry = data.rabbis[matchedSlug];
      const patch = {};
      if ((FORCE || !entry.wiki) && page.url) patch.wiki = page.url;
      if (FORCE || entry.generation == null) patch.generation = generation;
      if (FORCE || !entry.bio || entry.bio.length < 50) patch.bio = bioEn.slice(0, 800);
      if (Object.keys(patch).length > 0) {
        updated++;
        updates.push({ slug: matchedSlug, canonical: entry.canonical, patch });
        Object.assign(entry, patch);
        console.log(`${progress} UPD  ${matchedSlug.padEnd(40)} ${Object.keys(patch).join(',')}`);
      } else {
        console.log(`${progress} ==   ${matchedSlug} (already populated)`);
      }
    } else {
      const baseSlug = slugify(canonicalEn);
      if (!baseSlug) {
        skipped++;
        console.log(`${progress} SKIP ${title} (empty slug from "${canonicalEn}")`);
        continue;
      }
      const slug = pickUniqueSlug(baseSlug, existingSlugs);
      existingSlugs.add(slug);
      const region = deriveRegionFromGeneration(generation);
      const newEntry = {
        canonical:    canonicalEn,
        canonicalHe:  he,
        aliases:      Array.from(new Set(aliases.filter((a) => a && a !== canonicalEn))).slice(0, 10),
        places:       [],
        region:       region,
        numSources:   null,
        generation:   generation,
        moved:        null,
        bio:          bioEn.slice(0, 800),
        image:        null,
        wiki:         page.url,
      };
      data.rabbis[slug] = newEntry;
      byHe.set(heNorm, slug);
      // Update aliasIndex too so the Sefaria-style English-name resolver picks it up.
      const allAliases = [canonicalEn, ...newEntry.aliases];
      for (const a of allAliases) {
        const key = a.toLowerCase();
        if (!data.aliasIndex[key]) data.aliasIndex[key] = slug;
      }
      added++;
      newEntries.push({ slug, canonical: canonicalEn, he });
      console.log(`${progress} ADD  ${slug.padEnd(40)} ${canonicalEn}  (${generation})`);
    }

    // Be polite to the Wikipedia API. The translate-bio call itself takes
    // several seconds, so this rarely kicks in.
    await sleep(50);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[wiki] done in ${elapsed}s — ${added} added, ${updated} updated, ${skipped} skipped, ${failed} failed`);

  if (newEntries.length > 0) {
    console.log('\n[wiki] new rabbis:');
    for (const n of newEntries.slice(0, 30)) {
      console.log(`  ${n.slug.padEnd(40)} ${n.canonical}   (${n.he})`);
    }
    if (newEntries.length > 30) console.log(`  ... and ${newEntries.length - 30} more`);
  }

  if (DRY_RUN) {
    console.log('\n[wiki] --dry-run — NOT writing file');
    return;
  }
  if (added === 0 && updated === 0) {
    console.log('[wiki] no changes to write');
    return;
  }
  data.generatedAt = new Date().toISOString();
  data.source = data.source ?? 'Sefaria /api/topics?type=person';
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`[wiki] wrote ${DATA_PATH}`);
}

// Mirror of src/worker/index.ts deriveRegionFromGeneration.
function deriveRegionFromGeneration(g) {
  if (!g) return null;
  if (g.startsWith('amora-ey') || g.startsWith('tanna') || g === 'zugim') return 'israel';
  if (g.startsWith('amora-bavel') || g === 'savora') return 'bavel';
  return null;
}

main().catch((err) => {
  console.error('[wiki] fatal:', err);
  process.exit(1);
});
