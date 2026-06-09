/**
 * @fileoverview Revach-l'Daf → argument-section placer (deterministic, English).
 *
 * Revach entries are English summary prose that walks the daf in order; the
 * daf's `argument` sections are ALSO English, ordered, and carry a segment
 * range. So we place a Revach entry by matching it to the section it describes —
 * English word overlap — and borrowing that section's segment range. Conservative
 * by design: a wrong segment label is worse than "whole daf" (the LLM treats it
 * as fact), so we place ONLY on a strong, clear-margin match with enough raw
 * shared words, and we keep the chosen placements in reading order via a
 * max-weight non-decreasing alignment (so one early false positive can't poison
 * the rest). Unmatched entries are left unplaced (they stay whole-daf).
 *
 * Pure: the worker loads this amud's sections and applies the result via
 * `applyMatches`. Per-amud naturally — an entry about the other amud finds no
 * good match here; it gets placed when that amud's context is built.
 */

import { type SegMatch, segRange } from '@corpus/core/context/match';
import type { ContextItem } from '@corpus/core/context/types';

/** The bits of an `argument` section this matcher needs. */
export interface SectionForMatch {
  startSegIdx: number;
  endSegIdx: number;
  title?: string;
  summary?: string;
}

// English content tokens: lowercase words of length >= 4 (so distinctive terms
// like "shema"/"chatzos"/"terumah" and names survive and short function-words
// drop out), minus a stoplist of common words AND structural Talmud scaffold
// ("mishnah", "gemara", "tanna", "rabbi", "verse", "opinion"…) that appear in
// almost every section and so don't discriminate between them.
const STOP = new Set([
  // generic
  'that',
  'this',
  'with',
  'from',
  'they',
  'them',
  'their',
  'have',
  'here',
  'into',
  'which',
  'when',
  'where',
  'while',
  'until',
  'after',
  'before',
  'about',
  'would',
  'should',
  'could',
  'because',
  'there',
  'these',
  'those',
  'then',
  'than',
  'also',
  'both',
  'each',
  'such',
  'only',
  'other',
  'same',
  'more',
  'most',
  'some',
  'must',
  'first',
  'second',
  'third',
  'case',
  'cases',
  'reason',
  'order',
  'time',
  // Talmud scaffold (ubiquitous → non-discriminating)
  'mishnah',
  'mishna',
  'gemara',
  'gemora',
  'tanna',
  'tanno',
  'baraisa',
  'baraita',
  'beraisa',
  'rabbi',
  'rebbi',
  'raban',
  'rabban',
  'says',
  'said',
  'asks',
  'asked',
  'answer',
  'answers',
  'question',
  'questions',
  'verse',
  'verses',
  'opinion',
  'opinions',
  'holds',
  'rules',
  'ruling',
  'teaches',
  'learns',
  'explains',
  'explained',
  'discusses',
  'states',
  'halacha',
  'halachah',
  'amud',
  'sugya',
]);

function tokenSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z']{4,}/g) ?? []) {
    const t = w.replace(/'/g, '');
    if (t.length >= 4 && !STOP.has(t)) out.add(t);
  }
  return out;
}

/** Jaccard similarity + the raw intersection count (so we can require real
 *  evidence, not just a high ratio on tiny token sets). */
function overlap(a: Set<string>, b: Set<string>): { score: number; inter: number } {
  if (!a.size || !b.size) return { score: 0, inter: 0 };
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return { score: inter / (a.size + b.size - inter), inter };
}

// Tunable conservative thresholds (verified against a daf sample before rollout).
const MIN_SCORE = 0.16; // best section must share enough distinctive words
const MIN_MARGIN = 0.06; // …and clearly beat the runner-up
const MIN_OVERLAP = 3; // …with at least this many real shared words

interface Cand {
  key: string;
  sec: number;
  score: number;
}

/** Keep the max-total-score subset of candidates whose section indices are
 *  non-decreasing in entry order (weighted longest non-decreasing subsequence).
 *  This preserves reading order without letting one bad early match drop every
 *  later one. O(n^2), n = matched entries (tiny). */
function keepInOrder(cands: Cand[]): Cand[] {
  const n = cands.length;
  if (n <= 1) return cands;
  const dp = cands.map((c) => c.score);
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (cands[j].sec <= cands[i].sec && dp[j] + cands[i].score > dp[i]) {
        dp[i] = dp[j] + cands[i].score;
        prev[i] = j;
      }
    }
  }
  let best = 0;
  for (let i = 1; i < n; i++) if (dp[i] > dp[best]) best = i;
  const out: Cand[] = [];
  for (let i = best; i >= 0; i = prev[i]) out.push(cands[i]);
  return out.reverse();
}

/** Place Revach items onto the argument section each one describes. Returns the
 *  SegMatches to feed `applyMatches`; items without a confident, in-order match
 *  are simply omitted (left unplaced → whole-daf). */
export function matchRevach(items: ContextItem[], sections: SectionForMatch[]): SegMatch[] {
  if (sections.length === 0) return [];
  // Defensive: align over reading order, not cache/storage order.
  const secs = [...sections].sort((a, b) => a.startSegIdx - b.startSegIdx);
  const secTokens = secs.map((s) => tokenSet(`${s.title ?? ''} ${s.summary ?? ''}`));

  const cands: Cand[] = [];
  for (const item of items) {
    if (item.source !== 'dafyomi:revach') continue;
    const et = tokenSet(`${item.title?.en ?? ''} ${item.body?.en ?? ''}`);
    if (et.size < 3) continue;
    let best = -1,
      bestScore = 0,
      second = 0,
      bestInter = 0;
    secs.forEach((_s, idx) => {
      const { score, inter } = overlap(et, secTokens[idx]);
      if (score > bestScore) {
        second = bestScore;
        bestScore = score;
        best = idx;
        bestInter = inter;
      } else if (score > second) second = score;
    });
    if (
      best < 0 ||
      bestScore < MIN_SCORE ||
      bestScore - second < MIN_MARGIN ||
      bestInter < MIN_OVERLAP
    )
      continue;
    cands.push({ key: item.key, sec: best, score: bestScore });
  }

  return keepInOrder(cands).map((c) => {
    const s = secs[c.sec];
    return {
      key: c.key,
      segs: segRange(s.startSegIdx, s.endSegIdx),
      via: 'revach-section',
      confidence: Math.round(c.score * 100) / 100,
    };
  });
}
