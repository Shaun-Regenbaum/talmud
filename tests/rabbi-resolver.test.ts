import { describe, it, expect } from 'vitest';
import { resolveRabbi, resolveRabbiByHe, resolveRabbiByName } from '../src/worker/index';

// Cases are laid out as [name, nameHe, expectedSlug, note?]. Add new ones
// below whenever you find a case the resolver gets wrong. Empty string for
// nameHe skips Hebrew-first matching.
const CASES: Array<[string, string, string | null, string?]> = [
  // --- Bug A: Gemma confuses Hebrew רבא (Rava) with רבה (Rabbah b. Nachmani).
  //          English name is Rabbah but Hebrew says Rava. Hebrew wins.
  ['Rabbah [b. Nachmani]', 'רבא', 'rava',
    'Gemma-emitted English was wrong — Hebrew is authoritative'],
  ['Rabbah [b. Nachmani]', 'רבה', 'rabbah-b-nachmani'],

  // --- Bug B: Rabbah bar Rav Huna was slugging null via patronymic fallback
  //          stripping to bare "Rabbah" which aliased to Rabbah b. Nachmani.
  ['Rabbah bar Rav Huna', 'רבה בר רב הונא', 'rabbah-b-rav-huna',
    'Patronymic stripping to bare "Rabbah" is blocked'],
  ['Rabbah b. Rav Huna',  'רבה בר רב הונא', 'rabbah-b-rav-huna'],

  // --- Regressions: common rabbis should still resolve via Hebrew.
  ['Rabbi Eliezer b. Hyrcanus', 'רבי אליעזר', 'rabbi-eliezer-b-hyrcanus'],
  ['Rabbi Yochanan b. Napacha', 'רבי יוחנן',  'rabbi-yochanan-b-napacha'],
  ['Rav Huna',                  'רב הונא',    'rav-huna'],
  ['Rav',                       'רב',         'rav'],
  ['Hillel',                    'הלל',        'hillel'],
  ['Shammai',                   'שמאי',       'shammai'],
  ['Rava',                      'רבא',        'rava'],

  // --- Patronymic fallback (English-only). OK when stripped form is ≥2 tokens
  //     so it doesn't collapse onto a bare-title ambiguous alias.
  ['Rabbi Eliezer b. Yose', '', 'rabbi-eliezer-b-hyrcanus',
    'Strip "b. Yose" → "Rabbi Eliezer" (2 tokens) → rabbi-eliezer-b-hyrcanus'],

  // --- The Hebrew-first path should win even when English is correct. No
  //     difference in outcome, but exercises the resolution order.
  ['Rabbi Zeira', 'רבי זירא', 'rav-zera'],

  // --- Tannaim: most common attribution names in the Mishnah.
  ['Rabbi Akiva',                  'רבי עקיבא',        'rabbi-akiva'],
  ['Rabbi Meir',                   'רבי מאיר',         'rabbi-meir'],
  ['Rabbi Yehudah b. Ilai',        'רבי יהודה',        'rabbi-yehudah-b-ilai'],
  ['Rabbi Yose b. Chalafta',       'רבי יוסי',         'rabbi-yose-b-chalafta'],
  ['Rabbi Shimon b. Yochai',       'רבי שמעון',        'shimon-bar-yochai'],
  ['Rabbi Yehudah HaNasi',         'רבי',              'rabi'],                // "Rebbi"
  ['Rabban Gamliel of Yavneh',     'רבן גמליאל דיבנה', 'rabban-gamliel'],
  ['Rabban Shimon b. Gamliel',     'רבן שמעון בן גמליאל (2)', 'rabban-shimon-b-gamliel-(ii)'],

  // --- Early EY Amoraim — Tiberian + Caesarea schools.
  ['Rabbi Yochanan',               'רבי יוחנן',        'rabbi-yochanan-b-napacha'],
  ['Reish Lakish',                 'רבי שמעון בן לקיש', 'rabbi-shimon-b-lakish'], // canonical Hebrew
  ['Rabbi Elazar b. Pedat',        'רבי אלעזר',        'rabbi-elazar-b-pedat'],  // aliasIndex ambiguity checkpoint
  ['Rabbi Abbahu',                 'רבי אבהו',         'rabbi-abahu'],
  ['Rabbi Yehoshua b. Levi',       'רבי יהושע בן לוי',  'rabbi-yehoshua-b-levi'],

  // --- Babylonian Amoraim — Sura, Pumbedita, Nehardea.
  // "Rav" alone in the daf text — dataset canonicalHe is `רב (שם אמורא)`
  // which we strip of the disambiguating parenthetical during indexing.
  ['Rav (Abba Aricha)',            'רב',               'rav'],
  ['Rav Abba Aricha',              'רב (שם אמורא)',     'rav'],            // with paren in input too
  ['Shmuel',                       'שמואל',            'shmuel-(amora)'],
  ['Rav Huna',                     'רב הונא',          'rav-huna'],
  ['Rav Chisda',                   'רב חסדא',          'rav-chisda'],
  ['Rav Nachman b. Yaakov',        'רב נחמן',          'rav-nachman-b-yaakov'],
  ['Rabbah b. Rav Huna',           'רבה בר רב הונא',   'rabbah-b-rav-huna'],    // Bug B — no bare-Rabbah collapse
  // Note: dataset canonical is "Rav Yosef [b. Chiyya]" (disambiguated).
  // canonicalHe is bare `רב יוסף` so Hebrew-side resolution lands on the right slug.
  ['Rav Yosef',                    'רב יוסף',          'rav-yosef-b-chiyya'],
  ['Abaye',                        'אביי',             'abaye'],
  ['Rava',                         'רבא',              'rava'],                // Bug A inverse — Hebrew distinguishes from רבה
  ['Rav Pappa',                    'רב פפא',           'rav-pappa'],
  ['Rav Ashi',                     'רב אשי',           'rav-ashi'],
  ['Ravina (I)',                   'רבינא',            'ravina-(i)'],

  // --- Movers — should still resolve to their correct slug regardless.
  ['Rav Zeira',                    'רבי זירא',         'rav-zera'],             // bavel→israel
  ['Rabbi Chiyya',                 'רבי חייא',         'rabbi-chiyya'],         // bavel→israel
  ['Rabbah bar bar Chanah',        'רבה בר בר חנה',    'rabbah-bar-bar-chanah'], // triple-word patronymic
  ['Rav Kahana (II)',              'רב כהנא',          'rav-kahana-(ii)'],
];

