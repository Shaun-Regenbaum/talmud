/**
 * reanchorNarrative — anchors argument.narrative beats to their segment via the
 * verbatim `excerpt`, making the story beats a clickable narrative move layer.
 * Same single-segment, whole-daf resolution as rabbi-evidence.
 */
import { describe, it, expect } from 'vitest';
import { reanchorNarrative } from '../../src/lib/place/reanchor';

const SEGS = [
  'אמר רבא אמר רב נחמן',
  'תנו רבנן המביא גט ממדינת הים',
  'רבי יוחנן ורבי שמעון בן לקיש',
];
const run = (beats: unknown[]) => reanchorNarrative({ summary: 's', actors: [], beats }, SEGS) as { beats: Record<string, unknown>[] };

describe('reanchorNarrative', () => {
  it('anchors each beat to the segment of its verbatim excerpt', () => {
    const { beats } = run([
      { n: 1, kind: 'scene', actor: 'A', action: 'x', excerpt: 'אמר רבא' },
      { n: 2, kind: 'dialogue', actor: 'B', action: 'y', excerpt: 'רבי יוחנן ורבי שמעון' },
    ]);
    expect(beats[0]).toMatchObject({ startSegIdx: 0, endSegIdx: 0, tokenStart: 0, tokenEnd: 1 });
    expect(beats[1]).toMatchObject({ startSegIdx: 2, endSegIdx: 2, tokenStart: 0, tokenEnd: 3 });
  });

  it('ignores nikud/punctuation and a non-zero token offset', () => {
    const { beats } = run([{ n: 1, kind: 'turn', actor: 'A', action: 'x', excerpt: 'אָמַר, רַב נַחְמָן' }]);
    expect(beats[0]).toMatchObject({ startSegIdx: 0, tokenStart: 2 }); // "אמר רב נחמן" at words 2..4
  });

  it('leaves a beat with no/short/unmatched excerpt unanchored', () => {
    const { beats } = run([
      { n: 1, kind: 'scene', actor: 'A', action: 'x' },                       // no excerpt
      { n: 2, kind: 'action', actor: 'A', action: 'y', excerpt: 'רבנן' },     // 1 word
      { n: 3, kind: 'action', actor: 'A', action: 'z', excerpt: 'מילה שאיננה' }, // no match
    ]);
    for (const b of beats) expect(b.startSegIdx).toBeUndefined();
  });

  it('is a no-op without a beats array or segments', () => {
    expect(reanchorNarrative({ foo: 1 }, SEGS)).toEqual({ foo: 1 });
    const same = { beats: [{ excerpt: 'תנו רבנן' }] };
    expect(reanchorNarrative(same, [])).toBe(same);
    expect((same.beats[0] as Record<string, unknown>).startSegIdx).toBeUndefined();
  });
});
