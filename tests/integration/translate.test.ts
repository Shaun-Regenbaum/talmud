import { describe, it, expect } from 'vitest';
import { postJson, BASE_URL } from './helpers';

/**
 * Word-sense disambiguation tests. Each case supplies a word + Hebrew context
 * window and expects the translation to match an acceptance regex that
 * captures the correct sense. Paraphrase-friendly: we assert the meaning
 * landed in the expected family of English renderings, not an exact string.
 *
 * Cases to add: when a translation comes back wrong, paste the word + context
 * here with the acceptance regex. Regressions get caught immediately if the
 * model or prompt shifts.
 */
interface Case {
  name: string;
  word: string;
  tractate: string;
  page: string;
  hebrewBefore?: string;
  hebrewAfter?: string;
  /** Passes when the returned translation matches this regex. */
  acceptable: RegExp;
  /** Fails if it matches this regex — use to rule out known wrong senses. */
  reject?: RegExp;
}

const CASES: Case[] = [
  // --- Unambiguous common words from Berakhot 2a ---
  {
    name: 'שמע in context of Berakhot opening → the Shema prayer',
    word: 'שמע',
    tractate: 'Berakhot',
    page: '2a',
    hebrewBefore: 'מאימתי קורין את',
    hebrewAfter: 'בערבין משעה שהכהנים',
    acceptable: /shema|hear/i,
  },
  {
    name: 'הכהנים → priests',
    word: 'הכהנים',
    tractate: 'Berakhot',
    page: '2a',
    hebrewBefore: 'משעה ש',
    hebrewAfter: 'נכנסים לאכול בתרומתן',
    acceptable: /priest|kohan/i,
  },
  {
    name: 'בתרומתן → terumah / heave-offering',
    word: 'בתרומתן',
    tractate: 'Berakhot',
    page: '2a',
    hebrewBefore: 'נכנסים לאכול',
    hebrewAfter: 'עד סוף האשמורה',
    acceptable: /terumah|teruma|heave|offering|portion/i,
  },
  {
    name: 'האשמורה → watch (night-watch sense, not "Ashmora" transliteration alone)',
    word: 'האשמורה',
    tractate: 'Berakhot',
    page: '2a',
    hebrewBefore: 'עד סוף',
    hebrewAfter: 'הראשונה דברי רבי אליעזר',
    acceptable: /watch|vigil/i,
  },
  {
    name: 'עמוד in "עמוד השחר" → pillar/column of dawn',
    word: 'עמוד',
    tractate: 'Berakhot',
    page: '2a',
    hebrewBefore: 'אומר עד שיעלה',
    hebrewAfter: 'השחר',
    acceptable: /column|pillar|rise|dawn|break/i,  // "column of dawn" or "daybreak" both fine
  },

  // --- Name-preservation: rabbinic names should not be "translated" ---
  {
    name: 'רבי should render as "Rabbi"',
    word: 'רבי',
    tractate: 'Berakhot',
    page: '2a',
    hebrewBefore: 'האשמורה הראשונה דברי',
    hebrewAfter: 'אליעזר וחכמים אומרים',
    acceptable: /rabbi|r\./i,
  },
  {
    name: 'רבן גמליאל → Rabban Gamliel (proper noun)',
    word: 'גמליאל',
    tractate: 'Berakhot',
    page: '2a',
    hebrewBefore: 'רבן',
    hebrewAfter: 'אומר עד שיעלה',
    acceptable: /gamliel|gamaliel/i,
  },
];

// Gate: we only run integration when a TALMUD_URL is set OR a dev worker is
// up. vitest will still attempt the tests; if the network is unreachable,
// errors surface immediately.
describe(`integration: translate (against ${BASE_URL})`, () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const body = {
        word: c.word,
        tractate: c.tractate,
        page: c.page,
        hebrewBefore: c.hebrewBefore ?? '',
        hebrewAfter: c.hebrewAfter ?? '',
      };
      const res = await postJson<{ translation?: string; error?: string }>(
        '/api/translate',
        body,
      );
      expect(res.error, `translate error: ${res.error}`).toBeUndefined();
      expect(res.translation, 'empty translation').toBeTruthy();
      const t = String(res.translation);
      expect(t, `"${t}" did not match ${c.acceptable}`).toMatch(c.acceptable);
      if (c.reject) {
        expect(t, `"${t}" matched forbidden ${c.reject}`).not.toMatch(c.reject);
      }
    }, 60000);
  }
});
