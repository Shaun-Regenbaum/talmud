/**
 * reanchorRabbiEvidence — the A1b port of the former inline
 * postProcessRabbiEvidence onto the unified verbatim matcher. Pins the
 * behaviors the old inline code had: whole-daf search, word-aligned hit with
 * token offsets, prefix fallback (matchLen = matched-prefix length), the
 * substring-but-not-word-aligned tok=0 fallback, single-segment anchoring
 * (start === end), 1-word excerpts left unanchored, and non-matching entries
 * preserved untouched.
 */
import { describe, it, expect } from 'vitest';
import { reanchorRabbiEvidence } from '../../src/lib/place/reanchor';

const SEGS = [
  'אמר רבא אמר רב נחמן',          // seg 0 (5 words)
  'תנו רבנן המביא גט ממדינת הים',  // seg 1 (6 words)
  'רבי יוחנן ורבי שמעון בן לקיש',  // seg 2 (6 words)
];

const run = (evidence: unknown[]) => reanchorRabbiEvidence({ evidence }, SEGS) as { evidence: Record<string, unknown>[] };

describe('reanchorRabbiEvidence', () => {
  it('anchors a word-aligned excerpt at the start of a segment', () => {
    const { evidence } = run([{ name: 'A', excerpt: 'תנו רבנן' }]);
    expect(evidence[0]).toMatchObject({ startSegIdx: 1, endSegIdx: 1, tokenStart: 0, tokenEnd: 1 });
  });

  it('anchors a word-aligned excerpt at a non-zero token offset', () => {
    // "אמר רב נחמן" sits at words[2..4] of seg 0.
    const { evidence } = run([{ name: 'C', excerpt: 'אמר רב נחמן' }]);
    expect(evidence[0]).toMatchObject({ startSegIdx: 0, endSegIdx: 0, tokenStart: 2, tokenEnd: 4 });
  });

  it('falls back to a shorter prefix; matchLen is the matched prefix length', () => {
    // Full 6 words not present, but the 4-word prefix "תנו רבנן המביא גט" is.
    const { evidence } = run([{ name: 'F', excerpt: 'תנו רבנן המביא גט אחרת ועוד' }]);
    expect(evidence[0]).toMatchObject({ startSegIdx: 1, endSegIdx: 1, tokenStart: 0, tokenEnd: 3 });
  });

  it('soft-falls back to tok=0 on a substring that is not word-aligned', () => {
    // "בא אמר" is a character substring of "...רבא אמר..." in seg 0 but never
    // word-aligned, so the matcher records the segment with tok=0.
    const { evidence } = run([{ name: 'X', excerpt: 'בא אמר' }]);
    expect(evidence[0]).toMatchObject({ startSegIdx: 0, endSegIdx: 0, tokenStart: 0, tokenEnd: 1 });
  });

  it('leaves a non-matching entry untouched (note/place preserved, no seg fields)', () => {
    const { evidence } = run([{ name: 'D', note: 'student', excerpt: 'מילה שאיננה בכלל' }]);
    expect(evidence[0]).toEqual({ name: 'D', note: 'student', excerpt: 'מילה שאיננה בכלל' });
  });

  it('does not anchor a single-word excerpt (too ambiguous)', () => {
    const { evidence } = run([{ name: 'E', excerpt: 'רבנן' }]);
    expect(evidence[0].startSegIdx).toBeUndefined();
  });

  it('ignores nikud/punctuation when matching', () => {
    const { evidence } = run([{ name: 'G', excerpt: 'תְּנוּ, רַבָּנַן' }]);
    expect(evidence[0]).toMatchObject({ startSegIdx: 1, tokenStart: 0, tokenEnd: 1 });
  });

  it('is a no-op when there is no evidence array or no segments', () => {
    expect(reanchorRabbiEvidence({ foo: 1 }, SEGS)).toEqual({ foo: 1 });
    const same = { evidence: [{ excerpt: 'תנו רבנן' }] };
    expect(reanchorRabbiEvidence(same, [])).toBe(same);
    expect((same.evidence[0] as Record<string, unknown>).startSegIdx).toBeUndefined();
  });
});
