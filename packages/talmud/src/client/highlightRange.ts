/**
 * Build a DOM Range over `.daf-word[data-seg=N]` spans inside `mainCol`,
 * optionally bounded by tokenStart (offset within startSeg) and tokenEnd
 * (offset within endSeg, inclusive). When tokens are absent, paints the
 * whole startSeg → endSeg span (legacy whole-segment behaviour).
 *
 * Used by the sidebar-card highlights (argument / aggadata / pesuk / rishonim)
 * for sub-segment precision — critical when multiple moves/citations live
 * inside the same Sefaria segment (e.g., the opening Mishnah of a tractate is
 * one big segment the LLM identifies as 4-5 distinct moves). Rishonim passes
 * startSeg === endSeg with no tokens to tint a single segment.
 *
 * Walks the .daf-word stream in DOM order: tokenStart counts forward from the
 * first word of startSeg, tokenEnd counts forward from the first word of
 * endSeg. Out-of-range token indices clamp to the segment's word count.
 *
 * Pure DOM helper (no app imports) so it can be unit-tested under jsdom without
 * pulling in the DafViewer module graph.
 */
export function buildTokenRange(
  mainCol: HTMLElement,
  startSeg: number,
  endSegRequested: number,
  tokenStart?: number,
  tokenEnd?: number,
): Range | null {
  const firstSpans = mainCol.querySelectorAll<HTMLElement>(`.daf-word[data-seg="${startSeg}"]`);
  if (firstSpans.length === 0) return null;
  // Walk down to find a tagged endSeg (LLM ranges occasionally over-shoot).
  let endSeg = -1;
  let endSpans: NodeListOf<HTMLElement> | null = null;
  for (let s = endSegRequested; s >= startSeg; s--) {
    const found = mainCol.querySelectorAll<HTMLElement>(`.daf-word[data-seg="${s}"]`);
    if (found.length > 0) {
      endSeg = s;
      endSpans = found;
      break;
    }
  }
  if (!endSpans) return null;

  const tokStart =
    typeof tokenStart === 'number' && tokenStart >= 0 && tokenStart < firstSpans.length
      ? tokenStart
      : 0;
  const tokEnd =
    typeof tokenEnd === 'number' && tokenEnd >= 0 && tokenEnd < endSpans.length
      ? tokenEnd
      : endSpans.length - 1;

  const range = document.createRange();
  range.setStartBefore(firstSpans[tokStart]);
  // Same-segment case: use endSpans (= firstSpans) sliced to tokEnd, but
  // ensure tokEnd >= tokStart to avoid an inverted range.
  if (startSeg === endSeg) {
    const safeEnd = Math.max(tokStart, tokEnd);
    const lastInSeg = firstSpans.length - 1;
    range.setEndAfter(firstSpans[Math.min(safeEnd, lastInSeg)]);
  } else {
    range.setEndAfter(endSpans[tokEnd]);
  }
  return range;
}
