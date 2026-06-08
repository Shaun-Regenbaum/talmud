import { describe, it, expect } from 'vitest';
import { expandAbbreviations } from '../src/worker/index';

// Each case is [input, expected]. Add new cases whenever a daf surfaces an
// abbreviation we mishandled.
const UNAMBIGUOUS: Array<[string, string]> = [
  // Generic title expansions.
  ['א"ר יוסי אמר',         'רבי יוסי אמר'],
  ['א״ר יוסי אמר',         'רבי יוסי אמר'],       // gershayim variant
  ['אמר ר\' יהושע',        'אמר רבי יהושע'],
  ['אמר ר׳ יהושע',         'אמר רבי יהושע'],       // hebrew geresh

  // Unambiguous collapsed forms (whole-word only).
  ['דאמר אר"י',            'דאמר אמר רבי יוחנן'],
  ['אמר אר"ל',             'אמר אמר ריש לקיש'],
  ['תניא אר"ז',            'תניא אמר רבי זירא'],
  ['אמר ריב"ל',            'אמר רבי יהושע בן לוי'],
  ['דברי רשב"י',           'דברי רבי שמעון בר יוחאי'],
];

const CONTEXTUAL_RABBI_MEIR: Array<[string, string]> = [
  // ר"מ only expands in Rabbi-Meir-dominant phrases.
  ['דברי ר"מ וחכמים',      'דברי רבי מאיר וחכמים'],
  ['לדברי ר"מ',            'לדברי רבי מאיר'],
  ['אמר ר"מ',              'אמר רבי מאיר'],
  ['ואמר ר"מ',             'ואמר רבי מאיר'],
  ['ר"מ אומר',             'רבי מאיר אומר'],
  ['ר"מ וחכמים',           'רבי מאיר וחכמים'],
];

const CONTEXTUAL_NO_EXPAND: Array<[string, string]> = [
  // Bare ר"מ in other contexts should NOT expand (could mean something else
  // in post-Talmudic text). Kept literally.
  ['ר"מ ללמד',             'ר"מ ללמד'],
  ['בענין ר"מ',            'בענין ר"מ'],
  // Truly ambiguous abbreviations we never expand.
  ['אמר ר"י',              'אמר ר"י'],
  ['אמר ר"א',              'אמר ר"א'],
  ['אמר ר"ש',              'אמר ר"ש'],
];

describe('expandAbbreviations — unambiguous', () => {
  for (const [input, expected] of UNAMBIGUOUS) {
    it(`"${input}" → "${expected}"`, () => {
      expect(expandAbbreviations(input)).toBe(expected);
    });
  }
});

describe('expandAbbreviations — Rabbi Meir in context', () => {
  for (const [input, expected] of CONTEXTUAL_RABBI_MEIR) {
    it(`"${input}" → "${expected}"`, () => {
      expect(expandAbbreviations(input)).toBe(expected);
    });
  }
});

describe('expandAbbreviations — ambiguous, leave alone', () => {
  for (const [input, expected] of CONTEXTUAL_NO_EXPAND) {
    it(`"${input}" stays "${expected}"`, () => {
      expect(expandAbbreviations(input)).toBe(expected);
    });
  }
});
