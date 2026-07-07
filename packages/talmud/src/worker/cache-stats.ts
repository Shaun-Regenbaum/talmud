/**
 * Aggregate cache-fullness numbers for the registry-driven pipeline plus
 * rabbi-bio coverage derived from the bundled rabbi-places.json.
 *
 * Three cache families are reported:
 *   1. source — per-daf source slices (HebrewBooks, Sefaria gemara,
 *      Sefaria commentaries). Denominator is the total daf count.
 *   2. marks  — one row per registered mark (CODE_MARKS + KV-defined),
 *      keyed `mark:<id>:<cache_version>:<daf>`. Denominator is the total
 *      daf count, since marks are computed once per daf.
 *   3. enrichments — one row per registered enrichment, keyed
 *      `enrich:<id>:<cache_version>:<instance>[:<daf>]`. Denominator is
 *      ill-defined (instance count varies per mark per daf), so we surface
 *      raw count only.
 *
 * Reads are expensive (each prefix is paginated via kv.list at 1000 keys
 * per page) and the value samples hold real cached entries in memory, so
 * computeCacheStats runs ONLY from the generator's warm cron (warm-cron
 * refreshStats), which stashes the result under CACHE_STATS_KEY. The reader's
 * /api/admin/cache-stats serves that copy verbatim and never recomputes —
 * the scan has OOM'd reader isolates (128 MB).
 */

import { BAVEL_SHAPE, GEO_CITIES, ISRAEL_SHAPE } from '../client/geoShapes';
import curatedYerushalmiData from '../lib/data/curated-yerushalmi-parallels.json';
import rabbiFamilyData from '../lib/data/rabbi-family.json';
import rabbiHierarchyData from '../lib/data/rabbi-hierarchy.json';
import rabbiOrientationData from '../lib/data/rabbi-orientation.json';
import rabbiPlacesData from '../lib/data/rabbi-places.json';
import type { GcTarget } from './cache-gc';
import { CODE_ENRICHMENTS, CODE_MARKS } from './code-marks';
import { listEnrichments, listMarks } from './studio-registry';
import type { EnrichmentScope } from './studio-schema';
import { getWarmTotal } from './warm-cron';

// v5: mark/enrichment rows carry a per-cache-version breakdown (`versions` +
// `staleCount`) + the `observations` bucket (rabbi.observations reverse index).
// v6: rows also carry `heCount` and `versions` buckets Hebrew entries under
// `<version>:he`, so the dashboard can report EN vs HE cache coverage.
// v7: source buckets carry sampled `aligned` + a `denom` (DafYomi is per-daf,
// not per-amud), and a fourth `dafyomi` source. Bumped so a stale v6 payload
// (missing those fields) isn't served.
// v8: adds `sources` — a flat, per-content-piece breakdown (each Sefaria
// sub-source + each DafYomi content type), tagged with its origin (HB/Sefaria/
// DY). The old 4-bucket `source` is kept for back-compat.
export const CACHE_STATS_KEY = 'cache-stats:v8';

export type SourceOrigin = 'HB' | 'Sefaria' | 'DY' | 'Wikipedia' | 'Custom';
/** One named content piece in Content-In: where it comes from, how many dapim
 *  carry it, and (sampled) how many actually have content. `id` is stable; the
 *  UI maps it to a friendly label. */
export interface SourceRow {
  id: string;
  origin: SourceOrigin;
  count: number;
  denom: number;
  percent: number;
  aligned: AlignedSample | null;
  /** 'daf' (default): keyed per amud, so count/denom is a coverage fraction of
   *  all dapim. 'entity': keyed per rabbi / per verse, so there is no daf
   *  denominator — the UI shows the cached count + `unit` and no percentage. */
  scope?: 'daf' | 'entity';
  /** For scope 'entity': what each cached row is (e.g. 'rabbis', 'verses'). */
  unit?: string;
}

export interface CacheStats {
  generatedAt: string;
  total: number;
  source: {
    hebrewbooks: SourceBucket;
    gemara: SourceBucket;
    commentaries: SourceBucket;
    dafyomi: SourceBucket;
  };
  /** Per-content-piece source breakdown for Content-In (HB / Sefaria / DY). */
  sources: SourceRow[];
  marks: MarkCacheRow[];
  enrichments: EnrichmentCacheRow[];
  // rabbi.observations reverse index (collect-only). `slices` = rabbi×daf
  // observation slices written so far; `rabbis` = distinct rabbis with at
  // least one slice (the dirty-marker count).
  observations: {
    slices: number;
    rabbis: number;
  };
  rabbis: {
    totalRabbis: number;
    withBio: number; // any bio text
    withSefariaBio: number | null; // bio sourced from Sefaria; null when provenance isn't tracked yet
    withWiki: number; // Hebrew Wikipedia link
    withGeneration: number; // generation set and not 'unknown'
    withRegion: number; // region is 'israel' | 'bavel'
    withPlaces: number; // non-empty places array
    withHierarchyEdges: number; // at least one teacher/student/contemporary edge
    withFamily: number; // at least one familial relation in rabbi-family.json
    withOrientation: number; // orientation (mystical / practical) classified in rabbi-orientation.json
    unknownRabbis: null;
  };
  hierarchy: {
    totalNodes: number;
    processedNodes: number;
    nodesWithEdges: number;
    totalEdges: number;
    generatedAt: string | null;
  };
}

