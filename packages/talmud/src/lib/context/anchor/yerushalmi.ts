/**
 * @fileoverview Yerushalmi-parallel matcher (deterministic, verbatim).
 *
 * dafyomi.co.il "Yerushalmi to Match <Bavli daf>" items carry the parallel
 * YERUSHALMI text, not the Bavli text — but the genuinely-parallel layer (the
 * shared Mishnah, quoted baraitot, biblical citations) is verbatim in both
 * Talmuds. So we locate a yerushalmi item by the Bavli segment(s) whose Hebrew
 * shares the longest contiguous verbatim phrase with it. The divergent
 * Yerushalmi gemara shares no long phrase and stays unplaced — correct, and left
 * for the AI matcher to place by meaning (precision over recall).
 *
 * Mirrors the bg-term / Tosfos-DH deterministic placers: free, instant, and it
 * funnels its writes through the same `item.segs` / `item.via` contract.
 */
import type { ContextItem } from '@corpus/core/context/types';
import { normalizeHebrew } from '../../place/verbatim.ts';
import { longestCommonRun } from '../../yerushalmiAlign.ts';

/** Minimum shared contiguous normalized-word run to assert a Yerushalmi anchor.
 *  Higher than the per-point threshold (these items are whole-subject, longer
 *  text, so a short incidental match is more likely — be stricter). */
const MIN_PLACE_RUN = 4;
/** Don't smear an item across more than this many segments (ambiguous). */
const MAX_HIT_SEGS = 4;

/**
 * Place each dafyomi-yerushalmi context item on the Bavli segment(s) it shares
 * a long verbatim phrase with. Returns the number placed.
 */
export function matchYerushalmiToSegments(
  items: ContextItem[],
  segmentsHe: string[] | undefined,
): number {
  if (!segmentsHe || segmentsHe.length === 0) return 0;
  const segWords = segmentsHe.map((h) => normalizeHebrew(h).split(' ').filter(Boolean));

  let placed = 0;
  for (const item of items) {
    if (item.source !== 'dafyomi:yerushalmi') continue;
    if (item.segs.length > 0) continue;
    const pWords = normalizeHebrew(item.body?.he ?? '')
      .split(' ')
      .filter(Boolean);
    if (pWords.length < MIN_PLACE_RUN) continue;

    const runs = segWords.map((sw) => longestCommonRun(pWords, sw).len);
    const best = Math.max(0, ...runs);
    if (best < MIN_PLACE_RUN) continue; // no strong verbatim overlap — leave for AI

    // Place on every segment within one word of the best run (a Mishnah quoted
    // across the item can land on 1-3 adjacent segments), capped to avoid smear.
    const hits = runs
      .map((len, i) => ({ len, i }))
      .filter((s) => s.len >= Math.max(MIN_PLACE_RUN, best - 1))
      .map((s) => s.i);
    if (hits.length === 0 || hits.length > MAX_HIT_SEGS) continue;

    item.segs = hits.sort((a, b) => a - b);
    item.via = 'yerushalmi-phrase';
    item.confidence = best >= 6 ? 0.85 : 0.7;
    placed++;
  }
  return placed;
}
