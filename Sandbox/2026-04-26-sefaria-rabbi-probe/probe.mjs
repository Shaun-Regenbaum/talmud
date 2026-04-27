import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const SAMPLE = [
  'rabbi-yochanan-b-napacha',
  'rabbi-akiva',
  'hillel',
  'rava',
  'shimon-bar-yochai',
  'abaye',
  'rabbi-yose-b-chalafta',
  'yehudah-b-tema',
  'rav-ashi',
  'rav-rechumi-iii',
  'shifrah-and-puah1',
  'etrog',
];

const places = JSON.parse(
  await readFile(join(repoRoot, 'src/lib/data/rabbi-places.json'), 'utf8')
);

async function fetchTopic(slug) {
  const url = `https://www.sefaria.org/api/topics/${slug}?with_links=1&with_refs=0`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: await res.json() };
}

function bucket(links, predicate) {
  const entries = links?.[predicate]?.links;
  return Array.isArray(entries) ? entries : [];
}

function countLinks(links, predicate) {
  return bucket(links, predicate).length;
}

function topByTfidf(links, predicate) {
  const entries = bucket(links, predicate);
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => (b?.order?.tfidf ?? 0) - (a?.order?.tfidf ?? 0));
  return sorted[0]?.topic ?? null;
}

const rows = [];
for (const slug of SAMPLE) {
  const local = places.rabbis[slug];
  const localCanonical = local?.canonical ?? '(not in local list)';
  const r = await fetchTopic(slug);
  if (!r.ok) {
    rows.push({
      slug,
      localCanonical,
      sefariaHit: false,
      status: r.status,
      subclass: null,
      generation: null,
      numSources: null,
      titlesCount: null,
      learnedFrom: null,
      taught: null,
      family: null,
      memberOf: null,
      relatedTo: null,
      primaryTeacher: null,
      primaryStudent: null,
    });
    continue;
  }
  const t = r.data;
  const links = t.links ?? [];
  rows.push({
    slug,
    localCanonical,
    sefariaHit: true,
    status: 200,
    subclass: t.subclass ?? null,
    generation: t?.properties?.generation?.value ?? t?.properties?.generation ?? null,
    numSources: t.numSources ?? null,
    titlesCount: Array.isArray(t.titles) ? t.titles.length : null,
    learnedFrom: countLinks(links, 'learned-from'),
    taught: countLinks(links, 'taught'),
    family:
      countLinks(links, 'child-in-law-of') +
      countLinks(links, 'child-of') +
      countLinks(links, 'parent-of') +
      countLinks(links, 'sibling-of') +
      countLinks(links, 'spouse-of') +
      countLinks(links, 'grandchild-of') +
      countLinks(links, 'grandparent-of') +
      countLinks(links, 'family-of'),
    memberOf: countLinks(links, 'member-of'),
    relatedTo: countLinks(links, 'related-to'),
    primaryTeacher: topByTfidf(links, 'learned-from'),
    primaryStudent: topByTfidf(links, 'taught'),
  });
  await new Promise((r) => setTimeout(r, 250));
}

const allLinkTypes = new Set();
for (const slug of SAMPLE) {
  const r = await fetchTopic(slug);
  if (!r.ok) continue;
  for (const k of Object.keys(r.data.links ?? {})) allLinkTypes.add(k);
}

console.log('\n=== JOIN QUALITY ===');
console.log(
  ['slug', 'sefaria', 'subclass', 'generation', 'numSources', 'titles', 'teachers', 'students', 'family', 'related', 'member']
    .map((s) => s.padEnd(28))
    .join('')
);
for (const r of rows) {
  console.log(
    [
      r.slug,
      r.sefariaHit ? 'OK' : `${r.status}`,
      r.subclass ?? '-',
      r.generation ?? '-',
      r.numSources ?? '-',
      r.titlesCount ?? '-',
      r.learnedFrom ?? '-',
      r.taught ?? '-',
      r.family ?? '-',
      r.relatedTo ?? '-',
      r.memberOf ?? '-',
    ]
      .map((v) => String(v).padEnd(28))
      .join('')
  );
}

console.log('\n=== PRIMARY TEACHER / STUDENT (highest tfidf) ===');
for (const r of rows) {
  if (!r.sefariaHit) continue;
  console.log(`${r.slug.padEnd(30)} teacher=${(r.primaryTeacher ?? '-').padEnd(30)} student=${r.primaryStudent ?? '-'}`);
}

console.log('\n=== ALL LINK TYPES SEEN IN SAMPLE ===');
console.log([...allLinkTypes].sort().join(', '));
