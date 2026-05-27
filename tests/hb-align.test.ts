// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildHbWords, locateInHb, normHe, type HbWords } from '../src/client/hbAlign';

describe('normHe', () => {
  it('strips niqqud, folds final letters, drops punctuation', () => {
    expect(normHe('בְּהֵמָה')).toBe('בהמה');
    expect(normHe('רַגְלֶיהָ,')).toBe('רגליה');
    expect(normHe('א"ר')).toBe('אר');
    expect(normHe('שֶׁנֶּחְתְּכוּ ')).toBe('שנחתכו');
    // final mem folded to medial
    expect(normHe('הָאָדָם')).toBe(normHe('האדמ'));
  });
});

describe('buildHbWords (jsdom)', () => {
  const html =
    '<span class="daf-word" data-word-index="0" data-seg="0">בְּהֵמָה</span> ' +
    '<span class="daf-word" data-word-index="1" data-seg="0">שֶׁנֶּחְתְּכוּ</span> ' +
    '<span class="daf-word" data-word-index="2" data-seg="1">רַגְלֶיהָ</span>';
  const hb = buildHbWords(html);
  it('indexes words, segs, and segment ranges', () => {
    expect(hb.norm).toEqual(['בהמה', 'שנחתכו', 'רגליה']);
    expect(hb.wordIndex).toEqual([0, 1, 2]);
    expect(hb.seg).toEqual([0, 0, 1]);
    expect(hb.segRange.get(0)).toEqual({ first: 0, last: 1 });
    expect(hb.segRange.get(1)).toEqual({ first: 2, last: 2 });
  });
});

// Hand-built word stream so locateInHb is tested without a DOM.
function mkHb(words: string[], segs: number[]): HbWords {
  const hb: HbWords = { raw: words, norm: words.map(normHe), wordIndex: words.map((_, i) => i), seg: segs, segRange: new Map() };
  segs.forEach((s, pos) => {
    const e = hb.segRange.get(s);
    if (e) e.last = pos; else hb.segRange.set(s, { first: pos, last: pos });
  });
  return hb;
}

describe('locateInHb', () => {
  const hb = mkHb(
    ['בהמה', 'שנחתכו', 'רגליה', 'מן', 'הארכובה', 'ולמטה', 'כשרה'],
    [0, 0, 0, 1, 1, 1, 1],
  );

  it('finds a multi-word phrase inside its segment window', () => {
    const r = locateInHb(hb, { phrase: 'מן הארכובה', segs: [1] })!;
    expect(r.words).toEqual([3, 4]);
    expect(r.via).toBe('phrase-in-seg');
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it('finds a multi-word phrase anywhere when no segment given', () => {
    const r = locateInHb(hb, { phrase: 'רגליה מן' })!;
    expect(r.words).toEqual([2, 3]);
    expect(r.via).toBe('phrase');
  });

  it('locates a single word only within its segment window', () => {
    const r = locateInHb(hb, { phrase: 'הארכובה', segs: [1] })!;
    expect(r.words).toEqual([4]);
    expect(r.via).toBe('phrase-in-seg');
    // single-word is lower confidence
    expect(r.confidence).toBeLessThan(0.6);
    // …but not without a window (too common to place reliably)
    expect(locateInHb(hb, { phrase: 'הארכובה' })).toBeNull();
  });

  it('falls back to the segment range when the phrase misses', () => {
    const r = locateInHb(hb, { phrase: 'דבר אחר לגמרי', segs: [0] })!;
    expect(r.words).toEqual([0, 1, 2]);
    expect(r.via).toBe('segment');
  });

  it('returns null when nothing is locatable', () => {
    expect(locateInHb(hb, { phrase: 'דבר אחר לגמרי' })).toBeNull();
    expect(locateInHb(hb, {})).toBeNull();
  });
});
