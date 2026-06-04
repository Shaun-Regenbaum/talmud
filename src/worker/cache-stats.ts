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
 * per page), so callers should memoize the result. We stash the latest
 * result under CACHE_STATS_KEY and the /api/admin/cache-stats endpoint
 * short-circuits on `generatedAt < 60s ago`.
 */
import rabbiPlacesData from '../lib/data/rabbi-places.json';
import rabbiHierarchyData from '../lib/data/rabbi-hierarchy.json';
import rabbiFamilyData from '../lib/data/rabbi-family.json';
import rabbiOrientationData from '../lib/data/rabbi-orientation.json';
import { getWarmTotal } from './warm-cron';
import { CODE_MARKS, CODE_ENRICHMENTS } from './code-marks';
import { listMarks, listEnrichments } from './studio-registry';
import type { GcTarget } from './cache-gc';

// v5: mark/enrichment rows carry a per-cache-version breakdown (`versions` +
// `staleCount`) + the `observations` bucket (rabbi.observations reverse index).
// v6: rows also carry `heCount` and `versions` buckets Hebrew entries under
// `<version>:he`, so the dashboard can report EN vs HE cache coverage.
// v7: source buckets carry sampled `aligned` + a `denom` (DafYomi is per-daf,
// not per-amud), and a fourth `dafyomi` source. Bumped so a stale v6 payload
// (missing those fields) isn't served.
export const CACHE_STATS_KEY = 'cache-stats:v7';
const FRESH_MS = 60_000;

export interface CacheStats {
  generatedAt: string;
  total: number;
  source: {
    hebrewbooks: SourceBucket;
    gemara: SourceBucket;
    commentaries: SourceBucket;
    dafyomi: SourceBucket;
  };
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
    withBio: number;                      // any bio text
    withSefariaBio: number | null;        // bio sourced from Sefaria; null when provenance isn't tracked yet
    withWiki: number;                     // Hebrew Wikipedia link
    withGeneration: number;               // generation set and not 'unknown'
    withRegion: number;                   // region is 'israel' | 'bavel'
    withPlaces: number;                   // non-empty places array
    withHierarchyEdges: number;           // at least one teacher/student/contemporary edge
    withFamily: number;                   // at least one familial relation in rabbi-family.json
    withOrientation: number;              // orientation (mystical / practical) classified in rabbi-orientation.json
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
  count: number;          // entries at the CURRENT cache_version (English)
  heCount: number;        // entries at the CURRENT cache_version, Hebrew (:he)
  percent: number;
  versions: Record<string, number>; // count per cache version present in KV (`:he` suffix = Hebrew)
  staleCount: number;     // entries at superseded (non-current) versions
}

export interface EnrichmentCacheRow {
  id: string;
  label: string;
  target_mark: string;
  scope: 'global' | 'local';
  source: 'code' | 'kv';
  cache_version: string;
  count: number;          // entries at the CURRENT cache_version (English)
  heCount: number;        // entries at the CURRENT cache_version, Hebrew (:he)
  versions: Record<string, number>;
  staleCount: number;
}

interface RabbisFile {
  rabbis: Record<string, {
    bio?: string | null;
    wiki?: string | null;
    bioSource?: 'sefaria' | 'wikipedia' | 'both' | null;  // future provenance flag
    numSources?: number | null;
    generation?: string | null;
    region?: 'israel' | 'bavel' | null;
    places?: string[];
  }>;
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
  nodes: Record<string, {
    teachers: string[];
    students: string[];
    colleagues: string[];
  }>;
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
  return (Array.isArray(d.segments_he) && d.segments_he.length > 0) ||
    (Array.isArray(d.segments_en) && d.segments_en.length > 0);
};
const alignedCommentaries: AlignPredicate = (v) => {
  if (!v || failed(v)) return false;
  const d = v as { by_commentator?: Record<string, unknown> };
  return !!d.by_commentator && Object.keys(d.by_commentator).length > 0;
};
const alignedDafyomi: AlignPredicate = (v) => {
  if (!v || failed(v)) return false;
  const d = v as { amudim?: { a?: Record<string, unknown>; b?: Record<string, unknown> } };
  // An amud counts only if at least one of its content-type blocks is itself a
  // non-empty object — a parse can leave empty {} blocks, which shouldn't read
  // as aligned.
  const hasContent = (amud?: Record<string, unknown>): boolean =>
    !!amud && Object.values(amud).some((c) => !!c && typeof c === 'object' && Object.keys(c as object).length > 0);
  return hasContent(d.amudim?.a) || hasContent(d.amudim?.b);
};

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
  let cursor: string | undefined = undefined;
  while (keys.length < sampleSize) {
    const res = (await cache.list({ prefix, cursor, limit: Math.min(1000, sampleSize - keys.length) })) as {
      keys: Array<{ name: string }>; list_complete: boolean; cursor?: string;
    };
    for (const k of res.keys) keys.push(k.name);
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  if (keys.length === 0) return null;
  const raws = await Promise.all(keys.map((k) => cache.get(k)));
  let sampled = 0;
  let aligned = 0;
  for (const raw of raws) {
    if (raw == null) continue;
    sampled++;
    let v: unknown;
    try { v = JSON.parse(raw); } catch { continue; }
    if (isAligned(v)) aligned++;
  }
  if (sampled === 0) return null;
  return { sampled, aligned, pct: Math.round((aligned / sampled) * 1000) / 10 };
}

