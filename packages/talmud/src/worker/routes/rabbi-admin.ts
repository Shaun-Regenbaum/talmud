/**
 * The rabbi/sage admin surface: the per-sage enrichment endpoints (bio fields,
 * relationships, family, orientation, the unified record, Wikidata and
 * Wikipedia stages), the global compile endpoints that fold every enriched
 * record into one blob (graph, cohort, places index, academy roster), the
 * read endpoints for those blobs, the voice-graph controls and the coverage
 * report the Rabbis tab shows.
 *
 * Moved here from index.ts unchanged. The shared rabbi-identification helpers
 * (enrichRabbi, enrichAll and friends) stayed in index.ts and are not used
 * here. Registration order is preserved, and tests/worker-route-table.test.ts
 * pins it.
 */

import { runLLM } from '@corpus/core/llm/llm';
import type { Hono } from 'hono';
import { z } from 'zod';
import { GENERATION_ID_SET, GENERATIONS_PROMPT_REFERENCE } from '../../client/generations';
import { isNonSageTopic } from '../../lib/nonSageTopics';
import {
  buildRabbiEnrichUserMessage,
  type LocalRabbiInput,
  RABBI_ENRICH_SYSTEM_PROMPT,
  type SefariaInput,
} from '../../lib/rabbi/prompt';
import {
  type EnrichedRabbi as EnrichedRabbiRecord,
  type LLMRabbiOutput,
  SCHEMA_VERSION as RABBI_SCHEMA_VERSION,
  validateLLMRabbiOutput,
} from '../../lib/rabbi/types';
import {
  keyForRabbiAcademyRoster,
  keyForRabbiBioBySlug,
  keyForRabbiCohort,
  keyForRabbiEnriched,
  keyForRabbiGraph,
  keyForRabbiPlacesIndex,
  keyForRabbiVoiceGraph,
  keyForRabbiWikiBio,
  keyForRabbiWikidata,
} from '../cache-keys';
import { getRabbiEntryOr404 } from '../http-helpers';
import { kvGetJSONAs, parseJSONAs } from '../kv-json';
import { rabbiGraphBlobShape, voiceGraphBlobShape } from '../kv-shapes';
import { extractJsonPayload, runKimiStreaming, type StreamedResult } from '../llm-helpers';
import { ENRICH_JSON_SCHEMA } from '../output-schemas';
import { isRabbinicHebrewName } from '../rabbi-graph';
import {
  type Movement,
  RABBI_PLACES,
  type RabbiPlacesEntry,
  resolveRabbiByName,
} from '../rabbi-places';
import { isTrustedRequest } from '../request-guards';
import type { Bindings } from '../types';
import { egoSlice, type VoiceGraphBlob } from '../voice-graph';
import { runVoiceGraphBackfill, VOICE_GRAPH_STATE_KEY } from '../warm-cron';

// --- Admin: per-rabbi enrichment ----------------------------------------
// One-shot Kimi K2.6 thinking call per rabbi to fill in the structured
// fields that are sparse in rabbi-places.json (generation, region, places,
// moved). The runner script (scripts/enrich-rabbis.mjs) fans out 128 calls
// in parallel and merges results back into the JSON.

const ENRICH_SYSTEM_PROMPT = `You are a scholar of Talmudic history. You will receive ONE rabbi's canonical name, Hebrew name, and an English bio. Extract four structured fields from the bio (using your broader knowledge of that rabbi where the bio is silent, but never inventing facts the bio contradicts).

Output STRICT JSON (no prose, no markdown):

{
  "generation": "one of the generation IDs listed below, or 'unknown' if the rabbi is too obscure to place",
  "region": "'israel' | 'bavel' | null — the rabbi's primary teaching location. null only for pre-Talmudic or non-geographic figures.",
  "places": ["array of specific cities associated with the rabbi (e.g. 'Tiberias', 'Sura', 'Yavneh'). Prefer canonical English spellings. Empty array if none can be identified."],
  "moved": "'bavel->israel' | 'israel->bavel' | 'both' | null — use a direction ONLY when the bio or common knowledge clearly indicates migration between Bavel and Eretz Yisrael. Default to null."
}

${GENERATIONS_PROMPT_REFERENCE}

Rules:
- Base 'region' on the PRIMARY teaching location, not birthplace. R. Zeira was born in Bavel but taught in Eretz Yisrael → region: 'israel', moved: 'bavel->israel'.
- 'places' should be specific cities, not regions. Don't put 'Eretz Yisrael' or 'Bavel' in places.
- If the bio mentions they moved, set 'moved' accordingly.
- If the rabbi lived in both regions as a full career (e.g. the Tannaim who fled to Usha), use 'both'.
- Use 'unknown' for generation only when you truly cannot place them. Most named rabbis in the dataset ARE placeable.`;

interface EnrichedRabbi {
  generation: string;
  region: 'israel' | 'bavel' | null;
  places: string[];
  moved: Movement;
}

function validateEnriched(x: unknown): x is EnrichedRabbi {
  if (!x || typeof x !== 'object') return false;
  const e = x as EnrichedRabbi;
  if (typeof e.generation !== 'string') return false;
  if (!GENERATION_ID_SET.has(e.generation)) return false;
  if (e.region !== null && e.region !== 'israel' && e.region !== 'bavel') return false;
  if (!Array.isArray(e.places)) return false;
  if (e.places.some((p) => typeof p !== 'string')) return false;
  const validMoved: Array<Movement> = [null, 'bavel->israel', 'israel->bavel', 'both'];
  if (!validMoved.includes(e.moved ?? null)) return false;
  return true;
}

// Sage filter: only entries whose canonicalHe starts with a rabbinic title
// (or is a standalone sage name) are worth enriching. Biblical figures and
// concept nouns don't participate in rabbi identification at runtime.
function isRabbinicEntry(r: RabbiPlacesEntry): boolean {
  return isRabbinicHebrewName(r.canonicalHe);
}

// --- Admin: per-rabbi relationship extraction ---------------------------
// Extracts teachers / students / colleagues from each rabbi's bio via
// Kimi K2.6 thinking. Names returned by the model are resolved server-side
// through the shared alias index so downstream consumers get validated
// slugs (or null for unresolvable mentions). Output drives
// scripts/build-rabbi-hierarchy.mjs → src/lib/data/rabbi-hierarchy.json,
// which the client renders as the rabbi-tree strip.

const RELATIONSHIPS_SYSTEM_PROMPT = `You are a scholar of Talmudic history. You will receive ONE rabbi's canonical name, Hebrew name, generation, and an English bio. Identify the rabbi's direct relationships with OTHER named rabbis:

- teachers:   rabbis the subject studied under / received tradition from.
- students:   rabbis who studied under the subject.
- colleagues: contemporaries the subject is attested to have debated, worked alongside, or issued rulings with (not passing mentions).

Output STRICT JSON (no prose, no markdown):

{
  "teachers":   ["Array of the subject's teachers, using the conventional English name form (e.g. 'Rabbi Yehudah haNasi', 'Rav Huna'). Omit if unknown."],
  "students":   ["Array of the subject's students."],
  "colleagues": ["Array of the subject's contemporaries / debate partners."]
}

Rules:
- Include a rabbi only when the relationship is stated or strongly implied by the bio, OR is well-established common knowledge consistent with the bio. Do NOT invent relationships.
- Use ASCII-only canonical English names; prefer Sefaria-style spellings ('b.' not 'ben', 'Rav' for Babylonian Amoraim, 'Rabbi' for Eretz-Yisrael Amoraim / Tannaim).
- A single rabbi should appear in at most ONE array (most important relationship). If genuinely both teacher and colleague, pick teacher.
- Do NOT include the subject themselves.
- Do NOT include anonymous groups ('the Sages', 'the rabbis of Pumbedita').
- If a category is empty, return an empty array. Do not omit the field.
- Cap each array at 12 entries — pick the most important.`;

