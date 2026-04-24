/**
 * Aggregate cache-fullness numbers for each KV-prefix we care about, plus
 * rabbi-bio coverage derived from the bundled rabbi-places.json.
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

// v3: rabbis block dropped withImage, gained withSefariaBio / withFamily
// / withOrientation. Old v2 cached payloads would leave the new fields
// undefined and still surface the deprecated withImage.
export const CACHE_STATS_KEY = 'cache-stats:v3';
const FRESH_MS = 60_000;

export interface CacheStats {
  generatedAt: string;
  total: number;
  caches: {
    hebrewbooks: CacheBucket;
    arguments: CacheBucket;
    halacha: CacheBucket;
    aggadata: CacheBucket;
    dafContext: CacheBucket & { stage2Count: number };
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

async function countPrefix(
  cache: KVNamespace,
  prefix: string,
  suffixFilter?: (name: string) => boolean,
): Promise<number> {
  let cursor: string | undefined = undefined;
  let count = 0;
  for (;;) {
    const res = (await cache.list({ prefix, cursor, limit: 1000 })) as {
      keys: Array<{ name: string }>;
      list_complete: boolean;
      cursor?: string;
    };
    for (const k of res.keys) {
      if (!suffixFilter || suffixFilter(k.name)) count++;
    }
    if (res.list_complete) break;
    cursor = res.cursor;
    if (!cursor) break;
  }
  return count;
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export async function computeCacheStats(cache: KVNamespace): Promise<CacheStats> {
  const total = getWarmTotal();

  const [hbCount, argCount, halCount, aggCount, dcTotal, dcStage2] = await Promise.all([
    countPrefix(cache, 'hb:v1:'),
    countPrefix(cache, 'analyze:v5:'),
    countPrefix(cache, 'halacha:v5:'),
    countPrefix(cache, 'aggadata:v1:'),
    countPrefix(cache, 'daf-context:v5:', (n) => !n.endsWith(':stage2')),
    countPrefix(cache, 'daf-context:v5:', (n) => n.endsWith(':stage2')),
  ]);

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
    caches: {
      hebrewbooks: { count: hbCount, percent: pct(hbCount, total) },
      arguments: { count: argCount, percent: pct(argCount, total) },
      halacha: { count: halCount, percent: pct(halCount, total) },
      aggadata: { count: aggCount, percent: pct(aggCount, total) },
      dafContext: { count: dcTotal, percent: pct(dcTotal, total), stage2Count: dcStage2 },
    },
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
