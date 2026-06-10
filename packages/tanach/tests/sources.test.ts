import { describe, expect, it } from 'vitest';
import { GEMARA_MIN, MIDRASH_MIN, verseKinds } from '../src/lib/sources';

const verse = (over: Partial<Parameters<typeof verseKinds>[0]>) => ({
  verse: 1,
  rishonim: 0,
  rich: false,
  gemara: 0,
  midrash: 0,
  ...over,
});

describe('verseKinds', () => {
  it('gives nothing for a bare verse', () => {
    expect(verseKinds(verse({}))).toEqual([]);
  });

  it('flags rishonim on rich, regardless of count', () => {
    expect(verseKinds(verse({ rich: true }))).toEqual(['rishonim']);
    expect(verseKinds(verse({ rishonim: 7, rich: false }))).toEqual([]);
  });

  it('applies the gemara and midrash thresholds exactly', () => {
    expect(verseKinds(verse({ gemara: GEMARA_MIN - 1 }))).toEqual([]);
    expect(verseKinds(verse({ gemara: GEMARA_MIN }))).toEqual(['gemara']);
    expect(verseKinds(verse({ midrash: MIDRASH_MIN - 1 }))).toEqual([]);
    expect(verseKinds(verse({ midrash: MIDRASH_MIN }))).toEqual(['midrash']);
  });

  it('keeps display order rishonim, gemara, midrash', () => {
    expect(verseKinds(verse({ rich: true, gemara: 9, midrash: 9 }))).toEqual([
      'rishonim',
      'gemara',
      'midrash',
    ]);
  });
});