interface RelationshipsResult {
  teachers: string[];
  students: string[];
  colleagues: string[];
}

function validateRelationships(x: unknown): x is RelationshipsResult {
  if (!x || typeof x !== 'object') return false;
  const r = x as RelationshipsResult;
  for (const k of ['teachers', 'students', 'colleagues'] as const) {
    if (!Array.isArray(r[k])) return false;
    if (r[k].some((s) => typeof s !== 'string')) return false;
  }
  return true;
}

interface ResolvedRef {
  name: string;
  slug: string | null;
}

function resolveRefs(names: string[], selfSlug: string): ResolvedRef[] {
  const out: ResolvedRef[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = (raw ?? '').trim();
    if (!name) continue;
    const hit = resolveRabbiByName(name);
    const slug = hit?.slug ?? null;
    if (slug === selfSlug) continue; // guard against self-reference
    const key = slug ?? `raw:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, slug });
  }
  return out;
}

// --- Admin: per-rabbi familial relation extraction ----------------------
// Companion to rabbi-relationships but for kinship (father / mother /
// spouse / children / siblings / uncles / nephews / cousins /
// grandparents / grandchildren / in-laws). Kept separate because the
// prompt and dataset shape are distinct: blood ties don't belong in
// the teacher/student/contemporary graph, and we often have a father
// who was *also* a teacher — they should surface in both places.

const FAMILY_RELATION_TYPES = [
  'father',
  'mother',
  'spouse',
  'son',
  'daughter',
  'brother',
  'sister',
  'uncle',
  'aunt',
  'nephew',
  'niece',
  'grandfather',
  'grandmother',
  'grandson',
  'granddaughter',
  'father-in-law',
  'mother-in-law',
  'son-in-law',
  'daughter-in-law',
  'brother-in-law',
  'sister-in-law',
  'cousin',
  'other',
] as const;
type FamilyRelation = (typeof FAMILY_RELATION_TYPES)[number];
const FAMILY_RELATION_SET = new Set<string>(FAMILY_RELATION_TYPES);

const FAMILY_SYSTEM_PROMPT = `You are a scholar of Talmudic history. You will receive ONE rabbi's canonical name, Hebrew name, generation, and an English bio. Extract the rabbi's FAMILIAL relationships — blood ties, marriage, and in-laws — with OTHER named people (rabbis, biblical figures, or otherwise).

Output STRICT JSON (no prose, no markdown):

{
  "family": [
    { "name": "<conventional English name of the relative>", "relation": "<one of the relation types listed below>" }
  ]
}

Relation types (use these exact strings):
father, mother, spouse, son, daughter, brother, sister,
uncle, aunt, nephew, niece,
grandfather, grandmother, grandson, granddaughter,
father-in-law, mother-in-law, son-in-law, daughter-in-law, brother-in-law, sister-in-law,
cousin, other

Rules:
- Include a relative ONLY when the bio or well-established tradition clearly supports it. Do NOT invent relations.
- 'spouse' applies to any wife (the rabbinic literature is pre-modern; there's no distinction field). If the rabbi had multiple wives, list each separately.
- 'son' / 'daughter' must be named. Unnamed children are not listed.
- If the rabbi's father was ALSO his teacher, still list him here as 'father' — the teacher/student graph is separate and both can be true.
- If the rabbi is a nephew / uncle of someone, emit the relation FROM the subject's perspective (e.g. 'Rabbah' listed as 'uncle' means Rabbah is the subject's uncle).
- Use 'other' only when the relation is familial but doesn't fit the enumerated types (step-relatives, adoptive, etc.).
- Names in English, ASCII, Sefaria-style spellings ('b.' for 'ben'). The subject must NOT appear in its own family list.
- Cap at 20 entries total. Empty array is fine if no family is attested.`;

interface FamilyEntry {
  name: string;
  relation: FamilyRelation;
}
interface FamilyResult {
  family: FamilyEntry[];
}

function validateFamily(x: unknown): x is FamilyResult {
  if (!x || typeof x !== 'object') return false;
  const f = x as FamilyResult;
  if (!Array.isArray(f.family)) return false;
  for (const e of f.family) {
    if (!e || typeof e !== 'object') return false;
    if (typeof e.name !== 'string') return false;
    if (typeof e.relation !== 'string' || !FAMILY_RELATION_SET.has(e.relation)) return false;
  }
  return true;
}

// --- Admin: orientation + domain + academy classification --------------
// One call per rabbi. Three axes:
//   orientation: mystical / practical / mixed / unknown
//   domain:      halakhist / aggadist / both / unknown
//   academies:   from a fixed vocabulary (Sura, Pumbedita, Nehardea,
//                Mehoza, Tiberias, Tzippori, Caesarea, Yavneh, Usha,
//                Bnei Brak, Lod, Jerusalem, other), cap 4.

const ACADEMY_VOCAB = [
  'Sura',
  'Pumbedita',
  'Nehardea',
  'Mehoza',
  'Tiberias',
  'Tzippori',
  'Caesarea',
  'Yavneh',
  'Usha',
  'Bnei Brak',
  'Lod',
  'Jerusalem',
  'other',
] as const;

const ORIENTATION_SYSTEM_PROMPT = `You are a scholar of Talmudic history. Given a rabbi's canonical name, Hebrew name, generation, region, and English bio, classify THREE things about them.

Output STRICT JSON (no prose, no markdown):

{
  "orientation": "mystical | practical | mixed | unknown",
  "domain":      "halakhist | aggadist | both | unknown",
  "academies":   ["Sura", "Pumbedita", ...]
}

Definitions:
- orientation:
  - 'mystical':  known for merkavah mysticism, sod / esoteric teachings, aggadic visions, heavy engagement with hidden dimensions (e.g. R' Akiva's pardes, Shimon bar Yochai, R' Yehoshua b. Levi).
  - 'practical': known primarily for halakhic rulings, legal reasoning, communal leadership (e.g. R' Yehuda haNasi, Rava, R' Yose).
  - 'mixed':     genuinely strong on BOTH axes (e.g. R' Yochanan b. Nappacha).
  - 'unknown':   can't determine from bio + knowledge.

- domain:
  - 'halakhist': preserved teachings are predominantly halakhic (legal / ritual).
  - 'aggadist':  preserved teachings are predominantly aggadic (narrative, homiletic, ethical).
  - 'both':      equally known for both.
  - 'unknown'.

- academies: the Babylonian or Eretz-Yisrael academies / cities of teaching the rabbi is attested at, using EXACTLY these strings:
  Sura, Pumbedita, Nehardea, Mehoza, Tiberias, Tzippori, Caesarea, Yavneh, Usha, Bnei Brak, Lod, Jerusalem, other
  Cap at 4. Empty array if no academy / teaching-city is attested. Use 'other' only for a named academy not in this list (rare).

Rules:
- Base classifications on the bio AND well-established tradition. Don't guess.
- A rabbi 'mystical' in orientation can still be 'halakhist' in domain — the axes are distinct.
- Keep academies to places where the rabbi TAUGHT or HEADED an academy, not every city they visited.`;

interface OrientationResult {
  orientation: 'mystical' | 'practical' | 'mixed' | 'unknown';
  domain: 'halakhist' | 'aggadist' | 'both' | 'unknown';
  academies: string[];
}

const ORIENTATION_ENUM = new Set(['mystical', 'practical', 'mixed', 'unknown']);
const DOMAIN_ENUM = new Set(['halakhist', 'aggadist', 'both', 'unknown']);
const ACADEMY_ENUM = new Set<string>(ACADEMY_VOCAB);

function validateOrientation(x: unknown): x is OrientationResult {
  if (!x || typeof x !== 'object') return false;
  const o = x as OrientationResult;
  if (!ORIENTATION_ENUM.has(o.orientation)) return false;
  if (!DOMAIN_ENUM.has(o.domain)) return false;
  if (!Array.isArray(o.academies)) return false;
  if (o.academies.some((a) => typeof a !== 'string' || !ACADEMY_ENUM.has(a))) return false;
  return true;
}

// --- Admin: unified rabbi enrichment ------------------------------------
// Single LLM call per sage. Pulls local data + Sefaria topic graph (cached
// in KV), feeds both to Kimi K2.5, returns one EnrichedRabbi record. Replaces
// the per-dimension scripts (orientation, family, hierarchy). Used by the
// EnrichRabbi workflow.

const SEFARIA_TOPIC_TTL_S = 60 * 60 * 24 * 30; // 30d
const SEFARIA_TOPIC_VERSION = 1;

interface SefariaRawTopic {
  primaryTitle?: { en?: string; he?: string };
  slug?: string;
  titles?: Array<{ text?: string; lang?: string }>;
  subclass?: string;
  properties?: {
    generation?: { value?: string } | string;
    enWikiLink?: { value?: string } | string;
    heWikiLink?: { value?: string } | string;
    jeLink?: { value?: string } | string;
    wikidataLink?: { value?: string } | string;
  };
  description?: { en?: string; he?: string };
  numSources?: number;
  image?: { image_uri?: string; image_caption?: { en?: string } };
  links?: Record<
    string,
    {
      title?: unknown;
      links?: Array<{
        topic?: string;
        order?: { tfidf?: number; linksInCommon?: number };
        isInverse?: boolean;
        dataSource?: string;
      }>;
    }
  >;
}

async function fetchSefariaTopicCached(
  slug: string,
  cache: KVNamespace | undefined,
): Promise<SefariaRawTopic | null> {
  const key = `sefaria:topic:v${SEFARIA_TOPIC_VERSION}:${slug}`;
  if (cache) {
    const hit = (await cache.get(key, 'json')) as SefariaRawTopic | null;
    if (hit) return hit;
  }
  const url = `https://www.sefaria.org/api/topics/${encodeURIComponent(slug)}?with_links=1&with_refs=0`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sefaria topic ${slug}: HTTP ${res.status}`);
  const data = (await res.json()) as SefariaRawTopic;
  if (cache) {
    await cache.put(key, JSON.stringify(data), { expirationTtl: SEFARIA_TOPIC_TTL_S });
  }
  return data;
}

function unwrapPropertyValue(p: unknown): string | undefined {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && 'value' in p) {
    const v = (p as { value?: unknown }).value;
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

function mapSefariaToInput(raw: SefariaRawTopic | null): SefariaInput | null {
  if (!raw) return null;
  const titles = (raw.titles ?? [])
    .filter(
      (t): t is { text: string; lang: string } =>
        typeof t.text === 'string' && (t.lang === 'en' || t.lang === 'he'),
    )
    .map((t) => ({ text: t.text, lang: t.lang as 'en' | 'he' }));

  const refs: SefariaInput['refs'] = {};
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

  const bucket = (predicate: string) =>
    (raw.links?.[predicate]?.links ?? [])
      .filter(
        (l): l is { topic: string; order?: { tfidf?: number } } => typeof l.topic === 'string',
      )
      .map((l) => ({ topic: l.topic, weight: l.order?.tfidf ?? null }));

  const familyPredicates: Array<[string, string]> = [
    ['child-of', 'child'],
    ['parent-of', 'parent'],
    ['sibling-of', 'sibling'],
    ['spouse-of', 'spouse'],
    ['child-in-law-of', 'child-in-law'],
    ['parent-in-law-of', 'parent-in-law'],
    ['ancestor-of', 'ancestor'],
    ['descendant-of', 'descendant'],
    ['grandchild-of', 'grandchild'],
    ['grandparent-of', 'grandparent'],
    ['cousin-of', 'cousin'],
  ];
  const family = familyPredicates.flatMap(([pred, rel]) =>
    bucket(pred).map((e) => ({ ...e, relation: rel })),
  );

  return {
    subclass: raw.subclass ?? null,
    generation: unwrapPropertyValue(raw.properties?.generation) ?? null,
    numSources: typeof raw.numSources === 'number' ? raw.numSources : null,
    titles,
    description: {
      en: raw.description?.en ?? '',
      he: raw.description?.he ?? '',
    },
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

function buildLocalRabbiInput(slug: string, entry: RabbiPlacesEntry): LocalRabbiInput {
  return {
    slug,
    canonical: entry.canonical,
    canonicalHe: entry.canonicalHe ?? null,
    aliases: entry.aliases ?? [],
    region: entry.region ?? null,
    generation: entry.generation ?? null,
    places: entry.places ?? [],
    bio: entry.bio ?? null,
    bioSource: (entry.bioSource as 'sefaria' | 'wikipedia' | undefined) ?? null,
    wiki: entry.wiki ?? null,
  };
}

/**
 * Walk every edge bucket and null out any slug that isn't in the canonical
 * rabbi list. Trust Sefaria-sourced slugs unconditionally (they came from
 * the same Sefaria `?type=person` dump). Catches LLM-fabricated slugs like
 * `rabbah-tosfaah` (real slug: `rav-rabbah-tosfaah`).
 */
function cleanFabricatedSlugs(out: LLMRabbiOutput, known: ReadonlySet<string>): void {
  const buckets: Array<Array<{ slug: string | null; source: 'sefaria' | 'llm' }>> = [
    out.teachers,
    out.students,
    out.family,
    out.opposed,
    out.influences,
  ];
  for (const bucket of buckets) {
    for (const e of bucket) {
      if (e.source === 'sefaria') continue;
      if (e.slug && !known.has(e.slug)) e.slug = null;
    }
  }
}

/**
 * Returns the slug of the highest-weight resolvable edge in a bucket, or
 * null if the bucket is empty / has no slugged entries / all weights null.
 * Compared on the LLM-emitted scale (Sefaria tfidf and LLM 0–1 mixed),
 * which is fine because raw tfidf for the top sage is always >>1.
 */
function topSlugByWeight(
  edges: ReadonlyArray<{ slug: string | null; weight: number | null }>,
): string | null {
  let best: { slug: string; weight: number } | null = null;
  for (const e of edges) {
    if (!e.slug) continue;
    const w = typeof e.weight === 'number' ? e.weight : -Infinity;
    if (!best || w > best.weight) best = { slug: e.slug, weight: w };
  }
  return best?.slug ?? null;
}

/**
 * Sefaria edges arrive with raw tfidf weights (0 to ~70). LLM-added edges
 * use a 0–1 confidence scale. Normalize each Sefaria bucket per-sage so the
 * top edge is 1.0 and the rest scale linearly. Preserves ranking; makes the
 * scale comparable to LLM-added edges.
 */
function normalizeEdgeWeights(out: LLMRabbiOutput): void {
  const buckets: Array<
    { slug: string | null; name: string; weight: number | null; source: 'sefaria' | 'llm' }[]
  > = [out.teachers, out.students, out.family, out.opposed, out.influences];
  for (const bucket of buckets) {
    let max = 0;
    for (const e of bucket) {
      if (e.source === 'sefaria' && typeof e.weight === 'number' && e.weight > max) max = e.weight;
    }
    if (max <= 1) continue; // already 0–1 or empty
    for (const e of bucket) {
      if (e.source === 'sefaria' && typeof e.weight === 'number') {
        e.weight = Math.round((e.weight / max) * 1000) / 1000;
      }
    }
  }
}

export async function enrichRabbiUnified(
  slug: string,
  entry: RabbiPlacesEntry,
  env: Bindings,
  cache: KVNamespace | undefined,
): Promise<
  | {
      ok: true;
      record: EnrichedRabbiRecord;
      ms: number;
      promptChars: number;
      usage: StreamedResult['usage'];
    }
  | { ok: false; error: string; raw?: string; ms: number }
> {
  const t0 = Date.now();
  const local = buildLocalRabbiInput(slug, entry);
  let sefariaRaw: SefariaRawTopic | null = null;
  try {
    sefariaRaw = await fetchSefariaTopicCached(slug, cache);
  } catch (err) {
    return { ok: false, error: `sefaria fetch: ${String(err).slice(0, 200)}`, ms: Date.now() - t0 };
  }
  const sefaria = mapSefariaToInput(sefariaRaw);
  const userContent = buildRabbiEnrichUserMessage({ local, sefaria });

  let streamed: StreamedResult;
  try {
    streamed = await runKimiStreaming(
      env,
      '@cf/moonshotai/kimi-k2.5',
      [
        { role: 'system', content: RABBI_ENRICH_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      12288,
      {
        chatTemplateKwargs: { enable_thinking: false },
        tag: 'rabbi-enrich-sefaria',
        attribution: { kind: 'rabbi', producerId: 'rabbi-enrich-sefaria' },
      },
    );
  } catch (err) {
    return { ok: false, error: `llm: ${String(err).slice(0, 200)}`, ms: Date.now() - t0 };
  }

  let payload = streamed.content.trim();
  if (!payload && streamed.reasoning_content) {
    const m = streamed.reasoning_content.match(/\{[\s\S]*"slug"[\s\S]*\}/);
    if (m) payload = m[0];
  }
  const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) payload = fenced[1].trim();
  if (!payload) return { ok: false, error: 'empty payload', ms: Date.now() - t0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    const repaired = payload.replace(/,(\s*[}\]])/g, '$1').replace(/\r/g, '');
    try {
      parsed = JSON.parse(repaired);
    } catch {
      return {
        ok: false,
        error: `non-JSON: ${String(err).slice(0, 200)}`,
        raw: payload.slice(0, 800),
        ms: Date.now() - t0,
      };
    }
  }

  const failure = validateLLMRabbiOutput(parsed);
  if (failure) {
    return {
      ok: false,
      error: `schema: ${failure.path}: ${failure.message}`,
      raw: payload.slice(0, 800),
      ms: Date.now() - t0,
    };
  }

  const llmOut = parsed as LLMRabbiOutput;

  // Defensive cleaning — null any LLM-fabricated slugs that don't exist in
  // the canonical rabbi list. Sefaria slugs are trusted (they came from
  // the same `?type=person` dump that built RABBI_PLACES).
  const knownSlugs = new Set(Object.keys(RABBI_PLACES.rabbis));
  cleanFabricatedSlugs(llmOut, knownSlugs);

  // Deterministic overrides — these fields are mechanical, not synthesis.
  // Compute primaryTeacher/Student from edge weights BEFORE normalization
  // so we compare on the raw scale the LLM emitted (Sefaria tfidf >> 1).
  llmOut.primaryTeacher = topSlugByWeight(llmOut.teachers);
  llmOut.primaryStudent = topSlugByWeight(llmOut.students);
  if (sefariaRaw && typeof sefariaRaw.numSources === 'number') {
    llmOut.prominence = sefariaRaw.numSources;
  } else if (typeof llmOut.prominence === 'number' && llmOut.prominence <= 1) {
    // LLM emitted a 0–1 score with no Sefaria evidence — discard.
    llmOut.prominence = null;
  }

  normalizeEdgeWeights(llmOut);

  const sources: Array<'sefaria' | 'wikipedia' | 'llm'> = ['llm'];
  if (sefariaRaw) sources.unshift('sefaria');
  if (entry.bioSource === 'wikipedia') sources.push('wikipedia');

  const record: EnrichedRabbiRecord = {
    ...llmOut,
    schemaVersion: RABBI_SCHEMA_VERSION,
    enrichedAt: new Date().toISOString(),
    sources,
  };

  return {
    ok: true,
    record,
    ms: Date.now() - t0,
    promptChars: streamed.prompt_chars,
    usage: streamed.usage,
  };
}

// --- Per-sage no-AI enrichment stages -----------------------------------
// These read external APIs (Wikidata, MediaWiki) using URLs/QIDs already
// captured in rabbi-enriched:v1:{slug}.refs. Stage outputs are cached at
// their own keys so partial coverage is observable in the EnrichmentPage
// Rabbis tab. AI-free; cheap to re-run.

const RABBI_STAGE_TTL_S = 60 * 60 * 24 * 365;

interface WikidataStageRecord {
  qid: string;
  fatherQid: string | null;
  motherQid: string | null;
  spouseQids: string[];
  childQids: string[];
  studentQids: string[];
  teacherQids: string[];
  birthYear: number | null;
  deathYear: number | null;
  fetchedAt: string;
}

interface WikiBioStageRecord {
  enWiki: { url: string; title: string; extract: string } | null;
  heWiki: { url: string; title: string; extract: string } | null;
  fetchedAt: string;
}

/**
 * An enriched rabbi record. These cost a model call each and there are ~1,300 of
 * them, so this gate is as loose as it can be while still being worth having:
 * the slug it is filed under, and the `refs` object two routes read into
 * without a guard. Every other field is read with a default, including the ones
 * added after the first records were written.
 */
const enrichedRabbiShape = z.looseObject({ slug: z.string(), refs: z.looseObject({}) });

/** A compiled blob served straight back to the caller. */
const compiledBlobShape = z.looseObject({});

export async function readEnriched(
  cache: KVNamespace,
  slug: string,
): Promise<EnrichedRabbiRecord | null> {
  const key = keyForRabbiEnriched(slug);
  return (await kvGetJSONAs<EnrichedRabbiRecord>(cache, key, enrichedRabbiShape)) ?? null;
}

function parseWikidataYear(time: string | undefined): number | null {
  if (!time) return null;
  const m = time.match(/^([+-])(\d{4,})/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * parseInt(m[2], 10);
}

async function fetchWikidataEntity(qid: string): Promise<WikidataStageRecord | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    entities?: Record<
      string,
      {
        claims?: Record<
          string,
          Array<{
            mainsnak?: { datavalue?: { value?: { id?: string; time?: string } } };
          }>
        >;
      }
    >;
  };
  const entity = data.entities?.[qid];
  if (!entity?.claims) return null;

  const idsFor = (prop: string): string[] =>
    (entity.claims?.[prop] ?? [])
      .map((c) => c.mainsnak?.datavalue?.value?.id)
      .filter((v): v is string => typeof v === 'string');

  const firstId = (prop: string): string | null => idsFor(prop)[0] ?? null;

  const yearFor = (prop: string): number | null => {
    const claim = entity.claims?.[prop]?.[0];
    return parseWikidataYear(claim?.mainsnak?.datavalue?.value?.time);
  };

  return {
    qid,
    fatherQid: firstId('P22'),
    motherQid: firstId('P25'),
    spouseQids: idsFor('P26'),
    childQids: idsFor('P40'),
    studentQids: idsFor('P802'),
    teacherQids: idsFor('P1066'),
    birthYear: yearFor('P569'),
    deathYear: yearFor('P570'),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchWikipediaExtract(
  url: string,
  lang: 'en' | 'he',
): Promise<{ url: string; title: string; extract: string } | null> {
  // Pull the page title from /wiki/<title> URL fragment.
  const m = url.match(/\/wiki\/([^?#]+)/);
  if (!m) return null;
  const title = decodeURIComponent(m[1]);
  const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&exintro=0&redirects=1&titles=${encodeURIComponent(title)}&origin=*`;
  const res = await fetch(apiUrl, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { title?: string; extract?: string; missing?: '' }> };
  };
  const pages = data.query?.pages ?? {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined || !page.extract) return null;
  return { url, title: page.title ?? title, extract: page.extract };
}

// --- Global compile endpoints --------------------------------------------
// These scan every rabbi-enriched:v1:* and emit one aggregate blob each.
// No AI; cheap (KV-only). Run after a per-sage refresh batch is done.

interface RabbiGraphNode {
  slug: string;
  canonical: string;
  canonicalHe: string;
  generation: string | null;
  region: string | null;
  academy: string | null;
  primaryTeacher: string | null;
  primaryStudent: string | null;
  teachers: Array<{ slug: string | null; name: string; weight: number | null; source: string }>;
  students: Array<{ slug: string | null; name: string; weight: number | null; source: string }>;
  family: Array<{
    slug: string | null;
    name: string;
    relation: string;
    weight: number | null;
    source: string;
  }>;
  opposed: Array<{ slug: string | null; name: string; weight: number | null; source: string }>;
}

export interface RabbiGraphBlob {
  generatedAt: string;
  count: number;
  nodes: Record<string, RabbiGraphNode>;
}

async function listEnrichedSlugs(cache: KVNamespace): Promise<string[]> {
  const prefix = 'rabbi-enriched:v1:';
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await cache.list({ prefix, cursor, limit: 1000 });
    for (const k of page.keys) out.push(k.name.slice(prefix.length));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

async function readAllEnriched(cache: KVNamespace): Promise<EnrichedRabbiRecord[]> {
  const slugs = await listEnrichedSlugs(cache);
  const out: EnrichedRabbiRecord[] = [];
  // Sequential — KV `get` is fast and 1.3K calls finish in well under a request budget.
  for (const slug of slugs) {
    const rec = await readEnriched(cache, slug);
    if (rec) out.push(rec);
  }
  return out;
}

const FAMILY_INVERSE: Record<string, string> = {
  father: 'son',
  mother: 'son',
  son: 'father',
  daughter: 'father',
  spouse: 'spouse',
  brother: 'brother',
  sister: 'sister',
  uncle: 'nephew',
  aunt: 'nephew',
  nephew: 'uncle',
  niece: 'aunt',
  grandfather: 'grandson',
  grandmother: 'grandson',
  grandson: 'grandfather',
  granddaughter: 'grandfather',
  'father-in-law': 'son-in-law',
  'mother-in-law': 'son-in-law',
  'son-in-law': 'father-in-law',
  'daughter-in-law': 'father-in-law',
  'brother-in-law': 'brother-in-law',
  'sister-in-law': 'sister-in-law',
  cousin: 'cousin',
  ancestor: 'descendant',
  descendant: 'ancestor',
  other: 'other',
};

interface RabbiCohortBlob {
  generatedAt: string;
  // generation code → list of slugs in that generation
  byGeneration: Record<string, string[]>;
  // slug → contemporary slugs (same generation)
  bySage: Record<string, string[]>;
}

interface RabbiPlacesIndexBlob {
  generatedAt: string;
  // place name → slugs known to have lived/taught there
  byPlace: Record<string, string[]>;
}

interface RabbiAcademyRosterBlob {
  generatedAt: string;
  // academy enum → slugs
  byAcademy: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Learned rabbi voice graph — the Shas-wide fold of every cached
// argument.voices section (voice-graph.ts + warm-cron incremental walk).
// Public reads; the step/rebuild mutations are studio-gated.

export function registerRabbiAdminRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.get('/api/admin/rabbi-slugs', (c) => {
    const slugs = Object.entries(RABBI_PLACES.rabbis)
      .filter(([slug, r]) => !isNonSageTopic(slug, r.canonicalHe) && isRabbinicEntry(r))
      .map(([slug]) => slug);
    return c.json({ slugs, count: slugs.length });
  });
  // Slim search index for the #sages browser. Returns one row per rabbinic
  // entry with the fields needed for client-side fuzzy search + filter chips.
  // Reads straight from the bundled rabbi-places.json — no cache lookup.
  app.get('/api/sages-index', (c) => {
    const rows = Object.entries(RABBI_PLACES.rabbis)
      .filter(([slug, r]) => !isNonSageTopic(slug, r.canonicalHe) && isRabbinicEntry(r))
      .map(([slug, r]) => ({
        slug,
        canonical: r.canonical,
        canonicalHe: r.canonicalHe ?? null,
        aliases: r.aliases ?? [],
        generation: r.generation ?? null,
        region: r.region ?? null,
      }));
    return c.json({ rows, count: rows.length });
  });
  app.get('/api/admin/enrich-rabbi/:slug', async (c) => {
    const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
    if (!rr.ok) return rr.response;
    const { slug, entry } = rr;
    if (!entry.bio) return c.json({ error: `no bio available for ${slug}` }, 422);

    // Cache per-slug — this Kimi-thinking call is ~30-60s and the upstream
    // gateway returns transient 502s. Once any daf surfaces a rabbi, every
    // other daf that references them reuses the same enrichment.
    const cache = c.env.CACHE;
    const cacheKey = keyForRabbiBioBySlug(slug);
    const bypass = c.req.query('refresh') === '1';
    if (cache && !bypass) {
      const hit = await kvGetJSONAs<object>(cache, cacheKey, compiledBlobShape);
      if (hit) return c.json({ ...hit, _cached: true });
    }

    if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);

    const userContent = [
      `Canonical name: ${entry.canonical}`,
      `Hebrew name:   ${entry.canonicalHe ?? '(none)'}`,
      `Aliases:       ${(entry.aliases ?? []).slice(0, 8).join(', ')}`,
      '',
      `Bio:`,
      entry.bio,
    ].join('\n');

    const t0 = Date.now();
    try {
      const r = await runLLM(c.env, {
        model: '@cf/moonshotai/kimi-k2.5',
        messages: [
          { role: 'system', content: ENRICH_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 65536,
        temperature: 0.1,
        thinking: false,
        response_format: { type: 'json_schema', json_schema: ENRICH_JSON_SCHEMA },
        tag: 'rabbi-enrich',
        attribution: { kind: 'rabbi', producerId: 'rabbi-enrich' },
      });
      const payload = r.content.trim() || extractJsonPayload({ response: r.content });
      if (!payload) return c.json({ error: 'empty payload', slug }, 502);
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch (err) {
        return c.json(
          { error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) },
          502,
        );
      }
      if (!validateEnriched(parsed)) {
        return c.json({ error: 'schema mismatch', slug, got: parsed }, 502);
      }
      const result = {
        slug,
        canonical: entry.canonical,
        ...parsed,
        _ms: Date.now() - t0,
      };
      if (cache) {
        c.executionCtx.waitUntil(
          cache.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 365 }),
        );
      }
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err).slice(0, 300), slug }, 502);
    }
  });
  app.get('/api/admin/rabbi-relationships/:slug', async (c) => {
    if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
    const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
    if (!rr.ok) return rr.response;
    const { slug, entry } = rr;
    if (!entry.bio) return c.json({ error: `no bio available for ${slug}` }, 422);

    const userContent = [
      `Canonical name: ${entry.canonical}`,
      `Hebrew name:   ${entry.canonicalHe ?? '(none)'}`,
      `Generation:    ${entry.generation ?? 'unknown'}`,
      `Region:        ${entry.region ?? 'unknown'}`,
      `Aliases:       ${(entry.aliases ?? []).slice(0, 8).join(', ')}`,
      '',
      `Bio:`,
      entry.bio,
    ].join('\n');

    const t0 = Date.now();
    let streamed: StreamedResult;
    try {
      // Kimi K2.5 without thinking — matches the reliable /api/enrich path.
      // Relationship extraction is a bounded structured task, no reasoning
      // required; thinking mode was hanging the remote AI gateway.
      streamed = await runKimiStreaming(
        c.env,
        '@cf/moonshotai/kimi-k2.5',
        [
          { role: 'system', content: RELATIONSHIPS_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        8192,
        {
          tag: 'rabbi-relationships',
          attribution: { kind: 'rabbi', producerId: 'rabbi-relationships' },
        },
      );
    } catch (err) {
      return c.json({ error: String(err).slice(0, 300), slug }, 502);
    }
    // Salvage JSON out of reasoning block if the model forgot to emit it as
    // content (Kimi occasionally wraps the final answer in reasoning mid-burst).
    let payload = streamed.content.trim();
    if (!payload && streamed.reasoning_content) {
      const m = streamed.reasoning_content.match(/\{[\s\S]*"teachers"[\s\S]*\}/);
      if (m) payload = m[0];
    }
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) payload = fenced[1].trim();
    if (!payload) return c.json({ error: 'empty payload', slug, _ms: streamed.elapsed_ms }, 502);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      const repaired = payload.replace(/,(\s*[}\]])/g, '$1').replace(/\r/g, '');
      try {
        parsed = JSON.parse(repaired);
      } catch {
        return c.json(
          { error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) },
          502,
        );
      }
    }
    if (!validateRelationships(parsed)) {
      return c.json({ error: 'schema mismatch', slug, got: parsed }, 502);
    }
    const teachers = resolveRefs(parsed.teachers, slug);
    const students = resolveRefs(parsed.students, slug);
    const colleagues = resolveRefs(parsed.colleagues, slug);
    return c.json({
      slug,
      canonical: entry.canonical,
      teachers,
      students,
      colleagues,
      _ms: Date.now() - t0,
    });
  });
  app.get('/api/admin/rabbi-family/:slug', async (c) => {
    if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
    const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
    if (!rr.ok) return rr.response;
    const { slug, entry } = rr;
    if (!entry.bio) return c.json({ error: `no bio available for ${slug}` }, 422);

    const userContent = [
      `Canonical name: ${entry.canonical}`,
      `Hebrew name:   ${entry.canonicalHe ?? '(none)'}`,
      `Generation:    ${entry.generation ?? 'unknown'}`,
      `Region:        ${entry.region ?? 'unknown'}`,
      `Aliases:       ${(entry.aliases ?? []).slice(0, 8).join(', ')}`,
      '',
      `Bio:`,
      entry.bio,
    ].join('\n');

    const t0 = Date.now();
    let streamed: StreamedResult;
    try {
      streamed = await runKimiStreaming(
        c.env,
        '@cf/moonshotai/kimi-k2.5',
        [
          { role: 'system', content: FAMILY_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        8192,
        { tag: 'rabbi-family', attribution: { kind: 'rabbi', producerId: 'rabbi-family' } },
      );
    } catch (err) {
      return c.json({ error: String(err).slice(0, 300), slug }, 502);
    }
    let payload = streamed.content.trim();
    if (!payload && streamed.reasoning_content) {
      const m = streamed.reasoning_content.match(/\{[\s\S]*"family"[\s\S]*\}/);
      if (m) payload = m[0];
    }
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) payload = fenced[1].trim();
    if (!payload) return c.json({ error: 'empty payload', slug, _ms: streamed.elapsed_ms }, 502);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      const repaired = payload.replace(/,(\s*[}\]])/g, '$1').replace(/\r/g, '');
      try {
        parsed = JSON.parse(repaired);
      } catch {
        return c.json(
          { error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) },
          502,
        );
      }
    }
    if (!validateFamily(parsed)) {
      return c.json({ error: 'schema mismatch', slug, got: parsed }, 502);
    }
    // Resolve each name against the alias index. Non-rabbis (biblical
    // figures, unnamed historical people) won't resolve and return slug:null.
    const resolved: Array<FamilyEntry & { slug: string | null }> = parsed.family.map((e) => {
      const hit = resolveRabbiByName(e.name);
      return { name: e.name, relation: e.relation, slug: hit?.slug ?? null };
    });
    return c.json({
      slug,
      canonical: entry.canonical,
      family: resolved,
      _ms: Date.now() - t0,
    });
  });
  app.get('/api/admin/rabbi-orientation/:slug', async (c) => {
    if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
    const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
    if (!rr.ok) return rr.response;
    const { slug, entry } = rr;
    if (!entry.bio) return c.json({ error: `no bio available for ${slug}` }, 422);

    const userContent = [
      `Canonical name: ${entry.canonical}`,
      `Hebrew name:   ${entry.canonicalHe ?? '(none)'}`,
      `Generation:    ${entry.generation ?? 'unknown'}`,
      `Region:        ${entry.region ?? 'unknown'}`,
      `Places:        ${(entry.places ?? []).join(', ')}`,
      '',
      `Bio:`,
      entry.bio,
    ].join('\n');

    const t0 = Date.now();
    let streamed: StreamedResult;
    try {
      streamed = await runKimiStreaming(
        c.env,
        '@cf/moonshotai/kimi-k2.5',
        [
          { role: 'system', content: ORIENTATION_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        4096,
        {
          tag: 'rabbi-orientation',
          attribution: { kind: 'rabbi', producerId: 'rabbi-orientation' },
        },
      );
    } catch (err) {
      return c.json({ error: String(err).slice(0, 300), slug }, 502);
    }
    let payload = streamed.content.trim();
    if (!payload && streamed.reasoning_content) {
      const m = streamed.reasoning_content.match(/\{[\s\S]*"orientation"[\s\S]*\}/);
      if (m) payload = m[0];
    }
    const fenced = payload.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) payload = fenced[1].trim();
    if (!payload) return c.json({ error: 'empty payload', slug, _ms: streamed.elapsed_ms }, 502);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      const repaired = payload.replace(/,(\s*[}\]])/g, '$1').replace(/\r/g, '');
      try {
        parsed = JSON.parse(repaired);
      } catch {
        return c.json(
          { error: `non-JSON: ${String(err).slice(0, 200)}`, slug, raw: payload.slice(0, 500) },
          502,
        );
      }
    }
    if (!validateOrientation(parsed)) {
      return c.json({ error: 'schema mismatch', slug, got: parsed }, 502);
    }
    return c.json({
      slug,
      canonical: entry.canonical,
      ...parsed,
      _ms: Date.now() - t0,
    });
  });
  app.get('/api/admin/rabbi-enrich-unified/:slug', async (c) => {
    if (!c.env.AI) return c.json({ error: 'AI binding not available' }, 503);
    const rr = getRabbiEntryOr404(c, RABBI_PLACES.rabbis);
    if (!rr.ok) return rr.response;
    const { slug, entry } = rr;

    const refresh = c.req.query('refresh') === '1';
    const cache = c.env.CACHE;
    const cacheKey = keyForRabbiEnriched(slug);
    if (cache && !refresh) {
      const hit = await kvGetJSONAs<EnrichedRabbiRecord>(cache, cacheKey, enrichedRabbiShape);
      if (hit) return c.json({ slug, record: hit, _cached: true });
    }

    const result = await enrichRabbiUnified(slug, entry, c.env, cache);
    if (!result.ok) {
      return c.json({ error: result.error, slug, raw: result.raw, _ms: result.ms }, 502);
    }
    if (cache) {
      await cache.put(cacheKey, JSON.stringify(result.record), {
        expirationTtl: 60 * 60 * 24 * 365,
      });
    }
    return c.json({
      slug,
      record: result.record,
      _ms: result.ms,
      _promptChars: result.promptChars,
      _usage: result.usage,
    });
  });
  app.get('/api/admin/rabbi-wikidata/:slug', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);
    const slug = c.req.param('slug');
    if (!RABBI_PLACES.rabbis[slug]) return c.json({ error: `unknown slug: ${slug}` }, 404);

    const refresh = c.req.query('refresh') === '1';
    const cacheKey = keyForRabbiWikidata(slug);
    if (!refresh) {
      const hit = await kvGetJSONAs<object>(cache, cacheKey, compiledBlobShape);
      if (hit) return c.json({ slug, record: hit, _cached: true });
    }

    const enriched = await readEnriched(cache, slug);
    if (!enriched) return c.json({ error: 'run unified stage first', slug }, 412);
    const wd = enriched.refs.wikidata;
    if (!wd) return c.json({ error: 'no wikidata QID on enriched record', slug }, 422);

    const m = wd.match(/Q\d+/);
    if (!m) return c.json({ error: `unparseable wikidata ref: ${wd}`, slug }, 422);
    const qid = m[0];

    const t0 = Date.now();
    let record: WikidataStageRecord | null;
    try {
      record = await fetchWikidataEntity(qid);
    } catch (err) {
      return c.json({ error: `wikidata fetch: ${String(err).slice(0, 200)}`, slug }, 502);
    }
    if (!record) return c.json({ error: 'wikidata entity not found', slug, qid }, 404);

    await cache.put(cacheKey, JSON.stringify(record), { expirationTtl: RABBI_STAGE_TTL_S });
    return c.json({ slug, record, _ms: Date.now() - t0 });
  });
  app.get('/api/admin/rabbi-wiki-bio/:slug', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);
    const slug = c.req.param('slug');
    if (!RABBI_PLACES.rabbis[slug]) return c.json({ error: `unknown slug: ${slug}` }, 404);

    const refresh = c.req.query('refresh') === '1';
    const cacheKey = keyForRabbiWikiBio(slug);
    if (!refresh) {
      const hit = await kvGetJSONAs<object>(cache, cacheKey, compiledBlobShape);
      if (hit) return c.json({ slug, record: hit, _cached: true });
    }

    const enriched = await readEnriched(cache, slug);
    if (!enriched) return c.json({ error: 'run unified stage first', slug }, 412);
    const enWiki = enriched.refs.enWiki ?? null;
    const heWiki = enriched.refs.heWiki ?? null;
    if (!enWiki && !heWiki) return c.json({ error: 'no wiki refs on enriched record', slug }, 422);

    const t0 = Date.now();
    const [en, he] = await Promise.all([
      enWiki ? fetchWikipediaExtract(enWiki, 'en').catch(() => null) : Promise.resolve(null),
      heWiki ? fetchWikipediaExtract(heWiki, 'he').catch(() => null) : Promise.resolve(null),
    ]);
    const record: WikiBioStageRecord = {
      enWiki: en,
      heWiki: he,
      fetchedAt: new Date().toISOString(),
    };
    await cache.put(cacheKey, JSON.stringify(record), { expirationTtl: RABBI_STAGE_TTL_S });
    return c.json({ slug, record, _ms: Date.now() - t0 });
  });
  app.post('/api/admin/rabbi-compile/graph', async (c) => {
    if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

    const t0 = Date.now();
    const all = await readAllEnriched(cache);

    // Seed nodes from each enriched record's local view.
    const nodes: Record<string, RabbiGraphNode> = {};
    for (const r of all) {
      nodes[r.slug] = {
        slug: r.slug,
        canonical: r.canonical.en,
        canonicalHe: r.canonical.he,
        generation: r.generation,
        region: r.region,
        academy: r.academy,
        primaryTeacher: r.primaryTeacher,
        primaryStudent: r.primaryStudent,
        teachers: r.teachers.map((e) => ({
          slug: e.slug,
          name: e.name,
          weight: e.weight,
          source: e.source,
        })),
        students: r.students.map((e) => ({
          slug: e.slug,
          name: e.name,
          weight: e.weight,
          source: e.source,
        })),
        family: r.family.map((e) => ({
          slug: e.slug,
          name: e.name,
          relation: e.relation,
          weight: e.weight,
          source: e.source,
        })),
        opposed: r.opposed.map((e) => ({
          slug: e.slug,
          name: e.name,
          weight: e.weight,
          source: e.source,
        })),
      };
    }

    // Bidirectional reciprocity. If A.teachers includes B, ensure B.students
    // includes A. Same for student↔teacher and family inversions. Skip when
    // an inverted edge is already present (dedupe by slug); otherwise add it.
    const ensureEdge = (
      bucket: Array<{ slug: string | null; name: string; weight: number | null; source: string }>,
      edge: { slug: string; name: string; weight: number | null; source: string },
    ) => {
      if (bucket.some((e) => e.slug === edge.slug)) return;
      bucket.push(edge);
    };

    for (const node of Object.values(nodes)) {
      for (const t of node.teachers) {
        if (!t.slug) continue;
        const other = nodes[t.slug];
        if (!other) continue;
        ensureEdge(other.students, {
          slug: node.slug,
          name: node.canonical,
          weight: t.weight,
          source: t.source,
        });
      }
      for (const s of node.students) {
        if (!s.slug) continue;
        const other = nodes[s.slug];
        if (!other) continue;
        ensureEdge(other.teachers, {
          slug: node.slug,
          name: node.canonical,
          weight: s.weight,
          source: s.source,
        });
      }
      for (const f of node.family) {
        if (!f.slug) continue;
        const other = nodes[f.slug];
        if (!other) continue;
        const inv = FAMILY_INVERSE[f.relation] ?? 'other';
        if (other.family.some((e) => e.slug === node.slug && e.relation === inv)) continue;
        other.family.push({
          slug: node.slug,
          name: node.canonical,
          relation: inv,
          weight: f.weight,
          source: f.source,
        });
      }
      for (const o of node.opposed) {
        if (!o.slug) continue;
        const other = nodes[o.slug];
        if (!other) continue;
        ensureEdge(other.opposed, {
          slug: node.slug,
          name: node.canonical,
          weight: o.weight,
          source: o.source,
        });
      }
    }

    const blob: RabbiGraphBlob = {
      generatedAt: new Date().toISOString(),
      count: Object.keys(nodes).length,
      nodes,
    };
    await cache.put(keyForRabbiGraph(), JSON.stringify(blob), { expirationTtl: RABBI_STAGE_TTL_S });
    return c.json({ ok: true, count: blob.count, _ms: Date.now() - t0 });
  });
  app.post('/api/admin/rabbi-compile/cohort', async (c) => {
    if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

    const t0 = Date.now();
    const all = await readAllEnriched(cache);
    const byGeneration: Record<string, string[]> = {};
    for (const r of all) {
      if (!r.generation) continue;
      const slugs = byGeneration[r.generation] ?? [];
      byGeneration[r.generation] = slugs;
      slugs.push(r.slug);
    }
    const bySage: Record<string, string[]> = {};
    for (const [, slugs] of Object.entries(byGeneration)) {
      for (const slug of slugs) {
        bySage[slug] = slugs.filter((s) => s !== slug);
      }
    }
    const blob: RabbiCohortBlob = {
      generatedAt: new Date().toISOString(),
      byGeneration,
      bySage,
    };
    await cache.put(keyForRabbiCohort(), JSON.stringify(blob), {
      expirationTtl: RABBI_STAGE_TTL_S,
    });
    return c.json({
      ok: true,
      generations: Object.keys(byGeneration).length,
      sages: Object.keys(bySage).length,
      _ms: Date.now() - t0,
    });
  });
  app.post('/api/admin/rabbi-compile/places-index', async (c) => {
    if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

    const t0 = Date.now();
    const all = await readAllEnriched(cache);
    const byPlace: Record<string, string[]> = {};
    for (const r of all) {
      for (const place of r.places ?? []) {
        const key = place.trim();
        if (!key) continue;
        const slugs = byPlace[key] ?? [];
        byPlace[key] = slugs;
        slugs.push(r.slug);
      }
    }
    const blob: RabbiPlacesIndexBlob = {
      generatedAt: new Date().toISOString(),
      byPlace,
    };
    await cache.put(keyForRabbiPlacesIndex(), JSON.stringify(blob), {
      expirationTtl: RABBI_STAGE_TTL_S,
    });
    return c.json({ ok: true, places: Object.keys(byPlace).length, _ms: Date.now() - t0 });
  });
  app.post('/api/admin/rabbi-compile/academy-roster', async (c) => {
    if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

    const t0 = Date.now();
    const all = await readAllEnriched(cache);
    const byAcademy: Record<string, string[]> = {};
    for (const r of all) {
      if (!r.academy) continue;
      const slugs = byAcademy[r.academy] ?? [];
      byAcademy[r.academy] = slugs;
      slugs.push(r.slug);
    }
    const blob: RabbiAcademyRosterBlob = {
      generatedAt: new Date().toISOString(),
      byAcademy,
    };
    await cache.put(keyForRabbiAcademyRoster(), JSON.stringify(blob), {
      expirationTtl: RABBI_STAGE_TTL_S,
    });
    return c.json({ ok: true, academies: Object.keys(byAcademy).length, _ms: Date.now() - t0 });
  });
  // Read endpoints for the compiled blobs (consumed by the EnrichmentPage and
  // later by daf views).
  app.get('/api/admin/rabbi-graph', async (c) => {
    if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
    const key = keyForRabbiGraph();
    const hit = await kvGetJSONAs<object>(c.env.CACHE, key, rabbiGraphBlobShape);
    if (!hit) return c.json({ error: 'not compiled' }, 404);
    return c.json(hit);
  });
  app.get('/api/admin/rabbi-cohort', async (c) => {
    if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
    const key = keyForRabbiCohort();
    const hit = await kvGetJSONAs<object>(c.env.CACHE, key, compiledBlobShape);
    if (!hit) return c.json({ error: 'not compiled' }, 404);
    return c.json(hit);
  });
  app.get('/api/rabbi-network', async (c) => {
    if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
    const key = keyForRabbiVoiceGraph();
    const blob = await kvGetJSONAs<VoiceGraphBlob>(c.env.CACHE, key, voiceGraphBlobShape);
    if (!blob) return c.json({ error: 'not compiled' }, 404);
    const { nodes, edges, ...meta } = blob;
    return c.json({ ...meta, nodes: Object.keys(nodes).length, edges: Object.keys(edges).length });
  });
  app.get('/api/rabbi-network/:slug', async (c) => {
    if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
    const key = keyForRabbiVoiceGraph();
    const blob = await kvGetJSONAs<VoiceGraphBlob>(c.env.CACHE, key, voiceGraphBlobShape);
    if (!blob) return c.json({ error: 'not compiled' }, 404);
    const slug = c.req.param('slug');
    const ego = egoSlice(blob, slug);
    if (!ego) return c.json({ error: 'not in the voice graph yet', dapim: blob.dapim }, 404);
    return c.json({ type: 'rabbi', id: slug, builtAt: blob.builtAt, dapim: blob.dapim, ...ego });
  });
  app.get('/api/admin/voice-graph/status', async (c) => {
    if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
    const [state, blob] = await Promise.all([
      c.env.CACHE.get(VOICE_GRAPH_STATE_KEY),
      c.env.CACHE.get(keyForRabbiVoiceGraph()),
    ]);
    // Collapse the heavy graph payloads to counts — status is a meta view.
    const meta = (raw: string | null, key: string) => {
      const b = parseJSONAs<
        Record<string, unknown> & {
          nodes?: object;
          edges?: object;
          dafsSeen?: object;
          staging?: { nodes?: object; edges?: object; dafsSeen?: object } & Record<string, unknown>;
        }
      >(raw, compiledBlobShape, key);
      if (!b) return null;
      const shrink = (o: Record<string, unknown>) => {
        const { nodes, edges, dafsSeen, ...rest } = o as {
          nodes?: object;
          edges?: object;
          dafsSeen?: object;
        } & Record<string, unknown>;
        return {
          ...rest,
          ...(nodes ? { nodes: Object.keys(nodes).length } : {}),
          ...(edges ? { edges: Object.keys(edges).length } : {}),
          ...(dafsSeen ? { dapimSeen: Object.keys(dafsSeen).length } : {}),
        };
      };
      return b.staging ? { ...shrink(b), staging: shrink(b.staging) } : shrink(b);
    };
    return c.json({
      state: meta(state, VOICE_GRAPH_STATE_KEY),
      blob: meta(blob, keyForRabbiVoiceGraph()),
    });
  });
  app.post('/api/admin/voice-graph/step', async (c) => {
    if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
    const result = await runVoiceGraphBackfill(c.env, { force: true });
    return c.json({ result });
  });
  app.post('/api/admin/voice-graph/rebuild', async (c) => {
    if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
    if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
    await c.env.CACHE.delete(VOICE_GRAPH_STATE_KEY);
    return c.json({
      ok: true,
      note: 'state cleared; next warm ticks (or /step) rebuild from scratch',
    });
  });
  app.get('/api/admin/rabbi-places-index', async (c) => {
    if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
    const key = keyForRabbiPlacesIndex();
    const hit = await kvGetJSONAs<object>(c.env.CACHE, key, compiledBlobShape);
    if (!hit) return c.json({ error: 'not compiled' }, 404);
    return c.json(hit);
  });
  app.get('/api/admin/rabbi-academy-roster', async (c) => {
    if (!c.env.CACHE) return c.json({ error: 'CACHE unavailable' }, 503);
    const key = keyForRabbiAcademyRoster();
    const hit = await kvGetJSONAs<object>(c.env.CACHE, key, compiledBlobShape);
    if (!hit) return c.json({ error: 'not compiled' }, 404);
    return c.json(hit);
  });
  // Coverage report — counts each rabbi-* prefix and surfaces compile timestamps.
  // Drives the Rabbis tab coverage strip in EnrichmentPage. Cheap KV listings.
  app.get('/api/admin/rabbi-cache-stats', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE unavailable' }, 503);

    const countPrefix = async (prefix: string): Promise<number> => {
      let n = 0;
      let cursor: string | undefined;
      do {
        const page = await cache.list({ prefix, cursor, limit: 1000 });
        n += page.keys.length;
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return n;
    };

    const readGeneratedAt = async (key: string): Promise<string | null> => {
      const obj = await kvGetJSONAs<{ generatedAt?: unknown }>(cache, key, compiledBlobShape);
      return typeof obj?.generatedAt === 'string' ? obj.generatedAt : null;
    };

    const totalSlugs = Object.entries(RABBI_PLACES.rabbis).filter(([, r]) =>
      isRabbinicEntry(r),
    ).length;

    const [
      unified,
      wikidata,
      wikiBio,
      influences,
      appearances,
      keyDafim,
      graphAt,
      cohortAt,
      placesAt,
      academyAt,
    ] = await Promise.all([
      countPrefix('rabbi-enriched:v1:'),
      countPrefix('rabbi-wikidata:v1:'),
      countPrefix('rabbi-wiki-bio:v1:'),
      countPrefix('rabbi-influences:v1:'),
      countPrefix('rabbi-appearances:v1:'),
      countPrefix('rabbi-key-dafim:v1:'),
      readGeneratedAt(keyForRabbiGraph()),
      readGeneratedAt(keyForRabbiCohort()),
      readGeneratedAt(keyForRabbiPlacesIndex()),
      readGeneratedAt(keyForRabbiAcademyRoster()),
    ]);

    return c.json({
      totalSlugs,
      perSage: { unified, wikidata, wikiBio, influences, appearances, keyDafim },
      globals: {
        graph: graphAt,
        cohort: cohortAt,
        placesIndex: placesAt,
        academyRoster: academyAt,
      },
    });
  });
}