describe('resolveRabbi (Hebrew-first, English fallback)', () => {
  for (const [name, nameHe, expected, note] of CASES) {
    const desc = `${name.padEnd(28)} + "${nameHe}" → ${expected}${note ? `  (${note})` : ''}`;
    it(desc, () => {
      const hit = resolveRabbi(name, nameHe || null);
      expect(hit?.slug ?? null).toBe(expected);
    });
  }
});

describe('resolveRabbiByHe (Hebrew-only)', () => {
  it('matches canonicalHe exactly', () => {
    expect(resolveRabbiByHe('רבא')?.slug).toBe('rava');
    expect(resolveRabbiByHe('רבה')?.slug).toBe('rabbah-b-nachmani');
    expect(resolveRabbiByHe('רבה בר רב הונא')?.slug).toBe('rabbah-b-rav-huna');
  });

  it('strips nikkud/punctuation before matching', () => {
    expect(resolveRabbiByHe('רבי יוחנן.')?.slug).toBe('rabbi-yochanan-b-napacha');
    expect(resolveRabbiByHe('"רבי אליעזר"')?.slug).toBe('rabbi-eliezer-b-hyrcanus');
  });

  it('returns null for empty or unknown Hebrew', () => {
    expect(resolveRabbiByHe('')).toBeNull();
    expect(resolveRabbiByHe('לא קיים')).toBeNull();
  });
});

describe('resolveRabbiByName — patronymic-fallback safety', () => {
  it('does NOT collapse "Rabbah bar X" to bare "Rabbah"', () => {
    // Bug B precondition: bare "Rabbah" in the aliasIndex points at
    // rabbah-b-nachmani. If the patronymic fallback fired here we would get
    // that wrong slug; instead we return null (Hebrew-first path picks it up
    // in resolveRabbi).
    const hit = resolveRabbiByName('Rabbah bar Rav Huna Something Weird');
    expect(hit).toBeNull();
  });

  it('DOES allow patronymic fallback when stripped form is 2+ tokens', () => {
    const hit = resolveRabbiByName('Rabbi Eliezer b. SomethingElse');
    expect(hit?.slug).toBe('rabbi-eliezer-b-hyrcanus');
  });
});