interface CacheBucket {
  count: number;
  percent: number;
}

/** A sampled "% of cached entries that actually aligned" figure. Reading every
 *  value Shas-wide is the slow scan we avoid, so this samples up to N entries
 *  per source and extrapolates. `pct` is aligned/sampled as a 0-100 number. */
export interface AlignedSample {
  sampled: number;
  aligned: number;
  pct: number;
}
/** A source-spine coverage row: how many dapim are cached + (sampled) how many
 *  of those produced a usable alignment. `aligned` is null when nothing's
 *  cached to sample. */
export interface SourceBucket extends CacheBucket {
  aligned: AlignedSample | null;
  /** Denominator `count`/`percent` are measured against. Most sources are
   *  per-amud (= the daf total); DafYomi is per-daf, so it carries its own. */
  denom: number;
}

export interface MarkCacheRow {
  id: string;
  label: string;
  source: 'code' | 'kv';
  cache_version: string;
  count: number; // entries at the CURRENT cache_version (English)
  heCount: number; // entries at the CURRENT cache_version, Hebrew (:he)
  percent: number;
  versions: Record<string, number>; // count per cache version present in KV (`:he` suffix = Hebrew)
  staleCount: number; // entries at superseded (non-current) versions
  /** Other marks this mark (or its enrichments) depends on — e.g. tidbit
   *  depends on argument-overview. Foreign mark ids only. */
  dependsOn: string[];
  /** Content-In sources this mark (or its enrichments) pulls from — the
   *  source-string deps (gemara, commentaries, mishna, context, …). */
  dependsOnSources: string[];
}

export interface EnrichmentCacheRow {
  id: string;
  label: string;
  target_mark: string;
  scope: EnrichmentScope;
  source: 'code' | 'kv';
  cache_version: string;
  count: number; // entries at the CURRENT cache_version (English)
  heCount: number; // entries at the CURRENT cache_version, Hebrew (:he)
  /** Local scope only: distinct dapim cached at the current version (EN). The
   *  exact warmed-amud denominator for the shas-cost projection. */
  coverageDapim?: number;
  versions: Record<string, number>;
  staleCount: number;
}

interface RabbisFile {
  rabbis: Record<
    string,
    {
      bio?: string | null;
      wiki?: string | null;
      bioSource?: 'sefaria' | 'wikipedia' | 'both' | null; // future provenance flag
      numSources?: number | null;
      generation?: string | null;
      region?: 'israel' | 'bavel' | null;
      places?: string[];
    }
  >;
}
const RABBIS = rabbiPlacesData as unknown as RabbisFile;

interface FamilyFile {
  nodes: Record<string, { family?: Array<{ name: string; relation: string }> }>;
}
const FAMILY = rabbiFamilyData as unknown as FamilyFile;

interface OrientationFile {
  nodes: Record<string, { orientation?: 'mystical' | 'practical' | 'mixed' | 'unknown' | null }>;
}
const ORIENTATION = rabbiOrientationData as unknown as OrientationFile;

interface HierarchyFile {
  generatedAt: string | null;
  totalNodes: number;
  processedNodes: number;
  nodesWithEdges: number;
  nodes: Record<
    string,
    {
      teachers: string[];
      students: string[];
      colleagues: string[];
    }
  >;
}
const HIERARCHY = rabbiHierarchyData as unknown as HierarchyFile;

// ---- Per-source alignment predicates -------------------------------------
// "Aligned" = the cached source value actually carries usable, anchored content
// (not an empty fetch or a `{__failed:true}` negative-cache marker). Each takes
// the parsed cached value and returns whether that daf aligned for the source.
type AlignPredicate = (v: unknown) => boolean;

function failed(v: unknown): boolean {
  return !!v && typeof v === 'object' && (v as { __failed?: boolean }).__failed === true;
}
const alignedHebrewBooks: AlignPredicate = (v) => {
  if (!v || failed(v)) return false;
  const d = v as { main?: string; rashi?: string; tosafot?: string };
  return !!((d.main?.length ?? 0) || (d.rashi?.length ?? 0) || (d.tosafot?.length ?? 0));
};
const alignedGemara: AlignPredicate = (v) => {
  if (!v || failed(v)) return false;
  const d = v as { segments_he?: unknown[]; segments_en?: unknown[] };
  return (
    (Array.isArray(d.segments_he) && d.segments_he.length > 0) ||
    (Array.isArray(d.segments_en) && d.segments_en.length > 0)
  );
};
const alignedCommentaries: AlignPredicate = (v) => {
  if (!v || failed(v)) return false;
  const d = v as { by_commentator?: Record<string, unknown> };
  return !!d.by_commentator && Object.keys(d.by_commentator).length > 0;
};
const _alignedDafyomi: AlignPredicate = (v) => {
  if (!v || failed(v)) return false;
  const d = v as { amudim?: { a?: Record<string, unknown>; b?: Record<string, unknown> } };
  // An amud counts only if at least one of its content-type blocks is itself a
  // non-empty object — a parse can leave empty {} blocks, which shouldn't read
  // as aligned.
  const hasContent = (amud?: Record<string, unknown>): boolean =>
    !!amud &&
    Object.values(amud).some(
      (c) => !!c && typeof c === 'object' && Object.keys(c as object).length > 0,
    );
  return hasContent(d.amudim?.a) || hasContent(d.amudim?.b);
};

