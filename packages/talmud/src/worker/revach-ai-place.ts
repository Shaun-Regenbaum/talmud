/**
 * @fileoverview AI fallback for Revach l'Daf placement.
 *
 * The deterministic placer (matchRevach) is high-precision but low-recall on
 * Revach's English summary prose. For the entries it leaves whole-daf, this
 * backs up to the existing AI segment-matcher — but ONCE PER DAF, CACHED, so the
 * live context build never makes an LLM call on a cache hit: the first build for
 * a daf computes + caches the AI placement; every later build reads it.
 *
 * Safety (a wrong segment is worse than "whole daf"):
 *  - the AI only ever FILLS GAPS — it never overrides a deterministic placement;
 *  - only matches at/above a CONFIDENCE FLOOR are applied, so the matcher's
 *    low-confidence "couldn't localize" guesses (e.g. an opposite-amud entry
 *    against this amud's segments) are dropped and stay whole-daf;
 *  - all KV + LLM failures are silent — deterministic placement always stands.
 *
 * The cache holds matches for ALL Revach entries (not just the currently-unplaced
 * set), so it's complete + stable regardless of how the deterministic pass went.
 * Improve over time by feeding confident AI placements back as rule examples.
 */

import { aiMatchToSegments } from './context-match';
import { getSefariaSegmentsCached } from './source-cache';
import { applyMatches, type SegMatch } from '@corpus/core/context/match';
import type { ContextItem } from '@corpus/core/context/types';
import type { MatchInput } from '../lib/context/anchor/ai-prompt';
import type { LLMEnv } from '@corpus/core/llm/llm';

// Bump when the Revach parser output (entry order/keys), the segment text, or
// the matcher prompt/model changes — positional keys (`revach:a:i`) mean stale
// matches would otherwise apply to a different entry.
const KEY = (tractate: string, page: string) => `revach-place:v2:${tractate}:${page}`;

/** Drop AI matches below this confidence — the matcher reports ~0.9 when it
 *  localizes well and ~0 when it can't, so this filters out the guesses. */
const MIN_AI_CONF = 0.6;

function revachItems(items: ContextItem[]): ContextItem[] {
  return items.filter((i) => i.source === 'dafyomi:revach');
}

function toMatchInput(it: ContextItem): MatchInput {
  return { key: it.key, label: "Revach l'Daf", title: it.title?.en, text: (it.body?.en ?? '').slice(0, 400) };
}

/** Apply AI matches ONLY to items the deterministic pass left unplaced, and only
 *  above the confidence floor, so a deterministic (or strong) placement is never
 *  overridden and weak guesses don't smear context. Pure + exported for tests. */
export function applyAiToUnplaced(items: ContextItem[], matches: SegMatch[]): number {
  const gaps = new Set(revachItems(items).filter((i) => i.segs.length === 0).map((i) => i.key));
  const good = matches.filter((m) => gaps.has(m.key) && (m.confidence ?? 0) >= MIN_AI_CONF);
  return applyMatches(items, good);
}

// In-isolate coalescing: many section enrichments for one daf build context
// concurrently; without this each would fire its own AI compute on a cold daf.
const inflight = new Map<string, Promise<SegMatch[] | null>>();

async function getOrCompute(
  env: LLMEnv & { CACHE?: KVNamespace },
  tractate: string,
  page: string,
  all: ContextItem[],
  cacheOnly = false,
): Promise<SegMatch[] | null> {
  const cache = env.CACHE;
  const cacheKey = KEY(tractate, page);
  if (cache) {
    try {
      const raw = await cache.get(cacheKey);
      if (raw) return JSON.parse(raw) as SegMatch[];
    } catch { /* missing / corrupt → recompute */ }
  }
  // Inspector source-preview pass: never trigger the LLM matcher on a miss.
  if (cacheOnly) return null;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const job = (async (): Promise<SegMatch[] | null> => {
    const segs = await getSefariaSegmentsCached(cache, tractate, page).catch(() => null);
    if (!segs?.he?.length) return null;
    let matches: SegMatch[];
    try {
      matches = await aiMatchToSegments(env, segs.he, segs.en ?? [], all.map(toMatchInput), { tractate, page });
    } catch {
      return null; // budget paused / LLM error → deterministic stands
    }
    if (cache) { try { await cache.put(cacheKey, JSON.stringify(matches)); } catch { /* best-effort */ } }
    return matches;
  })();
  inflight.set(cacheKey, job);
  try { return await job; } finally { inflight.delete(cacheKey); }
}

/** Place still-unplaced Revach items via the cached AI matcher (mutates `items`). */
export async function placeRevachWithAi(
  env: LLMEnv & { CACHE?: KVNamespace },
  tractate: string,
  page: string,
  items: ContextItem[],
  /** When true, apply ONLY already-cached AI placements and never compute fresh
   *  matches (no LLM). Used by the read-only /api/run-sources inspector pass so a
   *  preview reflects the real prompt's cached placements without triggering the
   *  matcher on a cold daf. */
  cacheOnly = false,
): Promise<void> {
  const all = revachItems(items);
  if (all.length === 0) return;
  if (!all.some((i) => i.segs.length === 0)) return; // nothing to fill
  const matches = await getOrCompute(env, tractate, page, all, cacheOnly);
  if (matches) applyAiToUnplaced(items, matches);
}
