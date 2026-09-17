/**
 * Segment matcher on Jev — the pure pieces (src/lib/context/anchor/jev-match.ts):
 * request shape, the range-from-probability rule, and answers → SegMatch.
 */
import { describe, expect, it } from 'vitest';
import type { MatchInput } from '../src/lib/context/anchor/ai-prompt';
import {
  buildMatchJevRequest,
  JEV_MATCH_CHUNK_SIZE,
  MAX_SPAN,
  type MatchJevAnswers,
  matchesFromJevAnswers,
  NEIGHBOR_MIN,
  rangeFromDistribution,
  segId,
  WHOLE_DAF_MIN,
} from '../src/lib/context/anchor/jev-match';

const segHe = ['סגמנט אפס', 'סגמנט אחד', 'סגמנט <b>שתיים</b>', 'סגמנט שלוש', 'סגמנט ארבע'];
const segEn = ['segment zero', 'segment one', 'segment two', 'segment three', 'segment four'];
const items: MatchInput[] = [
  { key: 'ins:0', label: 'Insights', title: 'Tzomes', text: 'discusses the sinews' },
  { key: 'rev:1', label: "Revach l'Daf", text: 'a general overview of the daf' },
];

/** Probability map over the 5 segments from a sparse spec; the rest get 0. */
const dist = (spec: Record<number, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (let i = 0; i < segHe.length; i++) out[segId(i)] = spec[i] ?? 0;
  return out;
};
const choiceOf = (probs: Record<string, number>) => {
  const choice = Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];
  return { type: 'choice' as const, choice, probabilities: probs, confidence: 0.5 };
};
const noulOf = (p: number) => ({ type: 'noul' as const, noul: p });

describe('buildMatchJevRequest', () => {
  it('sends the daf once as state and one Choice + one Noul per note', () => {
    const req = buildMatchJevRequest(segHe, segEn, items);
    expect(req.state.daf_segments).toHaveLength(5);
    expect(req.state.daf_segments[2]).toEqual({ id: 's2', he: 'סגמנט שתיים', en: 'segment two' }); // HTML stripped
    expect(req.state.notes[0]).toEqual({
      id: 'n0',
      source: 'Insights',
      title: 'Tzomes',
      text: 'discusses the sinews',
    });
    expect(Object.keys(req.questions)).toEqual([
      'n0_segment',
      'n0_whole_daf',
      'n1_segment',
      'n1_whole_daf',
    ]);
    const q = req.questions.n0_segment;
    expect(q.type).toBe('choice');
    expect(Object.keys((q as { criteria: Record<string, null> }).criteria)).toEqual([
      's0',
      's1',
      's2',
      's3',
      's4',
    ]);
    expect(q.instructions).toContain('notes[0]');
    expect(req.questions.n1_whole_daf.type).toBe('noul');
  });

  it('truncates long segment and note text', () => {
    const long = 'x'.repeat(1000);
    const req = buildMatchJevRequest([long], [long], [{ key: 'k', label: 'L', text: long }], {
      maxSegChars: 50,
      maxItemChars: 30,
    });
    expect(req.state.daf_segments[0].he).toHaveLength(50);
    expect(req.state.notes[0].text).toHaveLength(30);
  });

  it('chunk size keeps a long daf inside the request limit', () => {
    expect(JEV_MATCH_CHUNK_SIZE).toBeGreaterThanOrEqual(8);
    expect(JEV_MATCH_CHUNK_SIZE).toBeLessThanOrEqual(32);
  });
});