// Generic "we actually got content" predicate for sources whose cached value is
// the raw array/map (empty [] or {} means the daf has none — e.g. no mishnah, no
// yerushalmi parallel). Distinguishes real content from an empty/failed fetch.
const nonEmptyValue: AlignPredicate = (v) => {
  if (!v || failed(v)) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
};

// Commentary-works (keyForCommentaryWorks) caches an OBJECT
// `{ works: CommentaryWork[], tractate, page, fetchedAt }` (or `{ error }`), so
// nonEmptyValue would read every non-error fetch as "aligned" (the wrapper keys
// are always present). Aligned = it actually carries at least one work.
const alignedCommentaryWorks: AlignPredicate = (v) => {
  if (!v || failed(v)) return false;
  const d = v as { works?: unknown[] };
  return Array.isArray(d.works) && d.works.length > 0;
};

// DafYomi content types (Kollel Iyun HaDaf), in display order. See
// src/lib/sefref/dafyomi/masechtos.ts (DafyomiContentType).
const DAFYOMI_TYPES = [
  'insights',
  'background',
  'halacha',
  'tosfos',
  'review',
  'points',
  'hebcharts',
  'yerushalmi',
  'revach',
] as const;

// Read KV values in small sequential batches, streaming each raw value to
// `onValue` and dropping it immediately. One Promise.all over hundreds of keys
// holds every value in memory at once — with large values (hb HTML pages,
// commentary bundles) that peak has OOM'd 128 MB isolates.
const VALUE_READ_BATCH = 25;

async function readValuesBatched(
  cache: KVNamespace,
  keys: string[],
  onValue: (raw: string) => void,
): Promise<void> {
  for (let i = 0; i < keys.length; i += VALUE_READ_BATCH) {
    const raws = await Promise.all(keys.slice(i, i + VALUE_READ_BATCH).map((k) => cache.get(k)));
    for (const raw of raws) if (raw != null) onValue(raw);
  }
}

/**
 * Sample DafYomi entries once and tally, per content type, how many of the
 * sampled dapim carry it (in either amud, with a non-empty block). Also reports
 * how many had ANY content (the overall "aligned" figure). One bounded pass
 * powers both the DafYomi overall row and its per-type breakdown.
 */
async function sampleDafyomiTypes(
  cache: KVNamespace,
  sampleSize = 300,
): Promise<{ sampled: number; alignedAny: number; byType: Record<string, number> }> {
  const keys: string[] = [];
  let cursor: string | undefined;
  while (keys.length < sampleSize) {
    const res = (await cache.list({
      prefix: 'dafyomi:v5:',
      cursor,
      limit: Math.min(1000, sampleSize - keys.length),
    })) as {
      keys: Array<{ name: string }>;
      list_complete: boolean;
      cursor?: string;
    };
    for (const k of res.keys) keys.push(k.name);
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  const byType: Record<string, number> = {};
  let sampled = 0;
  let alignedAny = 0;
  await readValuesBatched(cache, keys, (raw) => {
    sampled++;
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      return;
    }
    if (failed(v)) return;
    const d = v as { amudim?: { a?: Record<string, unknown>; b?: Record<string, unknown> } };
    const present = new Set<string>();
    for (const amud of [d.amudim?.a, d.amudim?.b]) {
      if (!amud) continue;
      for (const [type, block] of Object.entries(amud)) {
        if (block && typeof block === 'object' && Object.keys(block as object).length > 0)
          present.add(type);
      }
    }
    if (present.size > 0) alignedAny++;
    for (const t of present) byType[t] = (byType[t] ?? 0) + 1;
  });
  return { sampled, alignedAny, byType };
}

/**
 * Sample up to `sampleSize` cached entries under `prefix`, read their values,
 * and report how many satisfy `isAligned`. Bounded (not a Shas-wide scan) so it
 * stays cheap enough to run inside the cron-warmed computeCacheStats. Returns
 * null when nothing is cached to sample.
 */
