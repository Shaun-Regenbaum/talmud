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

// v5: mark/enrichment rows now carry a per-cache-version breakdown (`versions`
// + `staleCount`) so the dashboard can show how much KV is held by superseded
// versions. v4 payloads lack those fields.
export const CACHE_STATS_KEY = 'cache-stats:v5';
const FRESH_MS = 60_000;

export interface CacheStats {
  generatedAt: string;
  total: number;
  source: {
    hebrewbooks: CacheBucket;
    gemara: CacheBucket;
    commentaries: CacheBucket;
  };
  marks: MarkCacheRow[];
  enrichments: EnrichmentCacheRow[];
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

export interface MarkCacheRow {
  id: string;
  label: string;
  source: 'code' | 'kv';
  cache_version: string;
  count: number;          // entries at the CURRENT cache_version
  percent: number;
  versions: Record<string, number>; // count per cache version present in KV
  staleCount: number;     // entries at superseded (non-current) versions
}

export interface EnrichmentCacheRow {
  id: string;
  label: string;
  target_mark: string;
  scope: 'global' | 'local';
  source: 'code' | 'kv';
  cache_version: string;
  count: number;          // entries at the CURRENT cache_version
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
      const version = rest.split(':')[0] || '(none)';
      counts[version] = (counts[version] ?? 0) + 1;
    }
    if (res.list_complete) break;
    cursor = res.cursor;
    if (!cursor) break;
  }
  return counts;
}

function staleSum(versions: Record<string, number>, current: string): number {
  let sum = 0;
  for (const [v, n] of Object.entries(versions)) if (v !== current) sum += n;
  return sum;
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/** Merge code-defined marks/enrichments with KV-defined ones. KV wins on id
 *  collision. Mirrors the precedence used by /api/studio/run. */
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

export async function computeCacheStats(cache: KVNamespace): Promise<CacheStats> {
  const total = getWarmTotal();

  const [hbCount, gemaraCount, commentariesCount] = await Promise.all([
    countPrefix(cache, 'hb:v2:'),
    countPrefix(cache, 'ctx:gemara:v1:'),
    countPrefix(cache, 'ctx:commentaries:v1:'),
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
    return {
      id: m.id, label: m.label, source: m.source, cache_version: m.cache_version,
      count, percent: pct(count, total),
      versions, staleCount: staleSum(versions, m.cache_version),
    };
  });

  const enrichments: EnrichmentCacheRow[] = enrichDefs.map((e, i) => {
    const versions = enrichVersions[i];
    const count = versions[e.cache_version] ?? 0;
    return {
      id: e.id, label: e.label, target_mark: e.target_mark, scope: e.scope,
      source: e.source, cache_version: e.cache_version, count,
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
      hebrewbooks: { count: hbCount, percent: pct(hbCount, total) },
      gemara: { count: gemaraCount, percent: pct(gemaraCount, total) },
      commentaries: { count: commentariesCount, percent: pct(commentariesCount, total) },
    },
    marks,
    enrichments,
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
