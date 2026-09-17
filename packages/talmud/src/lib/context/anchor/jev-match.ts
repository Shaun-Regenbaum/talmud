/**
 * @fileoverview AI segment matcher on Jev (TypeSafe System One) — pure pieces.
 *
 * The matcher's question is a selection: given the daf as numbered segments,
 * which segment does each study note discuss? That is a Jev Choice whose
 * options are the segment ids, with the segment text sent ONCE in the state
 * (the line-by-line search recipe from the TypeSafe docs), plus one Noul per
 * note asking whether the note is about the daf as a whole rather than any one
 * line. Every note in a chunk rides in the same request, so the daf text is
 * paid for once per chunk and the answers come back together.
 *
 * Ranges: the old prompt let the model return segStart..segEnd. Here a range
 * falls out of the probability mass — when Jev splits its belief between two
 * adjacent segments (the note straddles them) the placement widens to cover
 * both, and the match's confidence is the mass of the range. A flat
 * distribution stays a low-confidence single segment, which downstream floors
 * (revach-ai-place MIN_AI_CONF) already drop.
 *
 * No `quote`: the LLM matcher emitted a Hebrew phrase for word-level
 * tightening, but applyMatches never copied it onto the item and nothing reads
 * it, so segment-level placement is what the app has always shown.
 *
 * Kept free of Worker/LLM deps (type-only import) so it is unit-testable; the
 * Worker side (src/worker/context-match.ts) wires it to runJev.
 */

import type { SegMatch } from '@corpus/core/context/match';
import type { ChoiceAnswer, NoulAnswer } from '@corpus/core/llm/jev';
import type { MatchInput } from './ai-prompt';

/** Notes per Jev request. The daf text is repeated per request, so bigger
 *  chunks are cheaper; 16 keeps a long daf (80 segments) plus 32 questions
 *  well inside the 64k-token request limit. */
export const JEV_MATCH_CHUNK_SIZE = 16;
/** p(whole daf) at/above which a note is a deliberate whole-daf placement,
 *  unless the segment distribution is itself confident (see below). */
export const WHOLE_DAF_MIN = 0.5;
/** Probability of the single most likely segment at/above which a segment
 *  placement wins over a whole-daf lean. The TOP segment, not the range mass:
 *  belief smeared across neighbors is not a localization. */
export const TOP_OVERRIDES_WHOLE_DAF = 0.6;
/** An adjacent segment joins the range when it carries at least this much. */
export const NEIGHBOR_MIN = 0.15;
/** Widest placement the range rule may produce. */
export const MAX_SPAN = 3;

export function segId(i: number): string {
  return `s${i}`;
}
export function noteId(i: number): string {
  return `n${i}`;
}

function clean(s: string, max: number): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** One request for one chunk of notes over one daf. */
export function buildMatchJevRequest(
  segmentsHe: readonly string[],
  segmentsEn: readonly string[],
  items: readonly MatchInput[],
  opts: { maxSegChars?: number; maxItemChars?: number } = {},
) {
  const { maxSegChars = 220, maxItemChars = 400 } = opts;
  const daf_segments = segmentsHe.map((he, i) => ({
    id: segId(i),
    he: clean(he, maxSegChars),
    en: clean(segmentsEn[i] ?? '', maxSegChars),
  }));
  const notes = items.map((it, i) => ({
    id: noteId(i),
    source: it.label,
    title: it.title ?? '',
    text: clean(it.text ?? '', maxItemChars),
  }));
  const segmentCriteria: Record<string, null> = {};
  for (const s of daf_segments) segmentCriteria[s.id] = null;

  const questions: Record<
    string,
    | { type: 'choice'; instructions: string; criteria: Record<string, null> }
    | { type: 'noul'; instructions: string; criteria: { true: string; false: string } }
  > = {};
  items.forEach((_it, i) => {
    questions[`${noteId(i)}_segment`] = {
      type: 'choice',
      instructions: `\`notes[${i}]\` is a study note about this page of Talmud. Which one entry of \`daf_segments\` does it most directly discuss or comment on? Match by MEANING, not shared words: read the English of each segment to understand what it says, then pick the segment that makes the same point, even when the note and the segment share no vocabulary. Prefer the single best segment.`,
      criteria: segmentCriteria,
    };
    questions[`${noteId(i)}_whole_daf`] = {
      type: 'noul',
      instructions: `Is \`notes[${i}]\` about this page as a whole (a general summary, an overview of the topic, a methodology remark), rather than about any one segment of \`daf_segments\`?`,
      criteria: {
        true: 'Yes: no single segment fits; the note speaks about the page or its topic in general.',
        false:
          'No: the note comments on a specific line or passage that one segment (or two adjacent ones) contains.',
      },
    };
  });

  return { state: { daf_segments, notes }, questions };
}

export type MatchJevAnswers = Record<string, ChoiceAnswer | NoulAnswer>;

/** Pick the top segment, then widen to adjacent segments that carry real mass
 *  (up to MAX_SPAN). Returns the inclusive range, its probability mass, and
 *  the top segment's own probability. */
export function rangeFromDistribution(
  probs: Readonly<Record<string, number>>,
  segCount: number,
  opts: { neighborMin?: number; maxSpan?: number } = {},
): { start: number; end: number; mass: number; top: number } | null {
  const { neighborMin = NEIGHBOR_MIN, maxSpan = MAX_SPAN } = opts;
  const p = (i: number) => (i >= 0 && i < segCount ? (probs[segId(i)] ?? 0) : -1);
  let top = -1;
  let topP = -1;
  for (let i = 0; i < segCount; i++) {
    const v = p(i);
    if (v > topP) {
      top = i;
      topP = v;
    }
  }
  if (top < 0 || topP <= 0) return null;
  let start = top;
  let end = top;
  let mass = topP;
  while (end - start + 1 < maxSpan) {
    const left = p(start - 1);
    const right = p(end + 1);
    if (left < neighborMin && right < neighborMin) break;
    if (left >= right) {
      start -= 1;
      mass += left;
    } else {
      end += 1;
      mass += right;
    }
  }
  return { start, end, mass: Math.round(mass * 100) / 100, top: Math.round(topP * 100) / 100 };
}

/** Turn one chunk's answers into SegMatches (same contract as
 *  parseMatchResponse: unknown/invalid answers are skipped, not guessed). */
export function matchesFromJevAnswers(
  answers: MatchJevAnswers,
  items: readonly MatchInput[],
  segCount: number,
): SegMatch[] {
  const out: SegMatch[] = [];
  items.forEach((it, i) => {
    const seg = answers[`${noteId(i)}_segment`];
    const whole = answers[`${noteId(i)}_whole_daf`];
    if (!seg || seg.type !== 'choice') return;
    const pWhole = whole?.type === 'noul' ? whole.noul : 0;
    const range = rangeFromDistribution(seg.probabilities, segCount);
    if (pWhole >= WHOLE_DAF_MIN && (!range || range.top < TOP_OVERRIDES_WHOLE_DAF)) {
      out.push({
        key: it.key,
        segs: [],
        via: 'ai',
        wholeDaf: true,
        confidence: Math.round(pWhole * 100) / 100,
      });
      return;
    }
    if (!range) return;
    const segs: number[] = [];
    for (let s = range.start; s <= range.end; s++) segs.push(s);
    out.push({ key: it.key, segs, via: 'ai', confidence: range.mass });
  });
  return out;
}