export async function sampleAligned(
  cache: KVNamespace,
  prefix: string,
  isAligned: AlignPredicate,
  sampleSize = 300,
): Promise<AlignedSample | null> {
  const keys: string[] = [];
  let cursor: string | undefined;
  while (keys.length < sampleSize) {
    const res = (await cache.list({
      prefix,
      cursor,
      limit: Math.min(1000, sampleSize - keys.length),
    })) as {
      keys: Array<{ name: string }>;
      list_complete: boolean;
      cursor?: string;
    };
    for (const k of res.keys) keys.push(k.name);
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  if (keys.length === 0) return null;
  let sampled = 0;
  let aligned = 0;
  await readValuesBatched(cache, keys, (raw) => {
    sampled++;
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      return;
    }
    if (isAligned(v)) aligned++;
  });
  if (sampled === 0) return null;
  return { sampled, aligned, pct: Math.round((aligned / sampled) * 1000) / 10 };
}

async function countPrefix(cache: KVNamespace, prefix: string): Promise<number> {
  let cursor: string | undefined;
  let count = 0;
  for (;;) {
    const res = (await cache.list({ prefix, cursor, limit: 1000 })) as {
      keys: Array<{ name: string }>;
      list_complete: boolean;
      cursor?: string;
    };
    count += res.keys.length;
    if (res.list_complete) break;
    cursor = res.cursor;
    if (!cursor) break;
  }
  return count;
}

/**
 * Scan a `mark:<id>:` / `enrich:<id>:` prefix (all versions) and bucket the
 * keys by their cache-version segment. Key shape is
 * `<family>:<id>:<version>:<rest>`, so after stripping the passed prefix
 * (which ends in the trailing colon after <id>) the version is the first
 * colon-delimited segment of what remains. The trailing colon in `prefix`
 * keeps `mark:argument:` from matching `mark:argument-move:…`.
 */
/** Per-version key tallies for one producer prefix: total `counts`, plus
 *  `dapim` = distinct dapim each version is cached on (exact for daf-scoped
 *  keys; callers read it only for local-scope producers, where the trailing
 *  `<tractate>:<page>` is always present). */
async function countByVersion(
  cache: KVNamespace,
  prefix: string,
): Promise<{ counts: Record<string, number>; dapim: Record<string, number> }> {
  const counts: Record<string, number> = {};
  const dafSets: Record<string, Set<string>> = {};
  let cursor: string | undefined;
  for (;;) {
    const res = (await cache.list({ prefix, cursor, limit: 1000 })) as {
      keys: Array<{ name: string }>;
      list_complete: boolean;
      cursor?: string;
    };
    for (const k of res.keys) {
      const rest = k.name.slice(prefix.length);
      const segs = rest.split(':');
      const version = segs[0] || '(none)';
      // keyForMark/keyForEnrichment insert a `he` segment right after the
      // cache_version for Hebrew output; bucket those under `<version>:he`
      // so the usage page can report EN vs HE coverage separately.
      const bucket = segs[1] === 'he' ? `${version}:he` : version;
      counts[bucket] = (counts[bucket] ?? 0) + 1;
      // Distinct-daf tracking: the daf is the trailing `<tractate>:<page>`,
      // after stripping an optional `q_<hash>` qualifier. Global keys (no daf)
      // yield a spurious pair, but those are gated out at the read site (local
      // scope only). This is the exact warmed-amud denominator for the cost
      // model — independent of any other producer's coverage.
      const tail = segs[segs.length - 1]?.startsWith('q_') ? segs.slice(0, -1) : segs;
      if (tail.length >= 2) {
        const daf = `${tail[tail.length - 2]}:${tail[tail.length - 1]}`;
        const set = dafSets[bucket] ?? new Set<string>();
        set.add(daf);
        dafSets[bucket] = set;
      }
    }
    if (res.list_complete) break;
    cursor = res.cursor;
    if (!cursor) break;
  }
  const dapim: Record<string, number> = {};
  for (const [b, s] of Object.entries(dafSets)) dapim[b] = s.size;
  return { counts, dapim };
}

