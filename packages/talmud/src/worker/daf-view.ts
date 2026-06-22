/**
 * Materialized daf view — the warm read path.
 *
 * Today a reader opening a daf fires ONE /api/daf (the source text) and then up
 * to ~16 separate /api/run calls, one per piece, each polling until ready. For a
 * WARM daf (everything already generated) that's 16 round trips for data that's
 * all sitting in KV. This endpoint collapses it: `GET /api/daf-view/:t/:p`
 * returns ALL currently-cached pieces' content for the daf in ONE response, so
 * the client renders a warm daf from a single (edge-cached) fetch.
 *
 * Read-only: it never triggers generation. Pieces that aren't cached yet are
 * listed in `cold` so the client knows what still needs a /api/run. The
 * separation of concerns is deliberate — the warm path is a dumb cached read;
 * the cold path keeps the existing per-piece generate-and-poll machinery.
 *
 * This module holds the pure, testable bits (the cache-control policy + the
 * completeness/shape helpers). The KV reads + registry enumeration live in the
 * route handler, which reuses the same helpers the inspector's /api/daf-runs
 * probe path already uses.
 */

export interface DafViewPiece {
  producerId: string;
  kind: 'mark' | 'enrichment';
  label: string;
  /** Present for per-instance enrichments (one entry per target-mark instance). */
  instanceId?: string;
  instanceLabel?: string;
  /** The structured output the card renders from (RunResult.parsed). */
  parsed: unknown;
  /** Raw model output (RunResult.content) — the generic fallback renderer reads
   *  it; included so a client can build a faithful RunResult from the view. */
  content?: string;
  /** Aggregate enrichments: each dependency's parsed output (RunResult.deps_resolved). */
  deps_resolved?: Record<string, unknown>;
}

export interface DafView {
  tractate: string;
  page: string;
  lang: 'en' | 'he';
  /** True when every enumerated registry piece has cached content — the view is
   *  stable and safe to edge-cache hard. */
  complete: boolean;
  /** Registry producers enumerated (marks + whole-daf + per-instance enrichments). */
  total: number;
  /** How many of those produced cached content. */
  cached: number;
  /** Producer ids with missing content — what the client still needs to generate. */
  cold: string[];
  /** Cached pieces keyed by `pieceKey` (producerId, or producerId::instanceId). */
  pieces: Record<string, DafViewPiece>;
}

/**
 * Edge cache-control for the view.
 *
 * A COMPLETE view is immutable until a producer version bump or a human edit
 * (both of which change the underlying piece, flipping the view back to
 * partial), so cache it hard at the edge — that's how millions of readers of the
 * same Daf Yomi page get served from the colo without ever waking the worker.
 *
 * A PARTIAL view is still warming, so use a short max-age: it refreshes quickly
 * as pieces fill in, while still absorbing a cold-open herd for a few seconds.
 */
export function dafViewCacheControl(complete: boolean): string {
  return complete ? 'public, max-age=3600, stale-while-revalidate=86400' : 'public, max-age=20';
}

/** Stable map key for a piece: per-instance pieces append their instance id. */
export function pieceKey(producerId: string, instanceId?: string): string {
  return instanceId ? `${producerId}::${instanceId}` : producerId;
}

/** A producer's enumeration result, reduced to what completeness needs. */
export interface EnumeratedPiece {
  producerId: string;
  /** Expected to have content but none cached (for per-instance: not all
   *  instances cached). */
  cold: boolean;
  /** Computed only on demand (never proactively warmed) — excluded from the
   *  completeness verdict + the cold list, so one uncached lazy piece (e.g. the
   *  homonym pin) can't keep a fully-warmed daf out of the hard edge cache. */
  demandDriven?: boolean;
}

/** Roll enumerated producers up into the view's completeness verdict + cold list
 *  (deduped, since a per-instance producer contributes one entry per instance).
 *  Demand-driven producers are ignored: they're fetched lazily when the reader
 *  opens that card, so an uncached one is expected, not "cold". */
export function dafViewCompleteness(items: EnumeratedPiece[]): {
  complete: boolean;
  cold: string[];
} {
  const cold = [
    ...new Set(items.filter((i) => i.cold && !i.demandDriven).map((i) => i.producerId)),
  ];
  return { complete: cold.length === 0, cold };
}
