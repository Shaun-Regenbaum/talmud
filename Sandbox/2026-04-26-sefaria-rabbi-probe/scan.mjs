import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const cacheDir = join(here, 'cache');
await mkdir(cacheDir, { recursive: true });

const places = JSON.parse(
  await readFile(join(repoRoot, 'src/lib/data/rabbi-places.json'), 'utf8')
);
const slugs = Object.keys(places.rabbis);
console.log(`scanning ${slugs.length} rabbis`);

const FAMILY_PREDICATES = [
  'child-in-law-of',
  'child-of',
  'parent-of',
  'sibling-of',
  'spouse-of',
  'family-of',
  'grandparent-of',
  'grandchild-of',
  'ancestor-of',
  'descendant-of',
];

async function fetchTopic(slug) {
  const cacheFile = join(cacheDir, `${encodeURIComponent(slug)}.json`);
  try {
    await stat(cacheFile);
    const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
    return cached;
  } catch {}
  const url = `https://www.sefaria.org/api/topics/${slug}?with_links=1&with_refs=0`;
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (res.status === 404) {
        const out = { ok: false, status: 404 };
        await writeFile(cacheFile, JSON.stringify(out));
        return out;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      const out = { ok: true, status: 200, data };
      await writeFile(cacheFile, JSON.stringify(out));
      return out;
    } catch (e) {
      attempt += 1;
      if (attempt >= 4) {
        const out = { ok: false, status: 'error', error: String(e) };
        await writeFile(cacheFile, JSON.stringify(out));
        return out;
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

function bucket(links, predicate) {
  const entries = links?.[predicate]?.links;
  return Array.isArray(entries) ? entries : [];
}

const results = [];
let i = 0;
const start = Date.now();
for (const slug of slugs) {
  i += 1;
  const r = await fetchTopic(slug);
  const local = places.rabbis[slug];
  if (!r.ok) {
    results.push({
      slug,
      sefariaStatus: r.status,
      localBioSource: local?.bioSource ?? null,
      localGeneration: local?.generation ?? null,
    });
  } else {
    const t = r.data;
    const links = t.links ?? {};
    const familyCount = FAMILY_PREDICATES.reduce((acc, p) => acc + bucket(links, p).length, 0);
    results.push({
      slug,
      sefariaStatus: 200,
      localBioSource: local?.bioSource ?? null,
      localGeneration: local?.generation ?? null,
      sefariaSubclass: t.subclass ?? null,
      sefariaGeneration: t?.properties?.generation?.value ?? null,
      sefariaNumSources: t.numSources ?? null,
      sefariaTitlesCount: Array.isArray(t.titles) ? t.titles.length : 0,
      sefariaHasDescription: !!(t.description?.en || t.description?.he),
      hasJeLink: !!(t?.properties?.enWikiLink || t?.properties?.jeLink),
      teachersCount: bucket(links, 'learned-from').length,
      studentsCount: bucket(links, 'taught').length,
      familyCount,
      opposedCount: bucket(links, 'opposed').length,
      correspondedCount: bucket(links, 'corresponded-with').length,
      memberOfCount: bucket(links, 'member-of').length,
      relatedToCount: bucket(links, 'related-to').length,
      linkTypes: Object.keys(links).sort(),
    });
  }

  if (i % 50 === 0 || i === slugs.length) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  [${i}/${slugs.length}] elapsed=${elapsed}s`);
  }
  // throttle only when not cached (cache hits don't hit network)
  // simple flat sleep is fine since cached calls are fast anyway
  await new Promise((r) => setTimeout(r, 120));
}

await writeFile(join(here, 'coverage.json'), JSON.stringify(results, null, 2));

const isPerson = (r) => r.sefariaStatus === 200 && r.sefariaSubclass === 'person';
const hasGen = (r) => isPerson(r) && !!r.sefariaGeneration;
const hasEdges = (r) => (r.teachersCount ?? 0) + (r.studentsCount ?? 0) > 0;
const hasFamily = (r) => (r.familyCount ?? 0) > 0;
const hasOpposed = (r) => (r.opposedCount ?? 0) > 0;
const hasCorresp = (r) => (r.correspondedCount ?? 0) > 0;

const summary = {
  total: results.length,
  sefaria_200: results.filter((r) => r.sefariaStatus === 200).length,
  sefaria_404: results.filter((r) => r.sefariaStatus === 404).length,
  sefaria_error: results.filter((r) => r.sefariaStatus !== 200 && r.sefariaStatus !== 404).length,
  subclass_person: results.filter(isPerson).length,
  has_generation: results.filter(hasGen).length,
  has_any_edges: results.filter(hasEdges).length,
  has_family_edges: results.filter(hasFamily).length,
  has_opposed_edges: results.filter(hasOpposed).length,
  has_corresponded_edges: results.filter(hasCorresp).length,
  buckets: {
    full: results.filter((r) => isPerson(r) && hasGen(r) && hasEdges(r)).length,
    person_with_gen_no_edges: results.filter((r) => isPerson(r) && hasGen(r) && !hasEdges(r)).length,
    person_no_gen: results.filter((r) => isPerson(r) && !hasGen(r)).length,
    not_person: results.filter((r) => r.sefariaStatus === 200 && r.sefariaSubclass !== 'person').length,
    not_in_sefaria: results.filter((r) => r.sefariaStatus !== 200).length,
  },
  by_local_bio_source: {
    sefaria: results.filter((r) => r.localBioSource === 'sefaria').length,
    wikipedia: results.filter((r) => r.localBioSource === 'wikipedia').length,
    other: results.filter((r) => r.localBioSource && r.localBioSource !== 'sefaria' && r.localBioSource !== 'wikipedia').length,
  },
  cross_tab_wikipedia_bio_x_sefaria_edges: {
    wiki_bio_with_sefaria_edges: results.filter((r) => r.localBioSource === 'wikipedia' && hasEdges(r)).length,
    wiki_bio_no_sefaria_edges: results.filter((r) => r.localBioSource === 'wikipedia' && !hasEdges(r)).length,
    sefaria_bio_with_sefaria_edges: results.filter((r) => r.localBioSource === 'sefaria' && hasEdges(r)).length,
    sefaria_bio_no_sefaria_edges: results.filter((r) => r.localBioSource === 'sefaria' && !hasEdges(r)).length,
  },
  numSources_distribution: (() => {
    const ns = results.map((r) => r.sefariaNumSources).filter((x) => typeof x === 'number');
    ns.sort((a, b) => a - b);
    const pct = (p) => ns[Math.floor((ns.length - 1) * p)];
    return {
      n: ns.length,
      min: ns[0],
      p25: pct(0.25),
      p50: pct(0.5),
      p75: pct(0.75),
      p90: pct(0.9),
      p99: pct(0.99),
      max: ns[ns.length - 1],
    };
  })(),
  link_type_universe: (() => {
    const all = new Map();
    for (const r of results) {
      for (const t of r.linkTypes ?? []) all.set(t, (all.get(t) ?? 0) + 1);
    }
    return Object.fromEntries([...all.entries()].sort((a, b) => b[1] - a[1]));
  })(),
};

await writeFile(join(here, 'coverage-summary.json'), JSON.stringify(summary, null, 2));

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