function staleSum(versions: Record<string, number>, current: string): number {
  let sum = 0;
  const currentHe = `${current}:he`;
  // The current version in EITHER language is fresh; everything else (older
  // versions, in either language) is stale.
  for (const [v, n] of Object.entries(versions)) if (v !== current && v !== currentHe) sum += n;
  return sum;
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/** Merge code-defined marks/enrichments with KV-defined ones. KV wins on id
 *  collision. Mirrors the precedence used by /api/run. */
type MergedMark = {
  id: string;
  label: string;
  source: 'code' | 'kv';
  cache_version: string;
  dependencies: unknown[];
};
async function mergedMarks(cache: KVNamespace): Promise<MergedMark[]> {
  const kv = await listMarks({ CACHE: cache });
  const byId = new Map<string, MergedMark>();
  for (const m of CODE_MARKS)
    byId.set(m.id, {
      id: m.id,
      label: m.label,
      source: 'code',
      cache_version: m.cache_version,
      dependencies: (m as { dependencies?: unknown[] }).dependencies ?? [],
    });
  for (const m of kv)
    byId.set(m.id, {
      id: m.id,
      label: m.label,
      source: 'kv',
      cache_version: m.cache_version,
      dependencies: (m as { dependencies?: unknown[] }).dependencies ?? [],
    });
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The other MARK a dependency descriptor points at, if any. `{mark:X}` → X;
 *  `{enrichment:id}` → the enrichment's own `target_mark` (resolved via the
 *  registry, since KV enrichment ids needn't be `<mark>.*`); source-string deps
 *  ('gemara', 'context', …) → null. Powers the per-mark "depends on" chips. */
// Source-string deps (Content-In inputs) a producer reads, as opposed to the
// {mark}/{enrichment} graph edges. See MarkDependency/EnrichmentDependency.
const SOURCE_DEPS = new Set([
  'gemara',
  'commentaries',
  'mishna',
  'context',
  'context-light',
  'halacha-refs',
  'yerushalmi-text',
  'incoming',
]);
function sourceDepOf(dep: unknown): string | null {
  return typeof dep === 'string' && SOURCE_DEPS.has(dep) ? dep : null;
}

function foreignMarkOf(
  dep: unknown,
  markOfEnrichment: (id: string) => string | undefined,
): string | null {
  if (!dep || typeof dep !== 'object') return null;
  const d = dep as { mark?: string; enrichment?: string };
  if (typeof d.mark === 'string') return d.mark;
  if (typeof d.enrichment === 'string')
    return markOfEnrichment(d.enrichment) ?? d.enrichment.split('.')[0];
  return null;
}

type MergedEnrichment = {
  id: string;
  label: string;
  target_mark: string;
  scope: EnrichmentScope;
  source: 'code' | 'kv';
  cache_version: string;
  dependencies: unknown[];
};
async function mergedEnrichments(cache: KVNamespace): Promise<MergedEnrichment[]> {
  const kv = await listEnrichments({ CACHE: cache });
  const byId = new Map<string, MergedEnrichment>();
  for (const e of CODE_ENRICHMENTS)
    byId.set(e.id, {
      id: e.id,
      label: e.label,
      target_mark: e.target_mark,
      scope: e.scope,
      source: 'code',
      cache_version: e.cache_version,
      dependencies: (e as { dependencies?: unknown[] }).dependencies ?? [],
    });
  // KV registry stores `mark` (singular) where code uses `target_mark`; map
  // both into the same shape so the row is consistent regardless of source.
  for (const e of kv)
    byId.set(e.id, {
      id: e.id,
      label: e.label,
      target_mark: e.mark,
      scope: e.scope,
      source: 'kv',
      cache_version: e.cache_version,
      dependencies: (e as { dependencies?: unknown[] }).dependencies ?? [],
    });
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Version-agnostic id prefixes + current versions for every mark + enrichment
 *  (code and KV). The input to the stale-cache GC (src/worker/cache-gc.ts). */
export async function cacheGcTargets(cache: KVNamespace): Promise<GcTarget[]> {
  const [marks, enrich] = await Promise.all([mergedMarks(cache), mergedEnrichments(cache)]);
  return [
    ...marks.map((m) => ({ prefix: `mark:${m.id}:`, currentVersion: m.cache_version })),
    ...enrich.map((e) => ({ prefix: `enrich:${e.id}:`, currentVersion: e.cache_version })),
  ];
}

export async function computeCacheStats(cache: KVNamespace): Promise<CacheStats> {
  const total = getWarmTotal();
  // DafYomi is keyed per daf (both amudim in one entry); total is per amud.
  const dafTotal = Math.max(1, Math.round(total / 2));

  const [
    hbCount,
    gemaraCount,
    commentariesCount,
    dafyomiCount,
    obsSlices,
    obsRabbis,
    rishonimCount,
    mishnaCount,
    yeruCount,
    halRefsCount,
    topicsCount,
    parallelsCount,
    commWorksCount,
    pasukCount,
    rabbiEnrichedCount,
  ] = await Promise.all([
    countPrefix(cache, 'hb:v2:'),
    countPrefix(cache, 'ctx:gemara:v1:'),
    countPrefix(cache, 'ctx:commentaries:v1:'),
    countPrefix(cache, 'dafyomi:v5:'),
    // `rabbi-obs:v1:` matches slice keys only (dirty keys are `rabbi-obs-dirty:v1:`).
    countPrefix(cache, 'rabbi-obs:v1:'),
    countPrefix(cache, 'rabbi-obs-dirty:v1:'),
    // Extra Sefaria sub-sources.
    countPrefix(cache, 'rishonim:v4:'),
    countPrefix(cache, 'mishna-bundle:v1:'),
    countPrefix(cache, 'yerushalmi:v1:'),
    countPrefix(cache, 'halacha-refs:v3:'),
    countPrefix(cache, 'daf-topics:v1:'),
    // Talmud↔Talmud parallels (Mesorat HaShas, Sefaria) + the broad commentary
    // -spine works list (Sefaria links-with-text). Both per-daf source fetches.
    countPrefix(cache, 'talmud-parallels:v1:'),
    countPrefix(cache, 'commentaries:v1:'),
    // Per-ENTITY source fetches (keyed per verse / per rabbi, not per daf) — no
    // /dapim denominator, so the dashboard shows their cached counts. (Rabbi
    // Wikipedia/Wikidata bios live in the bundled rabbi dataset — see the rabbi
    // coverage block — not a per-rabbi KV cache, so they aren't sources here.)
    countPrefix(cache, 'pasuk:v4:'), // Tanach verse text (Sefaria)
    countPrefix(cache, 'rabbi-enriched:v1:'), // rabbi topic links (Sefaria)
  ]);

  // Sampled "% aligned" per source — bounded value reads, not a full scan.
  // Run SEQUENTIALLY, unlike the metadata-only counts above: each sample reads
  // hundreds of real cached values (hb HTML pages, commentary bundles), and
  // running all of them in one Promise.all held ~3000 values simultaneously —
  // the peak that OOM'd 128 MB isolates and left this scan failing for days.
  // Sequential samples + sub-batched reads bound the peak to one small batch.
  const hbAligned = await sampleAligned(cache, 'hb:v2:', alignedHebrewBooks);
  const gemaraAligned = await sampleAligned(cache, 'ctx:gemara:v1:', alignedGemara);
  const commentariesAligned = await sampleAligned(
    cache,
    'ctx:commentaries:v1:',
    alignedCommentaries,
  );
  // Raw array/map values — nonEmptyValue = the daf actually has a mishnah /
  // yerushalmi parallel / rishonim / refs / topics.
  const rishonimAligned = await sampleAligned(cache, 'rishonim:v4:', nonEmptyValue);
  const mishnaAligned = await sampleAligned(cache, 'mishna-bundle:v1:', nonEmptyValue);
  const yeruAligned = await sampleAligned(cache, 'yerushalmi:v1:', nonEmptyValue);
  const halRefsAligned = await sampleAligned(cache, 'halacha-refs:v3:', nonEmptyValue);
  const topicsAligned = await sampleAligned(cache, 'daf-topics:v1:', nonEmptyValue);
  const parallelsAligned = await sampleAligned(cache, 'talmud-parallels:v1:', nonEmptyValue);
  const commWorksAligned = await sampleAligned(cache, 'commentaries:v1:', alignedCommentaryWorks);
  const dyTypes = await sampleDafyomiTypes(cache);
  const dafyomiAligned: AlignedSample | null =
    dyTypes.sampled > 0
      ? {
          sampled: dyTypes.sampled,
          aligned: dyTypes.alignedAny,
          pct: Math.round((dyTypes.alignedAny / dyTypes.sampled) * 1000) / 10,
        }
      : null;

  // Content-In: flat, per-piece source breakdown (origin-tagged).
  const sefariaRow = (id: string, count: number, aligned: AlignedSample | null): SourceRow => ({
    id,
    origin: 'Sefaria',
    count,
    denom: total,
    percent: pct(count, total),
    aligned,
  });
  // A per-entity source (per rabbi / per verse): no /dapim denominator, so it
  // carries only its cached count + the unit it is counted in.
  const entityRow = (id: string, origin: SourceOrigin, count: number, unit: string): SourceRow => ({
    id,
    origin,
    count,
    denom: 0,
    percent: 0,
    aligned: null,
    scope: 'entity',
    unit,
  });
  const sources: SourceRow[] = [
    {
      id: 'hb',
      origin: 'HB',
      count: hbCount,
      denom: total,
      percent: pct(hbCount, total),
      aligned: hbAligned,
    },
    sefariaRow('gemara', gemaraCount, gemaraAligned),
    sefariaRow('commentaries', commentariesCount, commentariesAligned),
    sefariaRow('rishonim', rishonimCount, rishonimAligned),
    sefariaRow('mishna', mishnaCount, mishnaAligned),
    sefariaRow('yerushalmi', yeruCount, yeruAligned),
    sefariaRow('halacha-refs', halRefsCount, halRefsAligned),
    sefariaRow('daf-topics', topicsCount, topicsAligned),
    sefariaRow('talmud-parallels', parallelsCount, parallelsAligned),
    sefariaRow('commentary-works', commWorksCount, commWorksAligned),
    {
      id: 'dy',
      origin: 'DY',
      count: dafyomiCount,
      denom: dafTotal,
      percent: pct(dafyomiCount, dafTotal),
      aligned: dafyomiAligned,
    },
    // DafYomi content types — count extrapolated from the sample, % of cached
    // DafYomi dapim that include the part. No separate alignment (presence is
    // the metric).
    ...DAFYOMI_TYPES.map((type): SourceRow => {
      const present = dyTypes.byType[type] ?? 0;
      const frac = dyTypes.sampled > 0 ? present / dyTypes.sampled : 0;
      const estCount = Math.round(frac * dafyomiCount);
      return {
        id: `dy.${type}`,
        origin: 'DY',
        count: estCount,
        denom: dafyomiCount,
        percent: Math.round(frac * 1000) / 10,
        aligned: null,
      };
    }),
    // Per-ENTITY source fetches: keyed per verse / per rabbi, so there is no
    // per-daf denominator — surfaced as cached counts (scope 'entity').
    entityRow('pasuk', 'Sefaria', pasukCount, 'verses'),
    entityRow('rabbi-enriched', 'Sefaria', rabbiEnrichedCount, 'rabbis'),
  ];

  const markDefs = await mergedMarks(cache);
  const enrichDefs = await mergedEnrichments(cache);

  // Scan the version-agnostic id prefix once per mark/enrichment and bucket by
  // version — this covers the current version AND any superseded ones still
  // taking up KV (orphaned by a cache_version bump).
  const markVersions = await Promise.all(
    markDefs.map((m) => countByVersion(cache, `mark:${m.id}:`)),
  );
  const enrichVersions = await Promise.all(
    enrichDefs.map((e) => countByVersion(cache, `enrich:${e.id}:`)),
  );

  // Per-mark "depends on" foreign marks (from the mark's own deps + its
  // enrichments' deps), so Content-Out can show "tidbit depends on overview".
  const markIds = new Set(markDefs.map((m) => m.id));
  const markOfEnrichment = new Map(enrichDefs.map((e) => [e.id, e.target_mark]));
  const dependsByMark = new Map<string, Set<string>>();
  const sourcesByMark = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, markId: string, v: string) =>
    (map.get(markId) ?? map.set(markId, new Set()).get(markId)!).add(v);
  const addDep = (markId: string, dep: unknown): void => {
    const f = foreignMarkOf(dep, (id) => markOfEnrichment.get(id));
    if (f && f !== markId && markIds.has(f)) add(dependsByMark, markId, f);
    const s = sourceDepOf(dep);
    if (s) add(sourcesByMark, markId, s);
  };
  for (const m of markDefs) for (const dep of m.dependencies) addDep(m.id, dep);
  for (const e of enrichDefs) for (const dep of e.dependencies) addDep(e.target_mark, dep);

  const marks: MarkCacheRow[] = markDefs.map((m, i) => {
    const versions = markVersions[i].counts;
    const count = versions[m.cache_version] ?? 0;
    const heCount = versions[`${m.cache_version}:he`] ?? 0;
    return {
      id: m.id,
      label: m.label,
      source: m.source,
      cache_version: m.cache_version,
      count,
      heCount,
      percent: pct(count, total),
      versions,
      staleCount: staleSum(versions, m.cache_version),
      dependsOn: [...(dependsByMark.get(m.id) ?? [])].sort(),
      dependsOnSources: [...(sourcesByMark.get(m.id) ?? [])].sort(),
    };
  });

  const enrichments: EnrichmentCacheRow[] = enrichDefs.map((e, i) => {
    const versions = enrichVersions[i].counts;
    const count = versions[e.cache_version] ?? 0;
    const heCount = versions[`${e.cache_version}:he`] ?? 0;
    // Distinct dapim this enrichment is cached on at the current version (EN).
    // Local scope only — global/spine keys carry no daf, so the figure would be
    // spurious and the cost model must fall back to its frontier proxy for them.
    const coverageDapim =
      e.scope === 'local' ? (enrichVersions[i].dapim[e.cache_version] ?? 0) : undefined;
    return {
      id: e.id,
      label: e.label,
      target_mark: e.target_mark,
      scope: e.scope,
      source: e.source,
      cache_version: e.cache_version,
      count,
      heCount,
      coverageDapim,
      versions,
      staleCount: staleSum(versions, e.cache_version),
    };
  });

  let totalRabbis = 0;
  let withBio = 0;
  let withWiki = 0;
  let withGeneration = 0;
  let withRegion = 0;
  let withPlaces = 0;
  let bioSourceTracked = 0; // how many entries HAVE a bioSource field set
  let withSefariaBioCount = 0; // entries where bioSource === 'sefaria' or 'both'
  for (const [slug, r] of Object.entries(RABBIS.rabbis)) {
    totalRabbis++;
    if (r.bio) withBio++;
    if (r.wiki) withWiki++;
    if (r.generation && r.generation !== 'unknown') withGeneration++;
    if (r.region === 'israel' || r.region === 'bavel') withRegion++;
    if (Array.isArray(r.places) && r.places.length > 0) withPlaces++;
    if (r.bioSource) {
      bioSourceTracked++;
      if (r.bioSource === 'sefaria' || r.bioSource === 'both') withSefariaBioCount++;
    }
    void slug;
  }
  // withSefariaBio is only meaningful once we actually track provenance
  // on each bio. Until then report null so the UI can render
  // "— not tracked yet" rather than a misleading count.
  const withSefariaBio: number | null = bioSourceTracked > 0 ? withSefariaBioCount : null;

  // Surface the BUNDLED rabbi dataset (rabbi-places.json) as Content-In source
  // rows. These are external data we fetched once and baked in: biographies from
  // Sefaria + Hebrew Wikipedia, and place names from Sefaria's person topics.
  // Per-rabbi (not per-daf), so they show cached counts (scope 'entity').
  if (withSefariaBio != null)
    sources.push(entityRow('rabbi-bio-sefaria', 'Sefaria', withSefariaBio, 'rabbis'));
  sources.push(entityRow('rabbi-bio-wiki', 'Wikipedia', withWiki, 'rabbis'));
  sources.push(entityRow('rabbi-places', 'Sefaria', withPlaces, 'rabbis'));
  // Hand-curated place coordinates (geoShapes.ts) — our own custom dataset that
  // grounds the geography map. Babylonian academy towns (Sura, Pumbedita, …) +
  // Roman-era Galilee that no external Bible gazetteer covers.
  sources.push(entityRow('geo-coords', 'Custom', GEO_CITIES.length, 'places'));
  // Cartographic basemap geometry (coastlines + rivers) clipped from public-
  // domain Natural Earth and bundled in geoShapes.ts. Not "content" but a real
  // external dataset we ship to draw the geography map — counted as vector paths.
  const basemapPaths =
    ISRAEL_SHAPE.landPaths.length +
    ISRAEL_SHAPE.riverPaths.length +
    BAVEL_SHAPE.landPaths.length +
    BAVEL_SHAPE.riverPaths.length;
  sources.push(entityRow('basemap', 'Custom', basemapPaths, 'map paths'));

  let withFamily = 0;
  for (const n of Object.values(FAMILY.nodes ?? {})) {
    if (Array.isArray(n.family) && n.family.length > 0) withFamily++;
  }
  let withOrientation = 0;
  for (const n of Object.values(ORIENTATION.nodes ?? {})) {
    if (n.orientation && n.orientation !== 'unknown') withOrientation++;
  }

  let totalEdges = 0;
  let withHierarchyEdges = 0;
  for (const n of Object.values(HIERARCHY.nodes ?? {})) {
    const edgeCount =
      (n.teachers?.length ?? 0) + (n.students?.length ?? 0) + (n.colleagues?.length ?? 0);
    totalEdges += edgeCount;
    if (edgeCount > 0) withHierarchyEdges++;
  }
  const hierarchyDenom = withBio || HIERARCHY.totalNodes || 0;

  // Curated/internal datasets we ship and use (not external fetches): the rabbi
  // relationship graphs + the hand-curated Bavli<->Yerushalmi parallels. Tagged
  // 'Custom' (our own data), counts only.
  const curatedYeruCount =
    (curatedYerushalmiData as { parallels?: unknown[] }).parallels?.length ?? 0;
  sources.push(entityRow('rabbi-family', 'Custom', withFamily, 'rabbis'));
  sources.push(entityRow('rabbi-hierarchy', 'Custom', totalEdges, 'edges'));
  sources.push(entityRow('rabbi-orientation', 'Custom', withOrientation, 'rabbis'));
  sources.push(entityRow('yerushalmi-curated', 'Custom', curatedYeruCount, 'parallels'));

  return {
    generatedAt: new Date().toISOString(),
    total,
    source: {
      hebrewbooks: {
        count: hbCount,
        percent: pct(hbCount, total),
        aligned: hbAligned,
        denom: total,
      },
      gemara: {
        count: gemaraCount,
        percent: pct(gemaraCount, total),
        aligned: gemaraAligned,
        denom: total,
      },
      commentaries: {
        count: commentariesCount,
        percent: pct(commentariesCount, total),
        aligned: commentariesAligned,
        denom: total,
      },
      // DafYomi keys are per-DAF (one entry covers both amudim), so its
      // denominator is the daf count, not the per-amud total.
      dafyomi: {
        count: dafyomiCount,
        percent: pct(dafyomiCount, dafTotal),
        aligned: dafyomiAligned,
        denom: dafTotal,
      },
    },
    sources,
    marks,
    enrichments,
    observations: { slices: obsSlices, rabbis: obsRabbis },
    rabbis: {
      totalRabbis,
      withBio,
      withSefariaBio,
      withWiki,
      withGeneration,
      withRegion,
      withPlaces,
      withHierarchyEdges,
      withFamily,
      withOrientation,
      unknownRabbis: null,
    },
    hierarchy: {
      totalNodes: hierarchyDenom,
      processedNodes: HIERARCHY.processedNodes ?? 0,
      nodesWithEdges: HIERARCHY.nodesWithEdges ?? 0,
      totalEdges,
      generatedAt: HIERARCHY.generatedAt ?? null,
    },
  };
}

export async function readCachedCacheStats(cache: KVNamespace): Promise<CacheStats | null> {
  const raw = await cache.get(CACHE_STATS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CacheStats;
  } catch {
    return null;
  }
}

export async function writeCachedCacheStats(cache: KVNamespace, stats: CacheStats): Promise<void> {
  await cache.put(CACHE_STATS_KEY, JSON.stringify(stats));
}
