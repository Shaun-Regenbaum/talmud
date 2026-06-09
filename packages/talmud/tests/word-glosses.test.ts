import { describe, expect, it } from 'vitest';
import { lookupGloss } from '../src/worker/word-glosses';

// ---------------------------------------------------------------------------
// word-glosses — hardcoded gloss dict that short-circuits /api/translate for
// high-frequency Talmudic vocabulary. Regression bar: the small-model failure
// that motivated this (שעות → "watches") must never recur, and dict entries
// must survive nikud-stripping + whitespace normalization on the input side.
// ---------------------------------------------------------------------------

describe('lookupGloss — known-good entries', () => {
  // The motivating bug: שעות is "hours", not "watches".
  it('שעות returns "hours" (the small-model regression bar)', () => {
    expect(lookupGloss('שעות')).toBe('hours');
  });

  it.each([
    ['שעה', 'hour'],
    ['ימים', 'days'],
    ['לילות', 'nights'],
    ['בתים', 'houses'],
    ['נשים', 'women'],
  ])('Hebrew plural %s → %s', (word, gloss) => {
    expect(lookupGloss(word)).toBe(gloss);
  });

  it.each([
    ['רישא', 'first clause'],
    ['סיפא', 'last clause'],
    ['קמא', 'the first [view]'],
    ['בתרא', 'the later [view]'],
  ])('Mishnaic structural %s → %s', (word, gloss) => {
    expect(lookupGloss(word)).toBe(gloss);
  });

  it.each([
    ['מאי', 'what'],
    ['אלא', 'rather'],
    ['ליה', 'to him'],
    ['דאמר', 'who said'],
    ['תניא', 'it was taught (baraita)'],
    ['בשלמא', 'granted'],
  ])('Aramaic discourse marker %s → %s', (word, gloss) => {
    expect(lookupGloss(word)).toBe(gloss);
  });

  it.each([
    ['ת"ר', 'our Rabbis taught'],
    ['קמ"ל', 'it teaches us'],
    ['ש"מ', 'learn from this'],
    ['ק"ו', 'a fortiori'],
  ])('acronym with gershayim %s → %s', (word, gloss) => {
    expect(lookupGloss(word)).toBe(gloss);
  });

  it.each([
    ['תנו רבנן', 'our Rabbis taught'],
    ['תא שמע', 'come and hear'],
    ['קל וחומר', 'a fortiori'],
    ['בני אדם', 'people'],
    ['היכי דמי', 'what are the circumstances'],
  ])('multi-word entry %s → %s', (phrase, gloss) => {
    expect(lookupGloss(phrase)).toBe(gloss);
  });
});

describe('lookupGloss — normalization', () => {
  it('strips nikud (vowel points) before lookup', () => {
    // שָׁעוֹת = שעות with kamatz + shin-dot + holam
    expect(lookupGloss('שָׁעוֹת')).toBe('hours');
  });

  it('strips cantillation marks before lookup', () => {
    // אָמַ֖ר = אמר with patach + meteg + tipcha
    expect(lookupGloss('אָמַ֖ר')).toBe('said');
  });

  it('trims leading/trailing whitespace', () => {
    expect(lookupGloss('  שעות  ')).toBe('hours');
  });

  it('collapses internal whitespace in multi-word keys', () => {
    expect(lookupGloss('תנו   רבנן')).toBe('our Rabbis taught');
  });

  it('strips bidi marks (LRM/RLM) that browsers occasionally inject', () => {
    // Hebrew word wrapped in RLM markers
    expect(lookupGloss('‏שעות‏')).toBe('hours');
  });
});

describe('lookupGloss — misses', () => {
  it('returns null for words not in the dict', () => {
    // Real Hebrew but not in our curated list
    expect(lookupGloss('סנהדרין')).toBeNull();
    expect(lookupGloss('פרושים')).toBeNull();
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(lookupGloss('')).toBeNull();
    expect(lookupGloss('   ')).toBeNull();
  });

  it('returns null for English words (no accidental cross-script matches)', () => {
    expect(lookupGloss('hours')).toBeNull();
    expect(lookupGloss('Mishnah')).toBeNull();
  });

  it('is case-/character-exact (does not partial-match within longer words)', () => {
    // שעות + suffix would not be a valid Hebrew word, but verify lookup
    // doesn't substring-match
    expect(lookupGloss('שעותיים')).toBeNull();
  });
});
