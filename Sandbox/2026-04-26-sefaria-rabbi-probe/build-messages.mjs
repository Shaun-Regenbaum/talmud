// Build the {system, user} messages for both test sages, write to messages.json
// so we can pass them to the CF MCP execute tool.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const promptModuleUrl = new URL('file://' + join(repoRoot, 'src/lib/rabbi/prompt.ts'));
// Can't import .ts directly in Node — re-implement the mapping here, or use tsx.
// Simpler: load the inputs we already wrote, replicate the worker's helpers inline.

const inputs = JSON.parse(await readFile(join(here, 'inputs.json'), 'utf8'));

// Pull system prompt directly from the .ts source via regex (cheap & avoids tsx).
const promptSrc = await readFile(join(repoRoot, 'src/lib/rabbi/prompt.ts'), 'utf8');
const sysMatch = promptSrc.match(/RABBI_ENRICH_SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;/);
if (!sysMatch) throw new Error('could not extract system prompt');
const SYSTEM = sysMatch[1].replace(/\\`/g, '`');

function unwrapPropertyValue(p) {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && 'value' in p) {
    const v = p.value;
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

function mapSefaria(raw) {
  if (!raw) return null;
  const titles = (raw.titles ?? [])
    .filter((t) => typeof t.text === 'string' && (t.lang === 'en' || t.lang === 'he'))
    .map((t) => ({ text: t.text, lang: t.lang }));
  const refs = {};
  const enWiki = unwrapPropertyValue(raw.properties?.enWikiLink);
  const heWiki = unwrapPropertyValue(raw.properties?.heWikiLink);
  const je = unwrapPropertyValue(raw.properties?.jeLink);
  const wikidata = unwrapPropertyValue(raw.properties?.wikidataLink);
  if (enWiki) refs.enWiki = enWiki;
  if (heWiki) refs.heWiki = heWiki;
  if (je) refs.je = je;
  if (wikidata) refs.wikidata = wikidata;
  const image = raw.image?.image_uri
    ? { url: raw.image.image_uri, caption: raw.image.image_caption?.en ?? null }
    : null;
  const bucket = (predicate) =>
    (raw.links?.[predicate]?.links ?? [])
      .filter((l) => typeof l.topic === 'string')
      .map((l) => ({ topic: l.topic, weight: l.order?.tfidf ?? null }));
  const familyPredicates = [
    ['child-of', 'child'], ['parent-of', 'parent'], ['sibling-of', 'sibling'],
    ['spouse-of', 'spouse'], ['child-in-law-of', 'child-in-law'],
    ['parent-in-law-of', 'parent-in-law'], ['ancestor-of', 'ancestor'],
    ['descendant-of', 'descendant'], ['grandchild-of', 'grandchild'],
    ['grandparent-of', 'grandparent'], ['cousin-of', 'cousin'],
  ];
  const family = familyPredicates.flatMap(([pred, rel]) =>
    bucket(pred).map((e) => ({ ...e, relation: rel }))
  );
  return {
    subclass: raw.subclass ?? null,
    generation: unwrapPropertyValue(raw.properties?.generation) ?? null,
    numSources: typeof raw.numSources === 'number' ? raw.numSources : null,
    titles,
    description: { en: raw.description?.en ?? '', he: raw.description?.he ?? '' },
    refs,
    image,
    edges: {
      learnedFrom: bucket('learned-from'),
      taught: bucket('taught'),
      family,
      opposed: bucket('opposed'),
      correspondedWith: bucket('corresponded-with'),
      memberOf: bucket('member-of'),
      participatesIn: bucket('participates-in'),
      relatedTo: bucket('related-to'),
    },
  };
}

function fmt(w) {
  if (w === null || w === undefined) return 'null';
  return w.toFixed(2);
}

function buildUser(slug, local, sefaria) {
  const lines = [];
  lines.push('=== IDENTITY ===');
  lines.push(`slug:        ${slug}`);
  lines.push(`canonical:   ${local.canonical}`);
  lines.push(`canonicalHe: ${local.canonicalHe ?? '(none)'}`);
  lines.push(`region:      ${local.region ?? 'unknown'}`);
  lines.push(`generation:  ${local.generation ?? 'unknown'}`);
  lines.push(`places:      ${(local.places ?? []).join(', ') || '(none)'}`);
  lines.push(`aliases:     ${(local.aliases ?? []).slice(0, 10).join(' | ') || '(none)'}`);
  if (local.wiki) lines.push(`heWiki:      ${local.wiki}`);

  if (sefaria) {
    lines.push('');
    lines.push('=== SEFARIA GRAPH ===');
    lines.push(`subclass:    ${sefaria.subclass ?? '(none)'}`);
    lines.push(`generation:  ${sefaria.generation ?? '(none)'}`);
    lines.push(`numSources:  ${sefaria.numSources ?? '(none)'}`);
    const enT = sefaria.titles.filter((t) => t.lang === 'en').map((t) => t.text);
    const heT = sefaria.titles.filter((t) => t.lang === 'he').map((t) => t.text);
    if (enT.length) lines.push(`titles_en:   ${enT.join(' | ')}`);
    if (heT.length) lines.push(`titles_he:   ${heT.join(' | ')}`);
    if (sefaria.refs.enWiki) lines.push(`enWiki:      ${sefaria.refs.enWiki}`);
    if (sefaria.refs.heWiki) lines.push(`heWiki:      ${sefaria.refs.heWiki}`);
    if (sefaria.refs.je) lines.push(`je:          ${sefaria.refs.je}`);
    if (sefaria.refs.wikidata) lines.push(`wikidata:    ${sefaria.refs.wikidata}`);
    if (sefaria.image) lines.push(`image:       ${sefaria.image.url}`);

    lines.push('');
    lines.push('-- Sefaria edges (CONFIRMED — include each in output with source="sefaria") --');
    const dump = (label, arr) => {
      if (!arr.length) { lines.push(`${label}: (none)`); return; }
      lines.push(`${label}:`);
      for (const e of arr) lines.push(`  - ${e.topic}  (weight=${fmt(e.weight)})`);
    };
    dump('teachers (learned-from)', sefaria.edges.learnedFrom);
    dump('students (taught)', sefaria.edges.taught);
    if (!sefaria.edges.family.length) lines.push('family: (none)');
    else {
      lines.push('family:');
      for (const e of sefaria.edges.family) {
        lines.push(`  - ${e.topic}  (relation=${e.relation}, weight=${fmt(e.weight)})`);
      }
    }
    dump('opposed', sefaria.edges.opposed);
    dump('influences (corresponded-with)', sefaria.edges.correspondedWith);
    dump('events (participates-in)', sefaria.edges.participatesIn);
    dump('member-of', sefaria.edges.memberOf);
    dump('related-to (weak)', sefaria.edges.relatedTo);

    if (sefaria.description.en) {
      lines.push('');
      lines.push('-- Sefaria bio (en) --');
      lines.push(sefaria.description.en);
    }
    if (sefaria.description.he) {
      lines.push('');
      lines.push('-- Sefaria bio (he) --');
      lines.push(sefaria.description.he);
    }
  } else {
    lines.push('');
    lines.push('=== SEFARIA GRAPH ===');
    lines.push('(no Sefaria topic data; rely on BIO)');
  }

  if (local.bio) {
    lines.push('');
    lines.push(`=== BIO (${local.bioSource ?? 'unknown'}) ===`);
    lines.push(local.bio);
  }

  lines.push('');
  lines.push('Now produce the JSON record for this sage.');
  return lines.join('\n');
}

const out = {};
for (const [slug, { local, sefaria }] of Object.entries(inputs)) {
  const sefIn = mapSefaria(sefaria);
  const user = buildUser(slug, local, sefIn);
  out[slug] = { system: SYSTEM, user, _systemChars: SYSTEM.length, _userChars: user.length };
}

await writeFile(join(here, 'messages.json'), JSON.stringify(out, null, 2));
console.log(`wrote messages.json:`);
for (const slug of Object.keys(out)) {
  console.log(`  ${slug}: system=${out[slug]._systemChars}c, user=${out[slug]._userChars}c`);
}
