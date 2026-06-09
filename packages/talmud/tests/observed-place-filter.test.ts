import { describe, expect, it } from 'vitest';
import { isRealPlace } from '../src/worker/unknown-registry';

// Regression guard for the `places` mark over-extracting people/peoples as
// locations. On rabbi-heavy dafim the LLM tagged every `רב X` as a Bavel city,
// every `רבי X` as an Israel city, and ethnonyms (ארמאי / כותי) as regions.
// `isRealPlace` is the deterministic net that keeps those out of the
// observed-place backlog (and hides ones already recorded). See the
// `PLACES_SYSTEM_PROMPT` rules in src/worker/code-marks.ts.

describe('isRealPlace — rejects people misclassified as places', () => {
  // [nameHe, nameEn] pairs taken verbatim from the polluted backlog.
  const people: Array<[string, string]> = [
    ['דרו בר פפא', 'Daru bar Pappa'],
    ['מר בריה דרבינא', 'Mar bar Ravina'],
    ['רבי מאיר', 'Rabbi Meir'],
    ['רבי יהודה', 'Rabbi Yehuda'],
    ['רבי יוחנן', 'Rabbi Yochanan'],
    ['רב אדא בר אהבה', 'Rav Adda bar Ahava'],
    ['רב אחא בר יעקב', "Rav Aha bar Ya'akov"],
    ['רב אשי', 'Rav Ashi'],
    ['רב חיננא בריה דרבא מפשרניא', 'Rav Hinnana bar Rava of Pashrunya'],
    ['רב חסדא', 'Rav Hisda'],
    ['רב הונא', 'Rav Huna'],
    ['רב נחמן', 'Rav Nahman'],
    ['רב סמא', 'Rav Samma'],
    ['רב ירמיה מדפתי', 'Rav Yirmeya of Difti'],
    ['רב יוסף', 'Rav Yosef'],
    ['רבינא', 'Ravina'], // solo amora name, no title token
    ['אביי', 'Abaye'],
    ['רבא', 'Rava'],
  ];

  it.each(people)('drops person %s / %s', (nameHe, name) => {
    expect(isRealPlace(name, nameHe)).toBe(false);
  });

  it('drops a person identified by the Hebrew name alone', () => {
    expect(isRealPlace(undefined, 'רב אשי')).toBe(false);
  });

  it('drops a person identified by the English name alone', () => {
    expect(isRealPlace('Rav Ashi', undefined)).toBe(false);
  });
});

describe('isRealPlace — rejects peoples / ethnonyms', () => {
  const peoples: Array<[string, string]> = [
    ['ארמאי', 'Aramean'],
    ['כותי', 'Samaritan'],
    ['כותים', 'Cutheans'],
    ['נכרי', 'Gentile'],
    ['גוי', 'Gentile'],
  ];

  it.each(peoples)('drops people %s / %s', (nameHe, name) => {
    expect(isRealPlace(name, nameHe)).toBe(false);
  });
});

describe('isRealPlace — keeps genuine geography (no false positives)', () => {
  const places: Array<[string, string]> = [
    ['דפתי', 'Difti'], // a real Bavel city — a rabbi (Rav Yirmeya) is named after it
    ['סורא', 'Sura'],
    ['פומבדיתא', 'Pumbedita'],
    ['נהרדעא', 'Nehardea'],
    ['מתא מחסיא', 'Mata Mehasya'],
    ['טבריה', 'Tiberias'], // contains the substring "בריה" (son of) — must NOT trip the patronymic guard
    ['בני ברק', 'Bnei Brak'], // contains "בר" — must NOT trip the patronymic guard
    ['ציפורי', 'Sepphoris'],
    ['קיסרי', 'Caesarea'],
    ['לוד', 'Lod'],
    ['בבל', 'Bavel'],
    ['ארץ ישראל', 'Eretz Yisrael'],
    ['ירושלים', 'Jerusalem'],
    ['רומי', 'Rome'],
    ['מצרים', 'Egypt'],
    ['ארם', 'Aram'], // the LAND (vs. the people ארמאי, which is rejected above)
  ];

  it.each(places)('keeps place %s / %s', (nameHe, name) => {
    expect(isRealPlace(name, nameHe)).toBe(true);
  });
});
