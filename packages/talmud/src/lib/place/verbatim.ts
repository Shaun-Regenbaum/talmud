/**
 * Verbatim-excerpt placement — the one shared core for "match a verbatim
 * Hebrew/Aramaic excerpt to a segment + word offset". This logic was copy-
 * pasted across postProcessArgument / postProcessArgumentMove /
 * postProcessPesukim / postProcessAggadata in src/worker/index.ts (and a
 * near-variant lives in hbAlign.ts / rabbi-observations.ts). Converging it here
 * means one normalize + one matcher, exercised by a golden regression suite.
 *
 * DOM-free and env-free: pure functions over the segment grid, so both the
 * worker (server post-processing) and the client (hbAlign) can import it.
 *
 * IMPORTANT: behavior here must stay byte-identical to the original inline
 * matchers — tests/golden-anchors.test.ts pins it against production output.
 */

/** Strip nikud + cantillation, punctuation/quotes, bidi/zero-width controls,
 *  collapse whitespace. Identical to the regex chain that lived in each
 *  postProcessX. Written with \u escapes so the invisible-character classes
 *  (bidi marks, ZWSP, BOM) are unambiguous and copy-safe. */
export function normalizeHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '') // Hebrew accents (taamim) + nikud
    .replace(/[׳״"'.,:;!?\-–—()[\]{}]/g, '') // geresh/gershayim, punctuation, en/em dash, brackets
    .replace(/[​-‏‪-‮﻿]/g, '') // zero-width + bidi controls + BOM
    .replace(/\s+/g, ' ')
    .trim();
}

export interface VerbatimGrid {
  /** Per-segment normalized text. */
  segNorms: string[];
  /** Per-segment normalized words (whitespace-split). Word index N here lines
   *  up with the (N+1)th .daf-word[data-seg=segIdx] in client DOM order. */
  segWords: string[][];
}

export function buildVerbatimGrid(segmentsHe: string[]): VerbatimGrid {
  const segNorms = segmentsHe.map(normalizeHebrew);
  const segWords = segNorms.map((s) => s.split(' ').filter(Boolean));
  return { segNorms, segWords };
}

/** Progressively shorter prefixes of a normalized excerpt: the full phrase,
 *  then 4, 3, 2 words. Mirrors the `tries` array built in every caller — used
 *  when the LLM lightly paraphrases but the opening words still match verbatim. */
export function prefixTries(exWords: string[]): string[][] {
  const tries: string[][] = [exWords];
  if (exWords.length > 4) tries.push(exWords.slice(0, 4));
  if (exWords.length > 3) tries.push(exWords.slice(0, 3));
  if (exWords.length > 2) tries.push(exWords.slice(0, 2));
  return tries;
}

export interface ExcerptHit {
  seg: number;
  /** Word index within the segment where the match starts. 0 on a substring-
   *  but-not-word-aligned soft fallback. */
  tok: number;
  /** Word count attributed to the match — see ExcerptOpts.fullMatchLen. */
  matchLen: number;
}

export interface ExcerptOpts {
  /** When true, return the LAST occurrence within the range (for closing
   *  anchors that may share words with a refrain earlier in the unit).
   *  Mirrors aggadata's findExcerptLast. */
  last?: boolean;
  /** matchLen semantics. false (default): the matched PREFIX word count
   *  (pesukim/aggadata). true: the FULL excerpt word count regardless of which
   *  prefix matched (argument-move). */
  fullMatchLen?: boolean;
}

/** Find one already-split needle in [fromSeg,toSeg]. Word-aligned; on a pure
 *  substring (not word-aligned) match, soft-falls back to tok=0. Needles
 *  shorter than 2 words are rejected (too ambiguous). `last`: keep the last
 *  word-aligned hit within a segment AND the last matching segment in range. */
function findNeedle(
  grid: VerbatimGrid,
  needle: string[],
  fromSeg: number,
  toSeg: number,
  last: boolean,
): { seg: number; tok: number } | null {
  if (needle.length < 2) return null;
  const { segNorms, segWords } = grid;
  const needleStr = needle.join(' ');
  if (!last) {
    for (let i = fromSeg; i <= toSeg && i < segNorms.length; i++) {
      if (!segNorms[i].includes(needleStr)) continue;
      const words = segWords[i];
      for (let w = 0; w + needle.length <= words.length; w++) {
        let ok = true;
        for (let k = 0; k < needle.length; k++) {
          if (words[w + k] !== needle[k]) {
            ok = false;
            break;
          }
        }
        if (ok) return { seg: i, tok: w };
      }
      // String matched but not word-aligned (mid-word substring) — soft fallback.
      return { seg: i, tok: 0 };
    }
    return null;
  }
  // last-occurrence scan
  let result: { seg: number; tok: number } | null = null;
  for (let i = fromSeg; i <= toSeg && i < segNorms.length; i++) {
    if (!segNorms[i].includes(needleStr)) continue;
    const words = segWords[i];
    let segHit: { seg: number; tok: number } | null = null;
    for (let w = 0; w + needle.length <= words.length; w++) {
      let ok = true;
      for (let k = 0; k < needle.length; k++) {
        if (words[w + k] !== needle[k]) {
          ok = false;
          break;
        }
      }
      if (ok) segHit = { seg: i, tok: w };
    }
    result = segHit ?? { seg: i, tok: 0 };
  }
  return result;
}

/** Multi-prefix verbatim search. Normalizes the excerpt, tries the full phrase
 *  then shorter prefixes, returns the first (or last, per opts) word-aligned
 *  hit. Returns null when nothing matches. */
export function findExcerpt(
  grid: VerbatimGrid,
  excerpt: string,
  fromSeg: number,
  toSeg: number,
  opts: ExcerptOpts = {},
): ExcerptHit | null {
  const ex = normalizeHebrew(excerpt);
  if (!ex) return null;
  const exWords = ex.split(' ').filter(Boolean);
  if (exWords.length === 0) return null;
  for (const needle of prefixTries(exWords)) {
    const hit = findNeedle(grid, needle, fromSeg, toSeg, opts.last ?? false);
    if (hit) {
      const matchLen = opts.fullMatchLen ? exWords.length : needle.length;
      return { seg: hit.seg, tok: hit.tok, matchLen };
    }
  }
  return null;
}
