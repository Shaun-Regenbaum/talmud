/**
 * Contract tests for the shared verbatim-excerpt matcher (src/lib/place/verbatim.ts).
 * The golden-anchors suite proves "matches production output on real dapim";
 * THIS suite locks the matcher's behavior on constructed inputs so a future
 * edit can't silently change normalization, prefix-fallback, token offsets,
 * matchLen semantics, or last-occurrence handling.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeHebrew,
  buildVerbatimGrid,
  prefixTries,
  findExcerpt,
} from '../../src/lib/place/verbatim';

describe('normalizeHebrew', () => {
  it('strips nikud + cantillation', () => {
    expect(normalizeHebrew('בְּרֵאשִׁית')).toBe('בראשית');
    expect(normalizeHebrew('אָמַר רָבָא')).toBe('אמר רבא');
  });
  it('strips gershayim, quotes, and punctuation', () => {
    expect(normalizeHebrew('רש״י')).toBe('רשי');
    expect(normalizeHebrew('״כְּתֹבוּ גֵּט״')).toBe('כתבו גט');
    expect(normalizeHebrew('הלכה, כרבי: יהודה')).toBe('הלכה כרבי יהודה');
  });
  it('strips bidi / zero-width controls', () => {
    expect(normalizeHebrew('אמר​ רבא‏')).toBe('אמר רבא');
    expect(normalizeHebrew('﻿תנו רבנן')).toBe('תנו רבנן');
  });
  it('collapses whitespace and trims', () => {
    expect(normalizeHebrew('  אמר   רבא \n הלכה ')).toBe('אמר רבא הלכה');
  });
});

describe('prefixTries', () => {
  it('returns the full phrase only for <=2 words', () => {
    expect(prefixTries(['a', 'b'])).toEqual([['a', 'b']]);
  });
  it('adds 3- then 2-word prefixes for a 3-word phrase', () => {
    expect(prefixTries(['a', 'b', 'c'])).toEqual([['a', 'b', 'c'], ['a', 'b']]);
  });
  it('adds 4,3,2 prefixes for a 6-word phrase (skips 5)', () => {
    const ex = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(prefixTries(ex)).toEqual([ex, ['a', 'b', 'c', 'd'], ['a', 'b', 'c'], ['a', 'b']]);
  });
});

describe('findExcerpt', () => {
  const segs = [
    'אמר רבא הלכה כרבי יהודה',       // seg 0  (words 0..4)
    'תנו רבנן שלשה דברים אמר רבא',   // seg 1  ("אמר רבא" recurs here at tok 4)
    'מאי טעמא דרבי יהודה',           // seg 2
  ];
  const grid = buildVerbatimGrid(segs);

  it('finds an exact phrase with its word offset', () => {
    expect(findExcerpt(grid, 'הלכה כרבי יהודה', 0, 2)).toEqual({ seg: 0, tok: 2, matchLen: 3 });
  });

  it('matches despite nikud on the needle', () => {
    expect(findExcerpt(grid, 'אָמַר רָבָא', 0, 2)).toEqual({ seg: 0, tok: 0, matchLen: 2 });
  });

  it('rejects 1-word needles (too ambiguous) and returns null', () => {
    expect(findExcerpt(grid, 'רבא', 0, 2)).toBeNull();
  });

  it('returns null when absent', () => {
    expect(findExcerpt(grid, 'לא קיים כלל בדף', 0, 2)).toBeNull();
  });

  it('honors the segment range bounds', () => {
    // "תנו רבנן" lives in seg 1; searching only seg 0 finds nothing.
    expect(findExcerpt(grid, 'תנו רבנן', 0, 0)).toBeNull();
    expect(findExcerpt(grid, 'תנו רבנן', 1, 2)).toEqual({ seg: 1, tok: 0, matchLen: 2 });
  });

  it('matchLen defaults to the matched-prefix length', () => {
    // Full 5-word phrase present → matchLen 5.
    expect(findExcerpt(grid, 'אמר רבא הלכה כרבי יהודה', 0, 2))
      .toEqual({ seg: 0, tok: 0, matchLen: 5 });
  });

  it('falls back to a shorter prefix when the full phrase is not verbatim', () => {
    // 6-word excerpt; only the first 2 words match the daf → matchLen 2 (prefix).
    expect(findExcerpt(grid, 'אמר רבא קפץ נפל רץ הלך', 0, 2))
      .toEqual({ seg: 0, tok: 0, matchLen: 2 });
  });

  it('fullMatchLen returns the whole excerpt word count regardless of matched prefix', () => {
    expect(findExcerpt(grid, 'אמר רבא קפץ נפל רץ הלך', 0, 2, { fullMatchLen: true }))
      .toEqual({ seg: 0, tok: 0, matchLen: 6 });
  });

  it('first vs last occurrence of a repeated phrase', () => {
    // "אמר רבא" appears in seg 0 (tok 0) and seg 1 (tok 4).
    expect(findExcerpt(grid, 'אמר רבא', 0, 2)).toEqual({ seg: 0, tok: 0, matchLen: 2 });
    expect(findExcerpt(grid, 'אמר רבא', 0, 2, { last: true })).toEqual({ seg: 1, tok: 4, matchLen: 2 });
  });
});
