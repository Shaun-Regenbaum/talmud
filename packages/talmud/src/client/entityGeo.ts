/**
 * Cached-only entity geography fetch for the whole-daf map.
 *
 * One GET /api/entity/rabbi/:slug?facets=identity,geography per unique rabbi
 * slug. The worker route only READS (registry identity + the cached
 * rabbi.geography enrichment) — this path can never trigger generation.
 *
 * Two layers of dedup live here, both module-level so they span daf
 * navigations:
 *   1. Result cache by slug — global pieces are daf-agnostic, so navigating
 *      between dapim reuses entries instead of refetching. `null` = known
 *      miss (rabbi not in the registry; 404).
 *   2. In-flight map — concurrent requests for the same slug share ONE fetch
 *      (entries move to the result cache on settle). Aborted or failed
 *      fetches resolve `undefined` and clean themselves out WITHOUT caching,
 *      so a page turn mid-flight neither caches a miss nor poisons the
 *      in-flight map for the next daf that wants the same rabbi.
 */

import type { MoveDirection } from './geographyData';
import type { GeographyData } from './RabbiGeographyCard';

/** Cached-only geography pieces for one rabbi, from /api/entity/rabbi/:slug:
 *  the deterministic registry identity + the rabbi.geography enrichment IF
 *  already cached server-side (null until something warmed it). */
export interface EntityGeoPieces {
  identity: {
    places?: string[];
    region?: 'israel' | 'bavel' | null;
    moved?: MoveDirection | null;
  } | null;
  geography: GeographyData | null;
}

const resultCache = new Map<string, EntityGeoPieces | null>();
// In-flight fetches by slug. The stored signal lets a later caller detect a
// doomed entry synchronously (the previous daf's controller was just
// aborted) and start a fresh fetch instead of joining it.
const inflight = new Map<
  string,
  { promise: Promise<EntityGeoPieces | null | undefined>; signal: AbortSignal }
>();

/**
 * Fetch one rabbi's geography pieces.
 *
 * Returns:
 *   EntityGeoPieces — fetched (and now cached) pieces
 *   null            — known miss (404; cached so revisits skip the fetch)
 *   undefined       — transient failure or abort; NOT cached, so a later
 *                     visit retries
 */
export function fetchEntityGeoPieces(
  slug: string,
  signal: AbortSignal,
): Promise<EntityGeoPieces | null | undefined> {
  const cached = resultCache.get(slug);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = inflight.get(slug);
  if (pending && !pending.signal.aborted) return pending.promise;

  const promise = (async (): Promise<EntityGeoPieces | null | undefined> => {
    try {
      const res = await fetch(
        `/api/entity/rabbi/${encodeURIComponent(slug)}?facets=identity,geography`,
        { signal },
      );
      if (res.status === 404) {
        // Not in the registry; nothing to draw. Cache the miss so revisits
        // don't refetch.
        resultCache.set(slug, null);
        return null;
      }
      if (!res.ok) return undefined; // transient failure: don't cache
      const j = (await res.json()) as { pieces?: EntityGeoPieces };
      const pieces: EntityGeoPieces = {
        identity: j.pieces?.identity ?? null,
        geography: j.pieces?.geography ?? null,
      };
      resultCache.set(slug, pieces);
      return pieces;
    } catch {
      // Aborted or network failure: no result, no caching.
      return undefined;
    } finally {
      // Only remove OUR entry — a doomed (aborted) entry may already have
      // been replaced by a fresh fetch for the next daf.
      if (inflight.get(slug)?.signal === signal) inflight.delete(slug);
    }
  })();

  inflight.set(slug, { promise, signal });
  return promise;
}

/** Test hook: clear both module-level maps between cases. */
export function resetEntityGeoForTests(): void {
  resultCache.clear();
  inflight.clear();
}
