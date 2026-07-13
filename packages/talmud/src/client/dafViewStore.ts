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
import { noteAiResponse } from '@corpus/ui/aiStatus';
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
  cached?: number;
  total?: number;
  pieces?: Record<string, DafViewPiece>;
}

function dafKey(tractate: string, page: string, lang: 'en' | 'he'): string {
  return `${tractate}:${page}:${lang}`;
}

// Keyed by daf so a view loaded for a previous daf is never served for the
// current one (the user navigates while a fetch is in flight).
const [view, setViewRaw] = createSignal<{
  key: string;
  pieces: Record<string, DafViewPiece>;
} | null>(null);

// Bumped on every view write. Card effects read this (tracked) so they re-run as
// the cold-generation poll fills the view in — the progressive-render signal.
// (The view's KEY stays constant while pieces grow, so dafViewLoaded alone
// wouldn't re-fire the effect; the version does.)
const [viewVersion, setViewVersion] = createSignal(0);
function setView(v: { key: string; pieces: Record<string, DafViewPiece> } | null): void {
  setViewRaw(v);
  setViewVersion((n) => n + 1);
}

/** Reactive view-write counter — read it in a card effect to re-render as the
 *  cold-generation poll delivers more pieces. */
export function dafViewVersion(): number {
  return viewVersion();
}

// Which daf key is currently VIEW-DRIVEN: a cold-generation Workflow is in flight
// and the reader renders from the polling view (cards must NOT fire their own
// /api/run). null when no generation is active (warm, settled, or fell back).
const [genKey, setGenKey] = createSignal<string | null>(null);

/** True while a cold daf is rendering from the Workflow + view-poll. Cards and
 *  the prefetcher read this (reactive) to suppress their own /api/run fan-out. */
export function isViewDriven(tractate: string, page: string, lang: 'en' | 'he'): boolean {
  return genKey() === dafKey(tractate, page, lang);
}

// The most recently REQUESTED daf-view key. A load only writes the signal if its
// key is still the latest — so a slow/failed load for a daf the user already
// navigated away from can never clobber the view of the daf now on screen.
let latestKey = '';

// In-flight load promise per daf key, so concurrent callers (DafViewer's open
// effect + the prefetcher) share ONE fetch instead of racing two. Cleared once
// the load settles.
const inflight = new Map<string, Promise<DafViewPayload | null>>();

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
export function loadDafView(
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<DafViewPayload | null> {
  const key = dafKey(tractate, page, lang);
  const existing = inflight.get(key);
  if (existing) return existing;
  latestKey = key;
  const run = fetchViewOnce(key, tractate, page, lang);
  inflight.set(key, run);
  void run.finally(() => {
    if (inflight.get(key) === run) inflight.delete(key);
  });
  return run;
}

/**
 * Fetch the view once, settle the signal (latest-key guarded so a stale daf can't
 * clobber the current one), and RETURN the payload (so callers can read
 * `complete`/`cached`). The signal ALWAYS settles — empty on any failure — so the
 * card gate (`dafViewLoaded`) can't hang. Does NOT touch `latestKey` (entry
 * points own that); the cold-generation poll reuses this each tick.
 */
async function fetchViewOnce(
  key: string,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<DafViewPayload | null> {
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
      return null;
    }
    const j = (await r.json()) as DafViewPayload;
    settle(j.pieces ?? {});
    return j;
  } catch {
    settle({});
    return null;
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
export function ensureDafView(
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<DafViewPayload | null> {
  const key = dafKey(tractate, page, lang);
  const v = view();
  if (v && v.key === key) return Promise.resolve(null);
  return loadDafView(tractate, page, lang);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Open a daf for rendering: load its view once, and if it's INCOMPLETE (cold),
 * drive it from the parallel Workflow instead of letting the cards/prefetcher fan
 * out their own /api/run. Fires the single-flight POST /api/daf-generate, then
 * re-polls the view so cards fill in progressively (they read dafViewVersion).
 *
 * Fail-safe by construction — view-driven mode is dropped (cards fall back to
 * their own fetch) whenever generation can't be trusted to finish:
 *   - the generate trigger fails / is budget-paused (never enters view-driven);
 *   - the cached-piece count stalls for ~32s (a stuck producer);
 *   - a 12-minute hard cap elapses;
 *   - the reader navigates away.
 */
export async function openDafView(
  tractate: string,
  page: string,
  lang: 'en' | 'he',
): Promise<void> {
  const key = dafKey(tractate, page, lang);
  const first = await loadDafView(tractate, page, lang);
  if (latestKey !== key) return; // navigated away mid-load
  if (!first || first.complete) return; // warm (or load failed → cards fetch as today)

  // Optimistically enter view-driven BEFORE the async trigger resolves, so the
  // prefetcher (firing around now) sees it and suppresses its fan-out.
  setGenKey(key);
  let triggered = false;
  try {
    const r = await fetch(
      `/api/daf-generate/${encodeURIComponent(tractate)}/${page}?lang=${lang}`,
      {
        method: 'POST',
      },
    );
    // Parse the body even on a non-2xx: a refused trigger carries the AI-paused
    // envelope (out of credits / budget cap / provider down) — raise the shared
    // banner in THIS round-trip instead of leaving the reader to discover it via
    // the cards' /api/run fallback.
    const resp = (await r.json().catch(() => null)) as { generating?: boolean } | null;
    if (resp) noteAiResponse(resp);
    triggered = !!resp?.generating;
  } catch {
    triggered = false;
  }
  if (!triggered) {
    // Couldn't kick generation (paused/error/network) — leave view-driven so the
    // cards fall back to their own /api/run exactly as before.
    if (genKey() === key) setGenKey(null);
    return;
  }

  try {
    const POLL_MS = 8000;
    const HARD_CAP_MS = 12 * 60 * 1000;
    const STALL_LIMIT = 4; // ~32s with no new pieces → assume stuck, fall back
    const deadline = Date.now() + HARD_CAP_MS;
    let lastCached = -1;
    let stalls = 0;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      if (latestKey !== key) return; // navigated away
      const payload = await fetchViewOnce(key, tractate, page, lang);
      if (latestKey !== key) return;
      if (payload?.complete) return; // fully generated
      const cached = payload?.cached ?? lastCached;
      if (cached > lastCached) {
        lastCached = cached;
        stalls = 0;
      } else {
        stalls += 1;
      }
      if (stalls >= STALL_LIMIT) return; // stuck → drop view-driven, cards fetch
    }
  } finally {
    if (genKey() === key) setGenKey(null);
  }
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
