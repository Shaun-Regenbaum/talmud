import { describe, it, expect } from 'vitest';
import { abbreviationMatches } from '../src/client/injectSegmentMarkers';

// abbreviationMatches(hbRaw, sefWords, sj) returns how many Sefaria words at
// index `sj` a single HebrewBooks abbreviation token expands to (0 = no match).
// The aligner uses it to anchor and consume Sefaria segments against the daf.

describe('abbreviationMatches — חכ"א / וחכ"א (the Sages say)', () => {
  // Regression: Chullin 26b segment #5 ("וחכמים אומרים קטנה מבת ג' שנים…")
  // never anchored because the generic acronym matcher caps each Sefaria word
  // at 2 acronym letters, but חכמים supplies 3 (ח,כ + the leading ו), so it
  // couldn't split וחכא. The segment showed as "not aligned".
  it('expands וחכ"א to וחכמים אומרים (2 words)', () => {
    expect(abbreviationMatches('וחכ"א', ['וחכמים', 'אומרים', 'קטנה'], 0)).toBe(2);
  });

  it('expands the gershayim form וחכ״א as well', () => {
    expect(abbreviationMatches('וחכ״א', ['וחכמים', 'אומרים'], 0)).toBe(2);
  });

  it('expands חכ"א to חכמים אומרים (2 words)', () => {
    expect(abbreviationMatches('חכ"א', ['חכמים', 'אומרים'], 0)).toBe(2);
  });

  it('matches against Sefaria tokens carrying nikkud', () => {
    expect(abbreviationMatches('וחכ"א', ['וַחֲכָמִים', 'אוֹמְרִים'], 0)).toBe(2);
  });

  it('returns 0 when the following words are not חכמים/אומרים', () => {
    expect(abbreviationMatches('וחכ"א', ['רבי', 'מאיר'], 0)).toBe(0);
  });

  it('does not require the leading ו for חכ"א', () => {
    // וחכ"א must NOT match a bare חכמים (the ו prefix must be present).
    expect(abbreviationMatches('וחכ"א', ['חכמים', 'אומרים'], 0)).toBe(0);
    expect(abbreviationMatches('חכ"א', ['וחכמים', 'אומרים'], 0)).toBe(0);
  });
});

describe('abbreviationMatches — gematria numerals', () => {
  // Regression: HebrewBooks writes small numbers as a letter + geresh (ג׳),
  // Sefaria spells them out (שָׁלֹשׁ), so "מבת ג׳ שנים" didn't align against
  // "מבת שלש שנים". The numeral now matches the next Sefaria word against the
  // number's spellings (gender + construct variants).
  it("ג' → three, matching שלש / שלשה / שלושה / שלשת", () => {
    for (const w of ['שָׁלֹשׁ', 'שְׁלֹשָׁה', 'שלושה', 'שְׁלֹשֶׁת']) {
      expect(abbreviationMatches("ג'", [w, 'שנים'], 0)).toBe(1);
    }
  });

  it("ב' → two, matching the construct שתי and absolute שנים", () => {
    expect(abbreviationMatches("ב'", ['שְׁתֵּי', 'שערות'], 0)).toBe(1);
    expect(abbreviationMatches("ב'", ['שְׁנַיִם'], 0)).toBe(1);
  });

  it('accepts the Hebrew geresh ׳ as well as ASCII apostrophe', () => {
    expect(abbreviationMatches('ה׳', ['חֲמִשָּׁה'], 0)).toBe(1);
  });

  it("maps tens and hundreds (כ' → twenty, ק' → hundred)", () => {
    expect(abbreviationMatches("כ'", ['עשרים'], 0)).toBe(1);
    expect(abbreviationMatches("ק'", ['מאה'], 0)).toBe(1);
  });

  it('returns 0 when the next word is not that number (falls through safely)', () => {
    // ג׳ followed by a non-number word: no bogus consumption.
    expect(abbreviationMatches("ג'", ['רבי', 'יהודה'], 0)).toBe(0);
    // ה׳ as the Divine name before אלהינו must NOT be read as "five".
    expect(abbreviationMatches("ה'", ['אלהינו'], 0)).toBe(0);
  });

  it('does not treat a plain (geresh-less) letter as a numeral', () => {
    expect(abbreviationMatches('ג', ['שלש'], 0)).toBe(0);
  });
});

describe('abbreviationMatches — existing expansions still work', () => {
  it('ר\' → רבי (1 word)', () => {
    expect(abbreviationMatches("ר'", ['רבי', 'יהודה'], 0)).toBe(1);
  });
  it('א"ר → אמר רבי (2 words)', () => {
    expect(abbreviationMatches('א"ר', ['אמר', 'רבי'], 0)).toBe(2);
  });
  it('גמ\' → גמרא (1 word)', () => {
    expect(abbreviationMatches("גמ'", ['גמרא'], 0)).toBe(1);
  });
  it('מתני\' → מתני (Sefaria\'s מַתְנִי׳ form, 1 word)', () => {
    expect(abbreviationMatches("מתני'", ['מַתְנִי׳'], 0)).toBe(1);
  });
  it('a plain non-abbreviation token returns 0', () => {
    expect(abbreviationMatches('קטנה', ['קטנה'], 0)).toBe(0);
  });
});