describe('rangeFromDistribution', () => {
  it('a peaked distribution is a single segment carrying its own mass', () => {
    expect(rangeFromDistribution(dist({ 2: 0.9, 1: 0.05, 3: 0.05 }), 5)).toEqual({
      start: 2,
      end: 2,
      mass: 0.9,
      top: 0.9,
    });
  });
  it('mass split across two adjacent segments widens to both', () => {
    expect(rangeFromDistribution(dist({ 2: 0.5, 3: 0.4, 0: 0.1 }), 5)).toEqual({
      start: 2,
      end: 3,
      mass: 0.9,
      top: 0.5,
    });
  });
  it('a distant second choice does not join the range', () => {
    expect(rangeFromDistribution(dist({ 0: 0.55, 4: 0.45 }), 5)).toEqual({
      start: 0,
      end: 0,
      mass: 0.55,
      top: 0.55,
    });
  });
  it('never exceeds MAX_SPAN', () => {
    const r = rangeFromDistribution(dist({ 0: 0.2, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2 }), 5);
    expect(r).not.toBeNull();
    expect((r as { end: number; start: number }).end - (r as { start: number }).start + 1).toBe(
      MAX_SPAN,
    );
  });
  it('neighbors below NEIGHBOR_MIN stay out', () => {
    const r = rangeFromDistribution(dist({ 2: 0.8, 3: NEIGHBOR_MIN - 0.01 }), 5);
    expect(r).toEqual({ start: 2, end: 2, mass: 0.8, top: 0.8 });
  });
  it('returns null for an empty or all-zero distribution', () => {
    expect(rangeFromDistribution({}, 5)).toBeNull();
    expect(rangeFromDistribution(dist({}), 5)).toBeNull();
  });
});

describe('matchesFromJevAnswers', () => {
  it('places a confident note on its segment with the mass as confidence', () => {
    const answers: MatchJevAnswers = {
      n0_segment: choiceOf(dist({ 1: 0.85, 2: 0.1 })),
      n0_whole_daf: noulOf(0.1),
      n1_segment: choiceOf(dist({ 0: 0.3, 3: 0.3, 4: 0.4 })),
      n1_whole_daf: noulOf(0.9),
    };
    const out = matchesFromJevAnswers(answers, items, segHe.length);
    expect(out).toEqual([
      { key: 'ins:0', segs: [1], via: 'ai', confidence: 0.85 },
      { key: 'rev:1', segs: [], via: 'ai', wholeDaf: true, confidence: 0.9 },
    ]);
  });

  it('belief smeared over adjacent segments does not beat a strong whole-daf answer', () => {
    const smeared: MatchJevAnswers = {
      n0_segment: choiceOf(dist({ 3: 0.3, 4: 0.4, 0: 0.3 })),
      n0_whole_daf: noulOf(0.9),
    };
    expect(matchesFromJevAnswers(smeared, items.slice(0, 1), 5)[0]).toMatchObject({
      segs: [],
      wholeDaf: true,
      confidence: 0.9,
    });
  });

  it('a confident segment beats a whole-daf lean; a weak one does not', () => {
    const confident: MatchJevAnswers = {
      n0_segment: choiceOf(dist({ 1: 0.7, 2: 0.2 })),
      n0_whole_daf: noulOf(WHOLE_DAF_MIN + 0.05),
    };
    const placed = matchesFromJevAnswers(confident, items.slice(0, 1), 5)[0];
    expect(placed.segs).toEqual([1, 2]);
    expect(placed.wholeDaf).toBeFalsy();
    expect(placed.confidence).toBe(0.9); // the range's mass
    const weak: MatchJevAnswers = {
      n0_segment: choiceOf(dist({ 0: 0.3, 2: 0.25, 4: 0.25 })),
      n0_whole_daf: noulOf(WHOLE_DAF_MIN + 0.05),
    };
    expect(matchesFromJevAnswers(weak, items.slice(0, 1), 5)[0]).toMatchObject({
      segs: [],
      wholeDaf: true,
    });
  });

  it('keeps a low-mass placement with its low confidence (callers floor it)', () => {
    const answers: MatchJevAnswers = {
      n0_segment: choiceOf(dist({ 0: 0.3, 2: 0.3, 4: 0.4 })),
      n0_whole_daf: noulOf(0.2),
    };
    const [m] = matchesFromJevAnswers(answers, items.slice(0, 1), 5);
    expect(m.segs).toEqual([4]);
    expect(m.confidence).toBe(0.4);
  });

  it('skips a note whose answers are missing or mistyped', () => {
    const answers: MatchJevAnswers = {
      n0_segment: noulOf(0.9), // wrong type
      n0_whole_daf: noulOf(0.1),
    };
    expect(matchesFromJevAnswers(answers, items, 5)).toEqual([]);
  });
});
