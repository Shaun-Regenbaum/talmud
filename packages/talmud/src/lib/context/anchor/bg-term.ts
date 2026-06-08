/**
 * @fileoverview Background-term matcher (deterministic, high confidence).
 *
 * dafyomi.co.il "Background" glossary/girsa items carry the exact Hebrew term
 * they gloss (`title.he`, from the page's `span.defheb` / `girsalocheb`) — and
 * that term is a verbatim phrase quoted from the Gemara. So we locate it: find
 * the daf segment(s) whose Hebrew text contains the term as a run of whole
 * words, and place the item there. Matching is whole-word (so "טורף" doesn't
 * match inside "מטורף"), except the FIRST word may carry a leading Hebrew
 * prefix (ו/ה/ב/כ/ל/מ/ש/ד), since a glossed lemma like "ארכובה" appears in the
 * Gemara as "הארכובה".
 *
 * Background blocks are whole-daf (both amudim), but the segments handed in are
 * one amud — so a term from the OTHER amud simply finds no match and stays
 * unplaced (correct: it isn't on this amud). Common/ambiguous terms that hit
 * many segments are left unplaced rather than smeared across the daf.
 */

import type { ContextItem } from '@corpus/core/context/types';

const NIQQUD = /[֑-ׇ]/g;
/** Mirror of the other matchers' Hebrew normalization: strip niqqud,
 *  punctuation, and treat maqaf/hyphen as a word break. */
function normHe(s: string): string {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(NIQQUD, '')
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/[־-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One or two stacked Hebrew prefix letters (vav/he/bet/kaf/lamed/mem/shin/dalet). */
const PREFIX = /^[ובהכלמשד]{1,2}$/;

/** Match a segment word to a term word — exact, or (first word only) the
 *  segment word is the term word carrying a leading Hebrew prefix. */
function wordEq(segWord: string, termWord: string, allowPrefix: boolean): boolean {
  if (segWord === termWord) return true;
  if (!allowPrefix || segWord.length <= termWord.length || !segWord.endsWith(termWord)) return false;
  return PREFIX.test(segWord.slice(0, segWord.length - termWord.length));
}

/** True if `term` (as whole words) appears as a contiguous run in `seg`. The
 *  first term word may be prefixed; the rest must match exactly. */
function wordsContain(seg: string[], term: string[]): boolean {
  if (term.length === 0) return false;
  for (let i = 0; i + term.length <= seg.length; i++) {
    if (!wordEq(seg[i], term[0], true)) continue;
    let ok = true;
    for (let j = 1; j < term.length; j++) {
      if (seg[i + j] !== term[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/** Min normalized-character length for a term to be specific enough to place
 *  (one- or two-letter tokens are too generic). */
const MIN_TERM_CHARS = 3;
/** Place a term that hits at most this many segments; more = too ambiguous. */
const MAX_HIT_SEGS = 3;

/** Place dafyomi Background glossary/girsa items onto the segment(s) whose
 *  Hebrew contains their term. Mutates matched items (sets `segs`/`via`/
 *  `confidence`). Returns the count placed. */
export function matchBackgroundTerms(items: ContextItem[], segmentsHe: string[] | undefined): number {
  if (!segmentsHe || segmentsHe.length === 0) return 0;
  const segWords = segmentsHe.map((h) => normHe(h).split(' ').filter(Boolean));

  let placed = 0;
  for (const item of items) {
    if (item.source !== 'dafyomi:background') continue;
    if (item.kind !== 'glossary' && item.kind !== 'girsa') continue;
    if (item.segs.length > 0) continue; // already placed
    const termWords = normHe(item.title?.he ?? '').split(' ').filter(Boolean);
    if (termWords.join('').length < MIN_TERM_CHARS) continue;

    const hits: number[] = [];
    segWords.forEach((seg, i) => { if (wordsContain(seg, termWords)) hits.push(i); });
    if (hits.length === 0 || hits.length > MAX_HIT_SEGS) continue;

    item.segs = hits;
    item.via = 'bg-term';
    item.confidence = hits.length === 1 ? 0.9 : 0.6;
    placed++;
  }
  return placed;
}
