import { describe, expect, it } from 'vitest';
import {
  type Anchor,
  anchorKey,
  comparePrecision,
  isRange,
  normalizeAnchor,
  pointsOf,
  precisionRank,
} from '../src/model/anchor.ts';

const seg = (n: number) => ({ path: ['Berakhot', '2a', n] });

describe('anchorKey', () => {
  it('is stable across span emission order', () => {
    const a: Anchor = { spine: 'bavli', span: [seg(3), seg(1)], precision: 'segment' };
    const b: Anchor = { spine: 'bavli', span: [seg(1), seg(3)], precision: 'segment' };
    expect(anchorKey(a)).toBe(anchorKey(b));
  });

  it('ignores excerpt (display data) but not tokens (location)', () => {
    const base: Anchor = {
      spine: 'bavli',
      span: [{ path: ['Berakhot', '2a', 0], tokens: [2, 5] }],
      precision: 'token',
    };
    const withExcerpt: Anchor = {
      ...base,
      span: [{ path: ['Berakhot', '2a', 0], tokens: [2, 5], excerpt: 'מאימתי' }],
    };
    const otherTokens: Anchor = {
      ...base,
      span: [{ path: ['Berakhot', '2a', 0], tokens: [6, 9] }],
    };
    expect(anchorKey(withExcerpt)).toBe(anchorKey(base));
    expect(anchorKey(otherTokens)).not.toBe(anchorKey(base));
  });

  it('distinguishes spine, precision, and stringy-vs-numeric path parts', () => {
    const a: Anchor = { spine: 'bavli', span: [seg(2)], precision: 'segment' };
    expect(anchorKey({ ...a, spine: 'rashi' })).not.toBe(anchorKey(a));
    expect(anchorKey({ ...a, precision: 'unit' })).not.toBe(anchorKey(a));
    const stringy: Anchor = {
      spine: 'bavli',
      span: [{ path: ['Berakhot', '2a', '2'] }],
      precision: 'segment',
    };
    expect(anchorKey(stringy)).not.toBe(anchorKey(a));
  });
});

describe('normalizeAnchor', () => {
  it('dedupes and sorts deterministically', () => {
    const a: Anchor = {
      spine: 'bavli',
      span: [seg(4), seg(1), seg(4), { start: seg(2), end: seg(3) }],
      precision: 'segment',
    };
    const n1 = normalizeAnchor(a);
    const n2 = normalizeAnchor({ ...a, span: [...a.span].reverse() });
    expect(n1.span).toEqual(n2.span);
    expect(n1.span).toHaveLength(3);
    expect(normalizeAnchor(n1)).toEqual(n1);
  });

  it('does not mutate the input', () => {
    const span = [seg(2), seg(1)];
    const a: Anchor = { spine: 'bavli', span, precision: 'segment' };
    normalizeAnchor(a);
    expect(a.span).toBe(span);
    expect(span[0]).toEqual(seg(2));
  });
});

describe('precisionRank / comparePrecision', () => {
  it('orders token > segment > division > unit > work > external', () => {
    expect(precisionRank('token')).toBe(5);
    expect(precisionRank('segment')).toBe(4);
    expect(precisionRank('division')).toBe(3);
    expect(precisionRank('unit')).toBe(2);
    expect(precisionRank('work')).toBe(1);
    expect(precisionRank('external')).toBe(0);
    expect(comparePrecision('token', 'segment')).toBeGreaterThan(0);
    expect(comparePrecision('unit', 'segment')).toBeLessThan(0);
    expect(comparePrecision('division', 'division')).toBe(0);
  });
});

describe('isRange / pointsOf', () => {
  it('isRange discriminates points from ranges', () => {
    expect(isRange(seg(1))).toBe(false);
    expect(isRange({ start: seg(1), end: seg(2) })).toBe(true);
  });

  it('expands numeric same-parent ranges', () => {
    expect(pointsOf([{ start: seg(2), end: seg(5) }])).toEqual([seg(2), seg(3), seg(4), seg(5)]);
  });

  it('passes points through and keeps endpoints for non-expandable ranges', () => {
    const crossDaf = {
      start: { path: ['Berakhot', '2a', 9] },
      end: { path: ['Berakhot', '2b', 1] },
    };
    expect(pointsOf([seg(0), crossDaf])).toEqual([seg(0), crossDaf.start, crossDaf.end]);
    const stringLeaf = {
      start: { path: ['Genesis', '1'] },
      end: { path: ['Genesis', '3'] },
    };
    expect(pointsOf([stringLeaf])).toEqual([stringLeaf.start, stringLeaf.end]);
  });

  it('is bounded: a pathologically wide range yields its endpoints', () => {
    const wide = {
      start: { path: ['Berakhot', '2a', 0] },
      end: { path: ['Berakhot', '2a', 1_000_000] },
    };
    expect(pointsOf([wide])).toEqual([wide.start, wide.end]);
  });

  it('the bound counts points inclusively (0..9999 expands; 0..10000 does not)', () => {
    const atCap = {
      start: { path: ['Berakhot', '2a', 0] },
      end: { path: ['Berakhot', '2a', 9_999] },
    };
    expect(pointsOf([atCap])).toHaveLength(10_000);
    const overCap = {
      start: { path: ['Berakhot', '2a', 0] },
      end: { path: ['Berakhot', '2a', 10_000] },
    };
    expect(pointsOf([overCap])).toEqual([overCap.start, overCap.end]);
  });

  it('never expands token-bearing ranges (synthesized points would drop the tokens)', () => {
    const tokened = {
      start: { path: ['Berakhot', '2a', 2], tokens: [0, 3] as [number, number] },
      end: { path: ['Berakhot', '2a', 4] },
    };
    expect(pointsOf([tokened])).toEqual([tokened.start, tokened.end]);
  });
});
