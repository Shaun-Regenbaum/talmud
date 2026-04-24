/**
 * Read-through KV cache wrappers for every source-text fetch used by the
 * worker (HebrewBooks HTML, Sefaria main+commentary bundle, Sefaria Rishonim,
 * Sefaria halachic refs).
 *
 * Every handler that needs daf text must go through these — never call
 * fetchHebrewBooksDaf or sefariaAPI.* directly. Upstream APIs are slow and
 * adjacent amudim fetched by /api/analyze overlap heavily.
 *
 * Cache shape:
 *   hb:v1:<Tractate>:<daf>            → HebrewBooksDaf JSON
 *   sefaria-bundle:v1:<Tractate>:<daf> → TalmudPageData JSON
 *   rishonim:v1:<Tractate>:<daf>       → RishonimBundle JSON
 *   halacha-refs:v1:<Tractate>:<daf>   → HalachicRefBundle JSON
 *
 * All entries TTL 30 days. Missing commentators/refs are an intrinsic
 * property of a given tractate+daf and should be cached as "tried and
 * nothing there" via an empty bundle ({}) so we don't re-hit upstream.
 */

import {
  fetchHebrewBooksDaf,
  sefariaAPI,
  type HebrewBooksDaf,
  type TalmudPageData,
  type RishonimBundle,
  type HalachicRefBundle,
  type SaCommentaryBundle,
  type SefariaTopicBundle,
} from '../lib/sefref';

const TTL_30_DAYS = 60 * 60 * 24 * 30;
const TTL_NEGATIVE = 60 * 60;

type FailedMarker = { __failed: true };

async function readCache<T>(
  cache: KVNamespace | undefined,
  key: string,
): Promise<T | undefined> {
  if (!cache) return undefined;
  const raw = await cache.get(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function writeCache(
  cache: KVNamespace | undefined,
  key: string,
  value: unknown,
  ttl: number | null = TTL_30_DAYS,
): Promise<void> {
  if (!cache) return;
  try {
    const opts = ttl === null ? undefined : { expirationTtl: ttl };
    await cache.put(key, JSON.stringify(value), opts);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[source-cache] KV put failed for ${key}:`, err);
  }
}

export async function getHebrewBooksDafCached(
  cache: KVNamespace | undefined,
  tractate: string,
  page: string,
): Promise<HebrewBooksDaf | null> {
  const key = `hb:v1:${tractate}:${page}`;
  const hit = await readCache<HebrewBooksDaf | FailedMarker>(cache, key);
  if (hit) {
    if ('__failed' in hit) return null;
    return hit;
  }
  try {
    const data = await fetchHebrewBooksDaf(tractate, page);
    await writeCache(cache, key, data, null);
    return data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[source-cache] hebrewbooks fetch failed for ${tractate} ${page}:`, err);
    await writeCache(cache, key, { __failed: true } satisfies FailedMarker, TTL_NEGATIVE);
    return null;
  }
}

export async function getSefariaPageCached(
  cache: KVNamespace | undefined,
  tractate: string,
  page: string,
): Promise<TalmudPageData | null> {
  const key = `sefaria-bundle:v1:${tractate}:${page}`;
  const hit = await readCache<TalmudPageData>(cache, key);
  if (hit) return hit;
  try {
    const data = await sefariaAPI.getTalmudPageWithCommentaries(tractate, page);
    await writeCache(cache, key, data);
    return data;
  } catch {
    return null;
  }
}

export async function getRishonimCached(
  cache: KVNamespace | undefined,
  tractate: string,
  page: string,
): Promise<RishonimBundle> {
  const key = `rishonim:v1:${tractate}:${page}`;
  const hit = await readCache<RishonimBundle>(cache, key);
  if (hit) return hit;
  try {
    const data = await sefariaAPI.fetchRishonim(tractate, page);
    await writeCache(cache, key, data);
    return data;
  } catch {
    return {};
  }
}

export async function getHalachaRefsCached(
  cache: KVNamespace | undefined,
  tractate: string,
  page: string,
): Promise<HalachicRefBundle> {
  const key = `halacha-refs:v1:${tractate}:${page}`;
  const hit = await readCache<HalachicRefBundle>(cache, key);
  if (hit) return hit;
  try {
    const data = await sefariaAPI.fetchHalachicRefs(tractate, page);
    await writeCache(cache, key, data);
    return data;
  } catch {
    return {};
  }
}

/**
 * Cache the SA-commentary walk keyed by the SA ref itself (not by daf).
 * A single Shulchan Aruch siman:seif is referenced by many dafim, so
 * caching at the SA-ref level is drastically more reuse-friendly than at
 * the Gemara-daf level.
 */
/**
 * Cache Sefaria topic links + cross-Shas sources per daf. Topic links rarely
 * change (they're editorial tags), so a 30-day TTL is fine.
 */
export async function getDafTopicsCached(
  cache: KVNamespace | undefined,
  tractate: string,
  page: string,
): Promise<SefariaTopicBundle> {
  const key = `daf-topics:v1:${tractate}:${page}`;
  const hit = await readCache<SefariaTopicBundle>(cache, key);
  if (hit) return hit;
  try {
    const data = await sefariaAPI.fetchDafTopics(`${tractate}.${page}`);
    await writeCache(cache, key, data);
    return data;
  } catch {
    return [];
  }
}

export async function getSaCommentaryCached(
  cache: KVNamespace | undefined,
  saRef: string,
): Promise<SaCommentaryBundle> {
  // Cache key: replace slashes/spaces with canonical underscores so it's KV-safe.
  const safeKey = saRef.replace(/[^A-Za-z0-9._:,-]+/g, '_');
  const key = `sa-commentary:v1:${safeKey}`;
  const hit = await readCache<SaCommentaryBundle>(cache, key);
  if (hit) return hit;
  try {
    const data = await sefariaAPI.fetchSaCommentary(saRef);
    await writeCache(cache, key, data);
    return data;
  } catch {
    return {};
  }
}
