import { describe, expect, it } from 'vitest';
import { isRealPlace, listObservedPlaces, putObservedPlace } from '../src/worker/unknown-registry';

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

describe('isRealPlace — rejects non-geographic referents (institutions / structures / categories)', () => {
  // [nameHe, nameEn] pairs the codex place-research flagged as gazetteer
  // false-positives (Sandbox/2026-06-16-backlog-research/findings.md): study
  // halls, courts, the Exilarch's household, Temple precinct structures, a
  // halachic land *category*, and generic words.
  const nonPlaces: Array<[string, string]> = [
    ['בית המדרש', 'Beit HaMidrash'],
    ['בית מדרש', 'Beit Midrash'],
    ['בי רב', 'Bei Rav'],
    ['בית הכנסת', 'Beit HaKnesset'],
    ['בתי כנסיות', 'Synagogues'],
    ['בית דין', 'Beit Din'],
    ['בית ריש גלותא', "Exilarch's household"],
    ['בית נשיאה', 'House of the Nasi'],
    ['מתיבתא דרקיעא', 'Heavenly study hall'],
    ['בית המקדש', 'Beit HaMikdash'],
    ['מזבח', 'Altar'],
    ['עזרה', 'Azara'],
    ['בית הפרס', 'beit haperas'], // a plowed grave-field: an impurity STATUS, not a town
    ['בית המרחץ', 'Bathhouse'],
    ['כרכים', 'Cities'],
    ['מתא', 'the town'],
    ['מקום', 'a certain place'],
  ];

  it.each(nonPlaces)('drops non-place %s / %s', (nameHe, name) => {
    expect(isRealPlace(name, nameHe)).toBe(false);
  });

  it('matches the Hebrew stop-list EXACTLY — a real town sharing a prefix is kept', () => {
    expect(isRealPlace('Bei Ḥozai', 'בי חוזאי')).toBe(true); // not "בי רב"
    expect(isRealPlace('Mehoza', 'מחוזא')).toBe(true);
    expect(isRealPlace('Mata Mehasya', 'מתא מחסיא')).toBe(true); // not bare "מתא"
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

// Minimal in-memory KVNamespace covering the get/put/list surface the registry
// uses (mirrors observed-concept.test.ts).
function fakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async list({
      prefix = '',
      limit = 1000,
      cursor,
    }: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    } = {}) {
      const all = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const slice = all.slice(start, start + limit);
      const next = start + limit;
      const complete = next >= all.length;
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: complete,
        cursor: complete ? undefined : String(next),
      };
    },
  } as unknown as KVNamespace;
}

describe('putObservedPlace — the filter is enforced at write time', () => {
  it('records a real settlement but never a non-geographic referent', async () => {
    const kv = fakeKV();
    await putObservedPlace(kv, {
      name: 'Hagronya',
      nameHe: 'הגרוניא',
      tractate: 'Bava Batra',
      page: '46a',
    });
    await putObservedPlace(kv, {
      name: 'Beit Din',
      nameHe: 'בית דין',
      tractate: 'Sanhedrin',
      page: '2a',
    });
    await putObservedPlace(kv, {
      name: 'Heavenly study hall',
      nameHe: 'מתיבתא דרקיעא',
      tractate: 'Bava Metzia',
      page: '86a',
    });

    const { sample } = await listObservedPlaces(kv);
    const names = sample.map((p) => p.name);
    expect(names).toContain('Hagronya');
    expect(names).not.toContain('Beit Din');
    expect(names).not.toContain('Heavenly study hall');
  });
});
