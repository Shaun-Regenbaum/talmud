/**
 * Materialized daf-view store (client side of Phase 1).
 *
 * On daf open we fetch `GET /api/daf-view/:t/:p` ONCE — all of a daf's cached
 * pieces in a single (edge-cached) response — and stash it here. A card then
 * checks this store before firing its own `/api/run`: a hit renders from the
 * one fetch, a miss falls through to the existing per-piece generate-and-poll.
 *
 * This pass wires only the WHOLE-DAF pieces (Overview, background, tidbit,
 * geography, …), which the view keys by producer id alone — so the lookup is
 * synchronous and GUARANTEED to match the server key, with no instanceIdOf
 * bridge. Per-instance section pieces are keyed `producerId::instanceId` and are
 * intentionally NOT served here yet (they need the async instanceIdOf bridge — a
 * later pass). Everything here is best-effort: if the view hasn't loaded, fails,
 * or lacks a piece, the caller just fetches as before — no behaviour change.
 */

import { instanceIdOf } from '@corpus/core/cache/keys';
import { createSignal } from 'solid-js';
import type { RunResult } from './enrichmentQueue';

export interface DafViewPiece {
  producerId: string;
  kind: 'mark' | 'enrichment';
  label: string;
  instanceId?: string;
  instanceLabel?: string;
  parsed: unknown;
  content?: string;
  deps_resolved?: Record<string, unknown>;
}

interface DafViewPayload {
  complete?: boolean;
  pieces?: Record<string, DafViewPiece>;
}

function dafKey(tractate: string, page: string, lang: 'en' | 'he'): string {
  return `${tractate}:${page}:${lang}`;
}

// Keyed by daf so a view loaded for a previous daf is never served for the
// current one (the user navigates while a fetch is in flight).
const [view, setView] = createSignal<{ key: string; pieces: Record<string, DafViewPiece> } | null>(
  null,
);

// The most recently REQUESTED daf-view key. A load only writes the signal if its
// key is still the latest — so a slow/failed load for a daf the user already
// navigated away from can never clobber the view of the daf now on screen.
let latestKey = '';

// In-flight load promise per daf key, so concurrent callers (DafViewer's open
// effect + the prefetcher) share ONE fetch instead of racing two. Cleared once
// the load settles.
const inflight = new Map<string, Promise<void>>();

/**
 * Load the materialized view for a daf and stash it. Called as early as possible
 * on daf open so it's ready by the time a card would otherwise fetch. Concurrent
 * calls for the same daf share one in-flight fetch.
 *
 * The signal ALWAYS settles — on success with the pieces, on failure/timeout
 * with an empty view. That matters because cards gate their `/api/run` on
 * `dafViewLoaded`: settling-even-on-failure guarantees the gate resolves (cards
 * fall through and fetch as before) instead of hanging forever. Fail-safe: an
 * empty view just means every lookup misses and the card fetches per-piece.
 */
export function loadDafView(tractate: string, page: string, lang: 'en' | 'he'): Promise<void> {
  const key = dafKey(tractate, page, lang);
  const existing = inflight.get(key);
  if (existing) return existing;
  const run = doLoadDafView(key, tractate, page, lang);
  inflight.set(key, run);
  void run.finally(() => {
    if (inflight.get(key) === run) inflight.delete(key);
  });
  return run;
}

async function doLoadDafView(
  key: string,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<void> {
  latestKey = key;
  // Only write the signal if THIS is still the daf the reader is on.
  const settle = (pieces: Record<string, DafViewPiece>) => {
    if (latestKey === key) setView({ key, pieces });
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`/api/daf-view/${encodeURIComponent(tractate)}/${page}?lang=${lang}`, {
      signal: ctrl.signal,
    });
    if (!r.ok) {
      settle({});
      return;
    }
    const j = (await r.json()) as DafViewPayload;
    settle(j.pieces ?? {});
  } catch {
    // Network error / abort / timeout: settle empty so the gate resolves.
    settle({});
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve once the view for this daf+lang has SETTLED (loaded, or failed-empty).
 * Short-circuits if it's already settled; otherwise shares the in-flight load.
 * The prefetcher awaits this so it can consult the view before deciding what to
 * warm. Fail-safe: on failure the view is empty, so callers just proceed.
 */
export function ensureDafView(tractate: string, page: string, lang: 'en' | 'he'): Promise<void> {
  const key = dafKey(tractate, page, lang);
  const v = view();
  if (v && v.key === key) return Promise.resolve();
  return loadDafView(tractate, page, lang);
}

/**
 * Is a piece already present in the loaded view for this daf? Checks the whole-daf
 * key (bare producer id) first, then the per-instance key (`producerId::iid`,
 * where iid is `instanceIdOf(instance)` — the same hash the server keyed by).
 * Used by the prefetcher to SKIP warming pieces the view already serves (so a
 * warm daf no longer fans out N redundant /api/run). Returns false when the view
 * isn't loaded for this daf — caller proceeds as before (fail-safe).
 */
export async function dafViewHas(
  producerId: string,
  instance: unknown,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<boolean> {
  const v = view();
  if (!v || v.key !== dafKey(tractate, page, lang)) return false;
  if (v.pieces[producerId]) return true; // whole-daf piece
  const iid = await instanceIdOf(instance);
  return !!v.pieces[`${producerId}::${iid}`];
}

/** Build a faithful RunResult from a stored view piece (cache_hit, so the card
 *  renders it as an already-warm result). */
export function synthRunResult(piece: DafViewPiece): RunResult {
  return {
    content: piece.content ?? '',
    parsed: piece.parsed,
    parse_error: null,
    model: '',
    total_ms: 0,
    cache_hit: true,
    deps_resolved: piece.deps_resolved,
  };
}

/**
 * A synthetic RunResult for a WHOLE-DAF piece (keyed by producer id alone), or
 * undefined when the view isn't loaded for THIS daf or the piece is absent — in
 * which case the caller fetches per-piece as today. Per-instance pieces
 * (`producerId::instanceId`) never match here, so they fall through untouched.
 */
export function dafViewWholeDafResult(
  producerId: string,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): RunResult | undefined {
  const v = view();
  if (!v || v.key !== dafKey(tractate, page, lang)) return undefined;
  const piece = v.pieces[producerId];
  return piece ? synthRunResult(piece) : undefined;
}

/** True once the view has loaded for THIS daf+lang (reactive: reads the view
 *  signal). Per-instance card priming gates on this — only worth computing the
 *  instanceId hash + checking the view when a hit is actually possible. */
export function dafViewLoaded(tractate: string, page: string, lang: 'en' | 'he'): boolean {
  const v = view();
  return !!v && v.key === dafKey(tractate, page, lang);
}

/**
 * A synthetic RunResult for a PER-INSTANCE piece, keyed `producerId::instanceId`
 * (the server's pieceKey for per-instance enrichments). `instanceId` is the
 * caller's `instanceIdOf(instance)` (the same async hash the server keyed by).
 * Undefined → not loaded for this daf, or this instance isn't cached → the
 * caller fetches as today.
 */
export function dafViewPieceResult(
  producerId: string,
  instanceId: string,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): RunResult | undefined {
  const v = view();
  if (!v || v.key !== dafKey(tractate, page, lang)) return undefined;
  const piece = v.pieces[`${producerId}::${instanceId}`];
  return piece ? synthRunResult(piece) : undefined;
}
