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
 *   hb:v2:<Tractate>:<daf>            → HebrewBooksDaf JSON
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
  type MishnaBundle,
} from '../lib/sefref';
import type { DafyomiDaf } from '../lib/sefref/dafyomi/schema';
import { keyForDafyomi } from './cache-keys';
import { scrapeDafyomiLive } from './dafyomi-live';

const TTL_30_DAYS = 60 * 60 * 24 * 30;
const TTL_NEGATIVE = 60 * 60;

type FailedMarker = { __failed: true };

/**
 * Optional per-call hit/miss reporter. Callers that care about KV cache state
 * (e.g. routes that emit an `x-cache` response header) pass `{ onCache: fn }`
 * and get a 'hit' or 'miss' callback after the KV lookup completes.
 */
export interface CacheTrack {
  onCache?: (state: 'hit' | 'miss') => void;
}

export interface SefariaSegments {
  he: string[];
  en: string[];
}

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
  track?: CacheTrack,
): Promise<HebrewBooksDaf | null> {
  // v2: extractShastext now bounds each column by its enclosing </fieldset>
  // and tolerates HebrewBooks' malformed chapter-boundary markup (unclosed
  // Gemara <div> at a perek end, stray leading </div> at a perek start). v1
  // entries hold over-captured (perek-end) or empty (perek-start) Gemara, so
  // bumping forces a refetch with the corrected extraction.
  const key = `hb:v2:${tractate}:${page}`;
  const hit = await readCache<HebrewBooksDaf | FailedMarker>(cache, key);
  track?.onCache?.(hit ? 'hit' : 'miss');
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
  track?: CacheTrack,
): Promise<TalmudPageData | null> {
  // v5: added pieceKeys (Sefaria's 1-based "S:P" position strings) parallel
  // to pieces — v4 entries don't have them, so the daf↔commentary click
  // anchor falls back to the broken global-index path. Bumping forces a
  // refetch that populates pieceKeys.
  // v4: switched commentary fetches from Sefaria's v1 `/api/texts/` to v3
  // with nested-array flattening AND fixed the ref construction.
  const key = `sefaria-bundle:v5:${tractate}:${page}`;
  const hit = await readCache<TalmudPageData>(cache, key);
  track?.onCache?.(hit ? 'hit' : 'miss');
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
  // v2: per-comment, segment-anchored RishonComment[] (was a whole-daf blob
  // Record<label, snippet>). v3: expanded the Rishonim allowlist (Yad Ramah,
  // Ri Migash, Rabbeinu Gershom, Tosafot Rid/HaRosh, Shita Mekubetzet, Baal
  // HaMaor, Ra'ah, Mordechai, Maharsha, …) — bump so cached dapim refetch.
  const key = `rishonim:v3:${tractate}:${page}`;
  const hit = await readCache<RishonimBundle>(cache, key);
  if (hit) return hit;
  try {
    const data = await sefariaAPI.fetchRishonim(tractate, page);
    await writeCache(cache, key, data);
    return data;
  } catch {
    return [];
  }
}

