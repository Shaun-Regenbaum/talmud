/**
 * @fileoverview Structural markers in the daf text — currently the Hadran, the
 * formula recited at a perek (chapter) boundary ("הדרן עלך …").
 *
 * A daf can straddle two perakim, so a single whole-daf Overview/summary
 * conflates them. The Hadran is a deterministic boundary signal (a fixed Hebrew
 * formula), so we detect it in code — no LLM — and surface it: the segment is a
 * `marker` (rendered as a divider, not a content card), and it splits the daf
 * into perek runs that downstream summaries/overviews can respect.
 *
 * Pure + DOM-free + unit-testable.
 */

import { normalizeHebrew } from '../place/verbatim';

/** Segment indices whose text contains the Hadran formula (perek boundaries).
 *  Matches the distinctive opening "הדרן עלך"; falls back to the bare "הדרן"
 *  (always part of the formula, rare elsewhere) so a lightly-varied rendering
 *  still registers. */
export function findHadranSegments(segmentsHe: string[]): number[] {
  const out: number[] = [];
  segmentsHe.forEach((s, i) => {
    if (typeof s !== 'string') return;
    const n = normalizeHebrew(s);
    if (n.includes('הדרן עלך') || n.includes('הדרן')) out.push(i);
  });
  return out;
}

export interface DafMarker {
  startSegIdx: number;
  endSegIdx: number;
  kind: 'hadran';
}

/** All structural markers on the daf, as marker spans (currently just the
 *  Hadran). Shape mirrors a mark instance so renderers can treat it uniformly. */
export function findMarkers(segmentsHe: string[]): DafMarker[] {
  return findHadranSegments(segmentsHe).map((seg) => ({
    startSegIdx: seg,
    endSegIdx: seg,
    kind: 'hadran' as const,
  }));
}

/** Split a daf's segment count into perek runs at the Hadran boundaries — each
 *  run is the [start, end] segment range of one perek's portion on this daf.
 *  The Hadran segment itself ends a run (it's the closing formula). A daf with
 *  no Hadran is one run covering all segments. */
export function perekRuns(segmentsHe: string[]): Array<{ start: number; end: number }> {
  const n = segmentsHe.length;
  if (n === 0) return [];
  const boundaries = findHadranSegments(segmentsHe);
  const runs: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (const b of boundaries) {
    runs.push({ start, end: b }); // run ends ON the Hadran segment (the closing formula)
    start = b + 1;
  }
  if (start < n) runs.push({ start, end: n - 1 });
  return runs;
}