async function countPrefix(cache: KVNamespace, prefix: string): Promise<number> {
  let cursor: string | undefined = undefined;
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
async function countByVersion(cache: KVNamespace, prefix: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let cursor: string | undefined = undefined;
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
    }
    if (res.list_complete) break;
    cursor = res.cursor;
    if (!cursor) break;
  }
  return counts;
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
async function mergedMarks(cache: KVNamespace): Promise<Array<{ id: string; label: string; source: 'code' | 'kv'; cache_version: string }>> {
  const kv = await listMarks({ CACHE: cache });
  const byId = new Map<string, { id: string; label: string; source: 'code' | 'kv'; cache_version: string }>();
  for (const m of CODE_MARKS) byId.set(m.id, { id: m.id, label: m.label, source: 'code', cache_version: m.cache_version });
  for (const m of kv) byId.set(m.id, { id: m.id, label: m.label, source: 'kv', cache_version: m.cache_version });
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function mergedEnrichments(cache: KVNamespace): Promise<Array<{
  id: string; label: string; target_mark: string; scope: 'global' | 'local';
  source: 'code' | 'kv'; cache_version: string;
}>> {
  const kv = await listEnrichments({ CACHE: cache });
  const byId = new Map<string, { id: string; label: string; target_mark: string; scope: 'global' | 'local'; source: 'code' | 'kv'; cache_version: string }>();
  for (const e of CODE_ENRICHMENTS) byId.set(e.id, {
    id: e.id, label: e.label, target_mark: e.target_mark, scope: e.scope,
    source: 'code', cache_version: e.cache_version,
  });
  // KV registry stores `mark` (singular) where code uses `target_mark`; map
  // both into the same shape so the row is consistent regardless of source.
  for (const e of kv) byId.set(e.id, {
    id: e.id, label: e.label, target_mark: e.mark, scope: e.scope,
    source: 'kv', cache_version: e.cache_version,
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
    hbCount, gemaraCount, commentariesCount, dafyomiCount, obsSlices, obsRabbis,
    hbAligned, gemaraAligned, commentariesAligned, dafyomiAligned,
  ] = await Promise.all([
    countPrefix(cache, 'hb:v2:'),
    countPrefix(cache, 'ctx:gemara:v1:'),
    countPrefix(cache, 'ctx:commentaries:v1:'),
    countPrefix(cache, 'dafyomi:v5:'),
    // `rabbi-obs:v1:` matches slice keys only (dirty keys are `rabbi-obs-dirty:v1:`).
    countPrefix(cache, 'rabbi-obs:v1:'),
    countPrefix(cache, 'rabbi-obs-dirty:v1:'),
    // Sampled "% aligned" per source — bounded value reads, not a full scan.
    sampleAligned(cache, 'hb:v2:', alignedHebrewBooks),
    sampleAligned(cache, 'ctx:gemara:v1:', alignedGemara),
    sampleAligned(cache, 'ctx:commentaries:v1:', alignedCommentaries),
    sampleAligned(cache, 'dafyomi:v5:', alignedDafyomi),
  ]);

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

  const marks: MarkCacheRow[] = markDefs.map((m, i) => {
    const versions = markVersions[i];
    const count = versions[m.cache_version] ?? 0;
    const heCount = versions[`${m.cache_version}:he`] ?? 0;
    return {
      id: m.id, label: m.label, source: m.source, cache_version: m.cache_version,
      count, heCount, percent: pct(count, total),
      versions, staleCount: staleSum(versions, m.cache_version),
    };
  });

  const enrichments: EnrichmentCacheRow[] = enrichDefs.map((e, i) => {
    const versions = enrichVersions[i];
    const count = versions[e.cache_version] ?? 0;
    const heCount = versions[`${e.cache_version}:he`] ?? 0;
    return {
      id: e.id, label: e.label, target_mark: e.target_mark, scope: e.scope,
      source: e.source, cache_version: e.cache_version, count, heCount,
      versions, staleCount: staleSum(versions, e.cache_version),
    };
  });

  let totalRabbis = 0;
  let withBio = 0;
  let withWiki = 0;
  let withGeneration = 0;
  let withRegion = 0;
  let withPlaces = 0;
  let bioSourceTracked = 0;     // how many entries HAVE a bioSource field set
  let withSefariaBioCount = 0;  // entries where bioSource === 'sefaria' or 'both'
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
    const edgeCount = (n.teachers?.length ?? 0) + (n.students?.length ?? 0) + (n.colleagues?.length ?? 0);
    totalEdges += edgeCount;
    if (edgeCount > 0) withHierarchyEdges++;
  }
  const hierarchyDenom = withBio || HIERARCHY.totalNodes || 0;

  return {
    generatedAt: new Date().toISOString(),
    total,
    source: {
      hebrewbooks: { count: hbCount, percent: pct(hbCount, total), aligned: hbAligned, denom: total },
      gemara: { count: gemaraCount, percent: pct(gemaraCount, total), aligned: gemaraAligned, denom: total },
      commentaries: { count: commentariesCount, percent: pct(commentariesCount, total), aligned: commentariesAligned, denom: total },
      // DafYomi keys are per-DAF (one entry covers both amudim), so its
      // denominator is the daf count, not the per-amud total.
      dafyomi: { count: dafyomiCount, percent: pct(dafyomiCount, dafTotal), aligned: dafyomiAligned, denom: dafTotal },
    },
    marks,
    enrichments,
    observations: { slices: obsSlices, rabbis: obsRabbis },
    rabbis: {
      totalRabbis, withBio, withSefariaBio, withWiki,
      withGeneration, withRegion, withPlaces,
      withHierarchyEdges, withFamily, withOrientation,
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

export function isFresh(stats: CacheStats): boolean {
  const t = Date.parse(stats.generatedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < FRESH_MS;
}

export async function writeCachedCacheStats(
  cache: KVNamespace,
  stats: CacheStats,
): Promise<void> {
  await cache.put(CACHE_STATS_KEY, JSON.stringify(stats));
}