export async function getHalachaRefsCached(
  cache: KVNamespace | undefined,
  tractate: string,
  page: string,
): Promise<HalachicRefBundle> {
  // v2: snippets now carry segStart/segEnd (the linked daf segment).
  const key = `halacha-refs:v2:${tractate}:${page}`;
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

/**
 * Cache the Mishnayot anchored to this gemara daf. One getRelated call plus
 * one getText per mishna; daf-keyed since the mishna→gemara mapping doesn't
 * vary by argument. 30-day TTL like other source bundles.
 */
export async function getMishnaBundleCached(
  cache: KVNamespace | undefined,
  tractate: string,
  page: string,
): Promise<MishnaBundle> {
  const key = `mishna-bundle:v1:${tractate}:${page}`;
  const hit = await readCache<MishnaBundle>(cache, key);
  if (hit) return hit;
  try {
    const data = await sefariaAPI.fetchMishnaForDaf(tractate, page);
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

/**
 * Sefaria v3 parallel Hebrew + English segments for a daf. Each array index
 * is one logical block (usually one Mishnah or Gemara clause). Migrated out
 * of src/worker/index.ts so the warm-cron Sefaria phase can prefill these
 * across the whole shas without re-implementing the upstream fetch.
 */
/**
 * Structured dafyomi.co.il study content for a daf (both amudim, all content
 * types present), produced offline by scripts/scrape-dafyomi.mjs and committed
 * to static/dafyomi/<Tractate>/<daf>.json. Read at runtime through the ASSETS
 * binding (NOT bundled into the worker), then memoized in KV.
 *
 * `page` may be "76a" or "76b" — both resolve to the same daf file (76).
 * A daf that hasn't been scraped is negative-cached (1h) and returns null, so
 * the route 404s rather than fabricating content.
 */
export interface DafyomiFetchOpts {
  /** Incoming request origin, used as a dev-mode fallback when the ASSETS
   *  binding (which serves the built dist/client dir) hasn't been built yet —
   *  Vite serves static/ at the public path in dev, so a same-origin fetch
   *  resolves there. In prod the ASSETS binding handles it on the first try. */
  assetOrigin?: string;
  /** Skip the read-cache (incl. negative cache) and re-resolve from assets. */
  refresh?: boolean;
  /** When the daf isn't in the committed static corpus, fetch + parse it live
   *  from dafyomi.co.il (then memoize). Defaults off; callers opt in. */
  allowLive?: boolean;
  track?: CacheTrack;
}

export async function getDafyomiContentCached(
  cache: KVNamespace | undefined,
  assets: Fetcher,
  tractate: string,
  page: string,
  opts: DafyomiFetchOpts = {},
): Promise<DafyomiDaf | null> {
  const { assetOrigin, refresh, allowLive, track } = opts;
  const m = page.match(/^(\d+)/);
  if (!m) return null;
  const daf = m[1];
  const key = keyForDafyomi(tractate, daf);
  if (!refresh) {
    const hit = await readCache<DafyomiDaf | FailedMarker>(cache, key);
    track?.onCache?.(hit ? 'hit' : 'miss');
    if (hit) return '__failed' in hit ? null : hit;
  } else {
    track?.onCache?.('miss');
  }

  const path = `/dafyomi/${encodeURIComponent(tractate)}/${daf}.json`;
  try {
    // A committed corpus file is real JSON. NOTE: the production ASSETS binding
    // serves the SPA index.html with status 200 for a missing path (so res.ok
    // is true even on a miss) — only accept a body that's actually our JSON,
    // otherwise treat it as "not in the corpus" and fall through to live.
    let corpus = await readJsonAsset(assets.fetch(new Request(`https://assets.local${path}`)));
    if (!corpus && assetOrigin) corpus = await readJsonAsset(fetch(`${assetOrigin}${path}`));
    if (corpus) {
      // dafyomi.co.il study content for a daf never changes — cache it forever,
      // like the HebrewBooks daf HTML (ttl=null), not the 30-day Sefaria default.
      await writeCache(cache, key, corpus, null);
      return corpus;
    }
    // Not in the committed corpus — fetch + parse live (then memoize) so every
    // daf works, not just the pre-scraped ones. Same never-expire policy.
    if (allowLive) {
      const live = await scrapeDafyomiLive(tractate, parseInt(daf, 10));
      if (live) {
        await writeCache(cache, key, live, null);
        return live;
      }
    }
    await writeCache(cache, key, { __failed: true } satisfies FailedMarker, TTL_NEGATIVE);
    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[source-cache] dafyomi read failed for ${tractate} ${daf}:`, err);
    await writeCache(cache, key, { __failed: true } satisfies FailedMarker, TTL_NEGATIVE);
    return null;
  }
}

/** Read a response as DafyomiDaf JSON, or null if it isn't (e.g. a 404, or the
 *  SPA index.html that asset servers return for missing paths). */
async function readJsonAsset(p: Promise<Response>): Promise<DafyomiDaf | null> {
  try {
    const res = await p;
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trimStart().startsWith('{')) return null; // HTML / SPA fallback
    return JSON.parse(text) as DafyomiDaf;
  } catch {
    return null;
  }
}

export async function getSefariaSegmentsCached(
  cache: KVNamespace | undefined,
  tractate: string,
  page: string,
  track?: CacheTrack,
): Promise<SefariaSegments | null> {
  const cacheKey = `sefaria-seg:v1:${tractate}:${page}`;
  if (cache) {
    const cached = await cache.get(cacheKey);
    track?.onCache?.(cached !== null ? 'hit' : 'miss');
    if (cached !== null) {
      try { return JSON.parse(cached) as SefariaSegments; } catch { /* fall through */ }
    }
  } else {
    track?.onCache?.('miss');
  }
  try {
    const ref = `${tractate}.${page}`;
    const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew&version=english`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const j = (await res.json()) as { versions?: Array<{ actualLanguage?: string; language?: string; text?: unknown }> };
    const vs = j.versions ?? [];
    const pick = (lang: string): string[] => {
      const v = vs.find((x) => (x.actualLanguage ?? x.language) === lang);
      if (!v || !Array.isArray(v.text)) return [];
      return (v.text as unknown[]).map((t) => (typeof t === 'string' ? t : String(t ?? '')));
    };
    const out: SefariaSegments = { he: pick('he'), en: pick('en') };
    const n = Math.min(out.he.length, out.en.length);
    out.he = out.he.slice(0, n);
    out.en = out.en.slice(0, n);
    if (cache && n > 0) {
      await cache.put(cacheKey, JSON.stringify(out), { expirationTtl: TTL_30_DAYS });
    }
    return n > 0 ? out : null;
  } catch {
    return null;
  }
}
