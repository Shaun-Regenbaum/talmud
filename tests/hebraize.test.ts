import { describe, it, expect } from 'vitest';
import { hebraize, stripEchoParens, hebraizeBareNames } from '../src/client/hebraize';

// ---------------------------------------------------------------------------
// stripEchoParens — the sanitizer for "X (X)" outputs the source LLM produces
// when it applies a Form B gloss to a proper noun / bare Hebrew letter that
// has no useful English equivalent. The backref must match character-for-
// character, so legit cross-script glosses (Rabbi Akiva → רבי עקיבא) are
// preserved.
// ---------------------------------------------------------------------------

const ECHO_STRIP: Array<[string, string]> = [
  // Bare Hebrew letter used as a section marker.
  ['the ח׳ (ח׳) section',                         'the ח׳ section'],
  // Rabbi name echo — the original bug report.
  ['disciple of רבי עקיבא (רבי עקיבא), his',      'disciple of רבי עקיבא, his'],
  // Multi-word Hebrew title.
  ['spoken by דוד המלך (דוד המלך), traditionally', 'spoken by דוד המלך, traditionally'],
  // Acronym with gershayim variants — ASCII " and Hebrew ״.
  ['cited by חז"ל (חז"ל) as',                     'cited by חז"ל as'],
  ['cited by חז״ל (חז״ל) as',                     'cited by חז״ל as'],
  // Place names also echo.
  ['at יבנה (יבנה) the council met',              'at יבנה the council met'],
  // English-on-both-sides echoes (rarer but same bug class).
  ['the Mishnah (Mishnah) records',               'the Mishnah records'],
  // Multiple echoes in one string.
  ['רבי עקיבא (רבי עקיבא) taught רבי מאיר (רבי מאיר)', 'רבי עקיבא taught רבי מאיר'],
  // Inside a long sentence (regression for the originally reported passage).
  [
    "falls in the ח׳ (ח׳) section, often cited by חז״ל (חז״ל) as a prooftext",
    "falls in the ח׳ section, often cited by חז״ל as a prooftext",
  ],
  // Shabbat 125b aggadata regression — the hebraize LLM over-translated Form B
  // English glosses back into Hebrew, producing these echoes on the daf:
  //   רבי יהודה הנשיא (Rabbi Yehuda HaNasi) -> רבי יהודה הנשיא (רבי יהודה הנשיא)
  //   concrete מעשה (action)                -> concrete מעשה (מעשה)
  ['involves רבי יהודה הנשיא (רבי יהודה הנשיא), the redactor', 'involves רבי יהודה הנשיא, the redactor'],
  ['the redactor of the משנה (משנה) and',          'the redactor of the משנה and'],
  ['requires a concrete מעשה (מעשה) or mere',      'requires a concrete מעשה or mere'],
  ['community in ארץ ישראל (ארץ ישראל) in the',    'community in ארץ ישראל in the'],
];

describe('stripEchoParens — collapses `X (X)`', () => {
  for (const [input, expected] of ECHO_STRIP) {
    it(`"${input}" → "${expected}"`, () => {
      expect(stripEchoParens(input)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// stripEchoParens — must LEAVE alone anything that's not a true echo.
// These are the false-positive guard cases: legit Form A/B glosses, verse
// citations, dates, English-only asides. Any regression here would silently
// destroy bilingual content.
// ---------------------------------------------------------------------------

const ECHO_PRESERVE: string[] = [
  // Legit Form B: English transliteration followed by Hebrew gloss.
  'Rabbi Akiva (רבי עקיבא) taught',
  'a leading Tanna (תנא) at Yavneh (יבנה)',
  // Legit Form A: Hebrew first, English gloss in parens.
  'invokes a גזירה שווה (verbal analogy from a shared word)',
  // Verse reference in parens — not preceded by the same string.
  "'At midnight I will rise' (תהילים קי״ט:ס״ב)",
  // English aside in parens.
  'the Mishnah (compiled c. 200 CE) records',
  // Year / numeric.
  'in the year 70 CE (after the churban)',
  // Mishneh Torah subheading — not an echo even though both sides have "Hilchot".
  'Mishneh Torah (Hilchot Shabbat 8:1)',
  // English word that happens to repeat — but the parens content equals the
  // PREVIOUS word, not the same one twice in prose.
  'see the see the cat',
  // Parens-only content (no preceding token), should not crash or alter.
  '(תהילים קי״ט:ס״ב) is the source',
];

describe('stripEchoParens — preserves non-echo parens', () => {
  for (const input of ECHO_PRESERVE) {
    it(`leaves "${input}" unchanged`, () => {
      expect(stripEchoParens(input)).toBe(input);
    });
  }
});

// ---------------------------------------------------------------------------
// hebraize Pass 1 — `english (transliteration)` → `english (עברית)`. The
// standard form. Should ONLY swap when the parens content is a known
// transliteration; everything else stays put.
// ---------------------------------------------------------------------------

const PASS1_DICT_SWAP: Array<[string, string]> = [
  // Single-word dict entry.
  ['the dispute hinges on designation (yi\'ud)', 'the dispute hinges on designation (ייעוד)'],
  ['atonement (kaparah) does not delay',         'atonement (כפרה) does not delay'],
  // Multi-word dict entry.
  ['the rule (ve-lo zu bilvad) applies',         'the rule (ולא זו בלבד) applies'],
  // Apostrophe normalization — `ma'aseh` and `maaseh` both map to מעשה.
  ['a story (ma\'aseh) about',                   'a story (מעשה) about'],
  ['a story (maaseh) about',                     'a story (מעשה) about'],
  // Academic transliteration with combining marks — `ḥalavim` normalizes the
  // same as `chalavim`.
  ['the offering (ḥalavim ve-evarim)',           'the offering (חלבים ואיברים)'],
  // Unknown term stays unchanged.
  ['this aside (whatever) is unknown',           'this aside (whatever) is unknown'],
  // Verse refs / dates / non-transliteration parens are left alone.
  ['Mishneh Torah (Hilchot Shabbat 8:1)',        'משנה תורה (Hilchot Shabbat 8:1)'],
  ['compiled (c. 200 CE)',                       'compiled (c. 200 CE)'],
];

describe('hebraize Pass 1 — english (translit) → english (עברית)', () => {
  for (const [input, expected] of PASS1_DICT_SWAP) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// hebraize Pass 2 — inverted form: `translit (english gloss)` →
// `english gloss (עברית)`. Only fires when the bare word IS a known
// transliteration AND the parens content is plain Latin (no Hebrew, no
// digits) — otherwise verse refs and citations would be mangled.
// ---------------------------------------------------------------------------

const PASS2_INVERTED_SWAP: Array<[string, string]> = [
  // Basic inverted swap — known translit outside, English gloss inside.
  ['kushya (a difficulty raised) is resolved',     'a difficulty raised (קושיא) is resolved'],
  // Multi-word translit.
  ['gezera shava (verbal analogy from a shared word) ties them', 'verbal analogy from a shared word (גזרה שוה) ties them'],
  // Hyphenated gloss is fine.
  ['mitzvah (a god-given commandment) here',      'a god-given commandment (מצוה) here'],
];

const PASS2_INVERTED_NOOP: Array<[string, string]> = [
  // Gloss contains a digit — verse ref / page number style, leave alone.
  ['Shabbat (31a) records',     'Shabbat (31a) records'],
  // Word-boundary guard: translit is mid-word, not a standalone term.
  ['xkushya (a difficulty)',    'xkushya (a difficulty)'],
  // Translit not in dict — no swap.
  ['foobar (some gloss)',       'foobar (some gloss)'],
];

// `kushya (קושיא)` is now a Pass3 cascade case rather than a noop: bare-swap
// converts `kushya` → `קושיא`, then echo-strip collapses `קושיא (קושיא)` → `קושיא`.
describe('hebraize — bare-translit followed by its Hebrew form cascades cleanly', () => {
  it('"kushya (קושיא) is resolved" → "קושיא is resolved"', () => {
    expect(hebraize('kushya (קושיא) is resolved')).toBe('קושיא is resolved');
  });
});

describe('hebraize Pass 2 — translit (gloss) → gloss (עברית)', () => {
  for (const [input, expected] of PASS2_INVERTED_SWAP) {
    it(`swaps "${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
  for (const [input, expected] of PASS2_INVERTED_NOOP) {
    it(`leaves "${input}" alone`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// hebraize — the full pipeline. Echo-strip runs after the dict passes, so
// these cases lock down that the dict-pass output still works AND that the
// final string has no echo-parens regardless of which pass produced them.
// ---------------------------------------------------------------------------

const HEBRAIZE_FULL: Array<[string, string]> = [
  // Dict pass — Latin transliteration in parens swapped to Hebrew.
  ['the dispute hinges on designation (yi\'ud)', 'the dispute hinges on designation (ייעוד)'],
  ['atonement (kaparah) does not delay',         'atonement (כפרה) does not delay'],
  // Dict pass + echo strip — if dict promotes a transliteration to Hebrew
  // and that Hebrew matches the preceding token, the echo MUST collapse.
  // (Rare but possible if the LLM emits the Hebrew before the parens too.)
  ['the מצוה (mitzvah) of the priest', 'the מצוה of the priest'],
  // Echo-strip on a string with no Latin parens (dict pass is a no-op,
  // sanitizer carries the whole job).
  ['the ח׳ (ח׳) section', 'the ח׳ section'],
  // Empty / passthrough.
  ['', ''],
  ['plain English with no Hebrew or parens at all', 'plain English with no Hebrew or parens at all'],
];

describe('hebraize — full pipeline', () => {
  for (const [input, expected] of HEBRAIZE_FULL) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// HEBREW_GLOSS_STYLE "always hebraize" coverage. Every term in the prompt's
// always-hebraize list MUST resolve through the dict — otherwise LLM output
// like `terumah (priestly portion)` slips past Pass 2 and the user sees bare
// transliteration. One Pass 1 case per canonical term locks the dict shape.
// ---------------------------------------------------------------------------

const GLOSS_STYLE_TERMS_PASS1: Array<[string, string]> = [
  ['performed (lechatchila)',          'performed (לכתחילה)'],
  ['the meat (bedieved) is permitted', 'the meat (בדיעבד) is permitted'],
  // Stopword-preceded parens get stripped (function-word interjection).
  ['the (sugya) records',              'the סוגיא records'],
  ['final (psak) of the Rambam',       'final (פסק) of the רמב״ם'],
  ['the principle of (rov)',           'the principle of רוב'],
  ['a (chazaka) overrides',            'a חזקה overrides'],
  ['matter of (safek)',                'matter of ספק'],
  ['restored to (tahara)',             'restored to טהרה'],
  ['set aside as (terumah)',           'set aside as תרומה'],
  ['tithed as (maaser)',               'tithed as מעשר'],
  ['the (chametz) is sold',            'the חמץ is sold'],
  // Content-word-preceded parens are KEPT (legit Form B).
  ['eats (matzah) on seder night',     'eats (מצה) on seder night'],
  ['classified as (treif)',            'classified as טריפה'],
  ['is (kosher) for the table',        'is (כשר) for the table'],
  ['observance of (pesach)',           'observance of פסח'],
  ['the (yom tov) restrictions',       'the יום טוב restrictions'],
  ['recites a (bracha)',               'recites a ברכה'],
  ['wears (tzitzit) daily',            'wears (ציצית) daily'],
  ['dons (tefillin) at shacharit',     'dons (תפילין) at shacharit'],
  ['convened the (bet din)',           'convened the בית דין'],
  ['freed his (eved)',                 'freed his עבד'],
  ['delivers a (get)',                 'delivers a גט'],
  ['the (kiddushin) is valid',         'the קידושין is valid'],
];

describe('hebraize — HEBREW_GLOSS_STYLE always-hebraize terms (Pass 1)', () => {
  for (const [input, expected] of GLOSS_STYLE_TERMS_PASS1) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// Pass 2 (inverted) coverage for the same list. The LLM sometimes emits
// `lechatchila (the ideal standard)` instead of `lechatchila (לכתחילה)` —
// Pass 2 must flip to `the ideal standard (לכתחילה)` so the Hebrew is the
// canonical anchor.
const GLOSS_STYLE_TERMS_PASS2: Array<[string, string]> = [
  ['lechatchila (the ideal standard) one should', 'the ideal standard (לכתחילה) one should'],
  ['bedieved (after the fact) the meat',          'after the fact (בדיעבד) the meat'],
  ['rov (the majority principle) applies',        'the majority principle (רוב) applies'],
  ['chazaka (a legal presumption) holds',         'a legal presumption (חזקה) holds'],
  ['safek (a doubt) about the status',            'a doubt (ספק) about the status'],
  ['terumah (the priestly portion) is set aside', 'the priestly portion (תרומה) is set aside'],
  ['matzah (unleavened bread) on seder night',    'unleavened bread (מצה) on seder night'],
  ['kosher (ritually fit) for the table',         'ritually fit (כשר) for the table'],
  ['kiddushin (the betrothal act) is valid',      'the betrothal act (קידושין) is valid'],
];

describe('hebraize — HEBREW_GLOSS_STYLE always-hebraize terms (Pass 2 inverted)', () => {
  for (const [input, expected] of GLOSS_STYLE_TERMS_PASS2) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// Variant normalization — apostrophe, ch/kh/ḥ folding, optional trailing -h.
// Locks in that the dict's forgiving lookup keeps working for the new entries.
const GLOSS_STYLE_VARIANTS: Array<[string, string]> = [
  // Hyphenated variants of compound transliterations.
  ['performed (le-chatchila)',     'performed (לכתחילה)'],
  ['the (be-dieved) ruling',       'the בדיעבד ruling'],
  // Trailing -h optional pair.
  ['restored to (taharah)',        'restored to טהרה'],
  ['relies on a (chazakah)',       'relies on a חזקה'],
  ['set aside as (teruma)',        'set aside as תרומה'],
  ['eats (matza) on seder night',  'eats (מצה) on seder night'],
  // Sephardi/academic transliteration of ḥ (folded to h, then matches "h").
  ['the (hametz) is sold',         'the חמץ is sold'],
  ['the (ḥametz) is sold',         'the חמץ is sold'],
  // Apostrophe variants — `ma'aser` and `maaser` both hit מעשר.
  ['tithed as (ma\'aser)',         'tithed as מעשר'],
  ['tithed as (maaser)',           'tithed as מעשר'],
];

describe('hebraize — variant transliterations land on same Hebrew', () => {
  for (const [input, expected] of GLOSS_STYLE_VARIANTS) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// Pass 1 → Pass 3 cascade. The LLM occasionally emits the doubled form
// `סוגיא (sugya)` — Pass 1 promotes the parens to `(סוגיא)`, then Pass 3
// collapses the resulting `סוגיא (סוגיא)`. This is the cascade that justifies
// running echo-strip AFTER the dict pass, not before.
const GLOSS_STYLE_CASCADE: Array<[string, string]> = [
  ['the סוגיא (sugya) records',           'the סוגיא records'],
  ['final פסק (psak) of the Rambam',      'final פסק of the רמב״ם'],
  ['observance of פסח (pesach) requires', 'observance of פסח requires'],
  ['dons תפילין (tefillin) at shacharit', 'dons תפילין at shacharit'],
];

describe('hebraize — dict cascade collapses echo after Pass 1 promotion', () => {
  for (const [input, expected] of GLOSS_STYLE_CASCADE) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// Word-boundary guard for the new entries. Common English-overlap terms
// like `get`, `kosher`, `rov` MUST not fire on substrings — otherwise we'd
// mangle ordinary English prose.
const GLOSS_STYLE_NO_FALSE_POSITIVES: Array<[string, string]> = [
  // Mid-word — `get` is a substring of `forget`, `getter`, etc.
  ['you forget (something important) here', 'you forget (something important) here'],
  ['the getter (a method) returns',         'the getter (a method) returns'],
  // Mid-word — `rov` inside `roving`.
  ['a roving (wandering) scholar',          'a roving (wandering) scholar'],
  // Mid-word — `psak` inside `psakim`. Note: this only guards INVERTED_RE;
  // Pass 1 would still match `(psak)` inside parens, which is correct.
  ['the psakim (rulings) of',               'the psakim (rulings) of'],
];

describe('hebraize — new dict entries do not false-positive on substrings', () => {
  for (const [input, expected] of GLOSS_STYLE_NO_FALSE_POSITIVES) {
    it(`leaves "${input}" alone`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// hebraizeBareNames — bare-word swap for halachic authorities + work titles.
// These appear in halacha synthesis prose unwrapped by parens (e.g. "Rambam
// in Mishneh Torah"); the dict passes never touch them. This pass closes
// that gap with a curated whitelist.
// ---------------------------------------------------------------------------

const BARE_NAMES_SWAP: Array<[string, string]> = [
  // Single-word authorities.
  ['Rambam in Mishneh Torah codifies',           'רמב״ם in משנה תורה codifies'],
  ['Rashi explains the gemara',                  'רש״י explains the gemara'],
  ['Tosafot disagree',                           'תוספות disagree'],
  ['Tosfos disagree',                            'תוספות disagree'],
  ['the Ramban argues against',                  'the רמב״ן argues against'],
  ['Rashba and Ritva both hold',                 'רשב״א and ריטב״א both hold'],
  ['the Meiri suggests',                         'the מאירי suggests'],
  ['Maharsha notes',                             'מהרש״א notes'],
  ['the Rema rules',                             'the רמ״א rules'],
  ['the Tur and Shulchan Aruch',                 'the טור and שולחן ערוך'],
  ['following Rosh permits',                     'following רא״ש permits'],
  // Multi-word work titles.
  ['Shulchan Aruch Orach Chaim 235',             'שולחן ערוך אורח חיים 235'],
  ['Orach Chayim 235:3 follows',                 'אורח חיים 235:3 follows'],
  ['Orach Chayyim 235:3 follows',                'אורח חיים 235:3 follows'],
  ['Yoreh Deah codifies the dietary law',        'יורה דעה codifies the dietary law'],
  ['Even HaEzer governs marriage',               'אבן העזר governs marriage'],
  ['Even Ha-Ezer governs marriage',              'אבן העזר governs marriage'],
  ['Choshen Mishpat covers civil disputes',      'חושן משפט covers civil disputes'],
  // Case-insensitive.
  ['the RAMBAM holds',                           'the רמב״ם holds'],
  ['the rashi explains',                         'the רש״י explains'],
];

describe('hebraizeBareNames — authority + work-title swap', () => {
  for (const [input, expected] of BARE_NAMES_SWAP) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraizeBareNames(input)).toBe(expected);
    });
  }
});

// Negative cases: collisions with everyday English contexts the whitelist
// must NOT mangle.
const BARE_NAMES_PRESERVE: Array<[string, string]> = [
  // "Rosh Hashanah" / "Rosh Chodesh" — holiday qualifiers, not the work.
  ['celebrated on Rosh Hashanah',                'celebrated on Rosh Hashanah'],
  ['Rosh HaShanah falls in Tishrei',             'Rosh HaShanah falls in Tishrei'],
  ['observed on Rosh Chodesh',                   'observed on Rosh Chodesh'],
  ['the Rosh Chodesh blessing',                  'the Rosh Chodesh blessing'],
  // Mid-word — word boundary prevents these.
  ['the torture of the inquisition',             'the torture of the inquisition'],
  ['the future generations',                     'the future generations'],
  ['the Ritvan king',                            'the Ritvan king'],  // Ritvan ≠ Ritva
  // Generic religious terms deliberately NOT in whitelist — must stay English.
  ['the Torah commands',                         'the Torah commands'],
  ['the Mishnah records',                        'the Mishnah records'],
  ['the Gemara discusses',                       'the Gemara discusses'],
  // Already-Hebrew text untouched.
  ['רמב״ם in his code',                          'רמב״ם in his code'],
];

describe('hebraizeBareNames — preserves non-matches', () => {
  for (const [input, expected] of BARE_NAMES_PRESERVE) {
    it(`leaves "${input}" alone`, () => {
      expect(hebraizeBareNames(input)).toBe(expected);
    });
  }
});

// End-to-end through hebraize() pipeline — the user's reported failure case
// from the halacha synthesis output, plus the cascade with other passes.
describe('hebraize — full pipeline catches bare-word authorities', () => {
  it('hebraicizes Rambam, Mishneh Torah, Tur, Shulchan Aruch, Rosh in halacha prose', () => {
    const input = 'Rambam in Mishneh Torah codifies the position; the Tur and Shulchan Aruch follow; Rosh dissents.';
    const out = hebraize(input);
    expect(out).toContain('רמב״ם');
    expect(out).toContain('משנה תורה');
    expect(out).toContain('טור');
    expect(out).toContain('שולחן ערוך');
    expect(out).toContain('רא״ש');
    // Verify English connective tissue is preserved.
    expect(out).toContain(' in ');
    expect(out).toContain(' codifies ');
    expect(out).toContain(' follow; ');
    expect(out).toContain(' dissents.');
  });

  it('does not double-hebraize when the LLM already wrote Hebrew', () => {
    const input = 'רמב״ם holds the obligation extends until dawn; the Rema agrees.';
    const out = hebraize(input);
    expect(out).toContain('רמב״ם');
    expect(out).toContain('רמ״א');
    // No literal duplicate of either.
    expect(out.match(/רמב״ם/g)?.length).toBe(1);
    expect(out.match(/רמ״א/g)?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Halachic-procedure bare-name coverage. Authors of LLM prompts can't list
// every term the model will emit; this section locks in coverage for the
// classes of terms that have surfaced as transliteration leaks in cached
// halacha-synthesis output.
// ---------------------------------------------------------------------------

const HALACHIC_BARE_SWAP: Array<[string, string]> = [
  // Procedures
  ['the act of melikah is performed',          'the act of מליקה is performed'],
  ['melikha differs from shechita',            'מליקה differs from שחיטה'],
  ['shechitah requires a sharp blade',         'שחיטה requires a sharp blade'],
  ['chalitza releases the obligation',         'חליצה releases the obligation'],
  ['chalitzah ceremony',                       'חליצה ceremony'],
  ['yibum is the levirate marriage',           'יבום is the levirate marriage'],
  // Kashrut categories
  ['a neveilah and a baraita',                 'a נבלה and a ברייתא'],
  ['classified as neveila',                    'classified as נבלה'],
  ['the nevelah is forbidden',                 'the נבלה is forbidden'],
  ['treif meat',                               'טריפה meat'],
  ['the treifa was disqualified',              'the טריפה was disqualified'],
  // Sacrifices
  ['the chatat offering',                      'the חטאת offering'],
  ['asham for unintentional sin',              'אשם for unintentional sin'],
  ['a korban brought to the altar',            'a קרבן brought to the altar'],
  ['the korbanot of the tamid',                'the קרבנות of the tamid'],
  // Marriage / family
  ['the ketubah obligates the husband',        'the כתובה obligates the husband'],
  ['the ketuba document',                      'the כתובה document'],
  // Priestly portions
  ['the challah portion is separated',         'the חלה portion is separated'],
  ['pidyon haben is performed',                'פדיון haben is performed'],
  ['the bechor receives a double portion',     'the בכור receives a double portion'],
  // Concluding / collective sages
  ['the siyum celebration',                    'the סיום celebration'],
  ['Chazal teach us',                          'חז״ל teach us'],
  ['Hazal interpret the verse',                'חז״ל interpret the verse'],
  // Generations
  ['the amoraim disagree on this point',       'the אמוראים disagree on this point'],
  ['the tannaim of Yavneh',                    'the תנאים of Yavneh'],
  ['the rishonim debate',                      'the ראשונים debate'],
  ['acharonim follow Rosh',                    'אחרונים follow רא״ש'],
  // Discourse
  ['a baraita contradicts the mishnah',        'a ברייתא contradicts the mishnah'],
  ['several baraitot are cited',               'several ברייתות are cited'],
  ['the kushya is sharp',                      'the קושיא is sharp'],
  ['the terutz resolves the contradiction',    'the תירוץ resolves the contradiction'],
];

describe('hebraize — halachic-procedure bare-name swap', () => {
  for (const [input, expected] of HALACHIC_BARE_SWAP) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// Real-world regression: the user-reported "melikah and a baraita's account"
// snippet should now hebraicize both terms.
describe('hebraize — original reported halacha-prose snippets', () => {
  it('hebraicizes the "melikah and a baraita\'s account" fragment', () => {
    const input = "the Mishnah requires melikah and a baraita's account confirms the procedure";
    const out = hebraize(input);
    expect(out).toContain('מליקה');
    expect(out).toContain('ברייתא');
    expect(out).toContain(' and ');
    expect(out).toContain(" account ");
  });
});

// Negative guards: the new terms must NOT collide with everyday English.
const HALACHIC_BARE_PRESERVE: string[] = [
  // Mid-word collisions
  'a koreckle of the law',           // "kor" not present anyway, but guarding shape
  // Substring of longer English words
  'the matamoreal evidence',         // 'amoraim' is not a substring here
  // English words that happen to look like halachic terms
  'the challah recipe varies by region',  // ambiguous; in this corpus, swapping is desired
];

describe('hebraize — halachic-bare guards (no mid-word collisions)', () => {
  for (const input of HALACHIC_BARE_PRESERVE.slice(0, 2)) {
    it(`leaves "${input}" alone`, () => {
      expect(hebraize(input)).toBe(input);
    });
  }
});

// ---------------------------------------------------------------------------
// Real-world halacha-prose snippets — regression coverage drawn from
// patterns observed in actual cached enrichment output. Each test pins a
// specific failure mode the bare-name pass repairs.
// ---------------------------------------------------------------------------

describe('hebraize — real-world halacha-prose regression coverage', () => {
  it('the original "melikah and a baraita" failure case', () => {
    const input = "The Mishnah requires melikah and a baraita's account confirms the procedure for a chatat bird offering.";
    const out = hebraize(input);
    expect(out).toContain('מליקה');
    expect(out).toContain('ברייתא');
    expect(out).toContain('חטאת');
  });

  it('Rambam-in-Mishneh-Torah opening with multiple authorities', () => {
    const input = "Rambam in Mishneh Torah codifies it; the Tur and Shulchan Aruch Orach Chaim 235:3 follow; Rosh dissents.";
    const out = hebraize(input);
    expect(out).toContain('רמב״ם');
    expect(out).toContain('משנה תורה');
    expect(out).toContain('טור');
    expect(out).toContain('שולחן ערוך');
    expect(out).toContain('אורח חיים');
    expect(out).toContain('רא״ש');
    // English connective tissue preserved.
    expect(out).toContain(' codifies it; ');
  });

  it('generations of sages in one sentence', () => {
    const input = "The tannaim debate the rule, the amoraim extend it, the rishonim codify it, and the acharonim refine it.";
    const out = hebraize(input);
    expect(out).toContain('תנאים');
    expect(out).toContain('אמוראים');
    expect(out).toContain('ראשונים');
    expect(out).toContain('אחרונים');
  });

  it('sacrificial categories together', () => {
    const input = "The chatat, asham, and olah differ in their procedures; the korban shelamim is unique.";
    const out = hebraize(input);
    expect(out).toContain('חטאת');
    expect(out).toContain('אשם');
    expect(out).toContain('קרבן');
    // 'olah' and 'shelamim' deliberately NOT in bare whitelist (English overlap risk)
    expect(out).toContain('olah');
    expect(out).toContain('shelamim');
  });

  it('marriage and divorce halachic terms', () => {
    const input = "After chalitza is performed, the woman is freed; yibum is the alternative levirate path. The ketubah governs the marriage obligations.";
    const out = hebraize(input);
    expect(out).toContain('חליצה');
    expect(out).toContain('יבום');
    expect(out).toContain('כתובה');
  });

  it('kashrut categories — neveilah vs treifa', () => {
    const input = "A neveilah is animal flesh dead from causes other than valid shechita; a treifa is from an animal with a disqualifying defect.";
    const out = hebraize(input);
    expect(out).toContain('נבלה');
    expect(out).toContain('שחיטה');
    expect(out).toContain('טריפה');
  });

  it('argument-structure terms together', () => {
    const input = "The kushya is sharp, and the terutz that resolves it relies on a baraita not previously cited.";
    const out = hebraize(input);
    expect(out).toContain('קושיא');
    expect(out).toContain('תירוץ');
    expect(out).toContain('ברייתא');
  });

  it('Chazal capitalized and bare', () => {
    const input = "Chazal teach the principle; later Hazal extend it in their commentaries.";
    const out = hebraize(input);
    expect(out.match(/חז״ל/g)?.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Deliberate EXCLUSIONS — terms we kept out of the bare-name whitelist
// because they flow as English in this corpus. Bare-swapping them would
// hurt readability. These tests pin down the boundary so future contributors
// don't drift toward over-hebraicization.
// ---------------------------------------------------------------------------

const DELIBERATE_EXCLUSIONS: string[] = [
  // Generic religious terms — flow as English in halachic prose.
  'the Torah commands daily prayer',
  'the Mishnah records this position',
  'the Gemara discusses the case',
  'Jewish halacha demands more',
  'the Talmud is the authoritative source',
  'rabbinic halacha is binding',
  // Times / calendar — flow as English.
  'on Shabbat the rule changes',
  'before Pesach we clean',
  'after Sukkot the season ends',
  // Body / common nouns that overlap dict shorter forms.
  'olah of joy filled the room',         // 'olah' deliberately excluded
  'the shelamim of peace',               // 'shelamim' deliberately excluded
  // Pseudo-Hebrew but unrelated English words.
  'the future of the case',              // 'tur' is substring; word-boundary stops
  'past torture, the system reformed',   // 'tor' substring
  // Rosh-collision guards.
  'Rosh Hashanah is the new year',
  'Rosh Chodesh marks the new month',
  'Rosh HaShanah falls in Tishrei',
];

describe('hebraize — deliberate exclusions preserve English readability', () => {
  for (const input of DELIBERATE_EXCLUSIONS) {
    it(`leaves "${input}" alone`, () => {
      expect(hebraize(input)).toBe(input);
    });
  }
});

// ---------------------------------------------------------------------------
// Mid-word collision guards for the expanded whitelist. Word-boundary regex
// SHOULD prevent these from firing — these tests lock that in.
// ---------------------------------------------------------------------------

const MID_WORD_GUARDS: Array<[string, string]> = [
  // 'chatat' as substring
  ['the chataton particles',           'the chataton particles'],
  // 'asham' as substring of 'ashamed'
  ['he felt ashamed by the ruling',    'he felt ashamed by the ruling'],
  // 'korban' as substring
  ['the korbanot building',            'the קרבנות building'], // korbanot IS a whole-word match
  ['the korbanesque flavor',           'the korbanesque flavor'],
  // 'bechor' as substring (rare but defensible)
  ['the bechored expression',          'the bechored expression'],
  // 'baraita' as substring
  ['baraitatic literature',            'baraitatic literature'],
  // 'kushya' as substring
  ['the kushyatic question',           'the kushyatic question'],
  // 'siyum' as substring
  ['the siyumesque ending',            'the siyumesque ending'],
];

describe('hebraize — mid-word collision guards', () => {
  for (const [input, expected] of MID_WORD_GUARDS) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Spelling-variant coverage — the LLM emits multiple romanizations of the
// same Hebrew term (Tosafot/Tosfos, Chazal/Hazal, treif/treifa/trefah).
// All variants must land on the same Hebrew script.
// ---------------------------------------------------------------------------

const SPELLING_VARIANTS: Array<[string[], string]> = [
  // Tosafot / Tosfos
  [['Tosafot comment here', 'Tosfos comment here'],     'תוספות'],
  // Chazal / Hazal
  [['Chazal taught', 'Hazal taught'],                    'חז״ל'],
  // Neveilah variants
  [['classified as neveilah', 'classified as neveila',
    'classified as nevelah'],                            'נבלה'],
  // Treif / Treifa / Trefah
  [['called treif', 'called treifa', 'called trefah'],   'טריפה'],
  // Chalitza / Chalitzah
  [['performs chalitza', 'performs chalitzah'],          'חליצה'],
  // Melikah / Melikha
  [['the melikah ritual', 'the melikha ritual'],         'מליקה'],
  // Shechita / Shechitah
  [['valid shechita', 'valid shechitah'],                'שחיטה'],
  // Ketubah / Ketuba
  [['the ketubah obligation', 'the ketuba obligation'],  'כתובה'],
  // Challah / Challa
  [['the challah portion', 'the challa portion'],        'חלה'],
  // Bechor / Bekhor
  [['the bechor inherits', 'the bekhor inherits'],       'בכור'],
  // Orach Chaim spellings
  [['Orach Chaim 235', 'Orach Chayim 235',
    'Orach Chayyim 235'],                                'אורח חיים'],
];

describe('hebraize — spelling variants all land on same Hebrew', () => {
  for (const [inputs, expectedHebrew] of SPELLING_VARIANTS) {
    for (const input of inputs) {
      it(`"${input}" produces "${expectedHebrew}"`, () => {
        expect(hebraize(input)).toContain(expectedHebrew);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Pipeline cascade — `Authority (transliteration)` paren forms still work
// when the authority is also in the bare-name whitelist. Tests that adding
// to the whitelist didn't break the dict's paren-pass.
// ---------------------------------------------------------------------------

describe('hebraize — paren form still works for whitelisted terms', () => {
  const cases: Array<[string, string]> = [
    // Pass 1 swaps content → Pass 4 strips redundant function-word parens.
    ['the (melikah) procedure',          'the מליקה procedure'],
    ['classified as (neveilah)',         'classified as נבלה'],
    ['records a (baraita)',              'records a ברייתא'],
    ['the (kushya) is resolved',         'the קושיא is resolved'],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(hebraize(input)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// stripStopwordHebrewParens — strips pure-Hebrew parens when preceded by an
// English function word (article/preposition/conjunction/possessive/
// demonstrative). Content-word-preceded parens are kept because they're
// legit Form B glosses (Tanna → תנא).
// ---------------------------------------------------------------------------

import { stripStopwordHebrewParens } from '../src/client/hebraize';

const STOPWORD_STRIP: Array<[string, string]> = [
  // Articles
  ['the (מליקה) procedure',         'the מליקה procedure'],
  ['a (נבלה) is forbidden',          'a נבלה is forbidden'],
  ['an (אורח חיים) section',         'an אורח חיים section'],
  // Possessives
  ['his (עבד) was freed',            'his עבד was freed'],
  ['her (כתובה) obligates',          'her כתובה obligates'],
  ['their (מנהג) varies',            'their מנהג varies'],
  // Demonstratives
  ['this (סוגיא) covers',            'this סוגיא covers'],
  ['that (קושיא) is sharp',          'that קושיא is sharp'],
  // Prepositions
  ['classified as (נבלה)',           'classified as נבלה'],
  ['of (רוב) applies',               'of רוב applies'],
  ['to (טהרה) returns',              'to טהרה returns'],
  ['from (טומאה) to (טהרה)',         'from טומאה to טהרה'],
  ['at (יבנה) the council',          'at יבנה the council'],
  ['for (פסח) we clean',             'for פסח we clean'],
  ['with (כפרה) the priest',         'with כפרה the priest'],
  // Conjunctions
  ['and (תוספות) disagree',          'and תוספות disagree'],
  ['or (רמ״א) rules',                'or רמ״א rules'],
  ['but (מהרש״א) holds',             'but מהרש״א holds'],
];

const STOPWORD_KEEP: Array<[string, string]> = [
  // Content word before — legit Form B gloss.
  ['Tanna (תנא) at Yavneh',           'Tanna (תנא) at Yavneh'],
  ['atonement (כפרה) does not',       'atonement (כפרה) does not'],
  ['procedure (מליקה) is performed',  'procedure (מליקה) is performed'],
  ['principle (רוב) applies',         'principle (רוב) applies'],
  ['ruling (פסק) of the court',       'ruling (פסק) of the court'],
  // Verb before — also content word.
  ['wears (ציצית) daily',             'wears (ציצית) daily'],
  ['eats (מצה) on seder night',       'eats (מצה) on seder night'],
  // Parens contain English, not Hebrew — pass doesn't fire.
  ['the (Hilchot Shabbat 8:1) section', 'the (Hilchot Shabbat 8:1) section'],
  ['of (some English aside)',          'of (some English aside)'],
];

describe('stripStopwordHebrewParens — strips function-word interjections', () => {
  for (const [input, expected] of STOPWORD_STRIP) {
    it(`"${input}" → "${expected}"`, () => {
      expect(stripStopwordHebrewParens(input)).toBe(expected);
    });
  }
});

describe('stripStopwordHebrewParens — preserves Form B and English-content parens', () => {
  for (const [input, expected] of STOPWORD_KEEP) {
    it(`leaves "${input}" alone`, () => {
      expect(stripStopwordHebrewParens(input)).toBe(expected);
    });
  }
});

// Real-world failure case from the user's halacha synthesis output —
// multiple stopword-preceded parens in one sentence.
describe('hebraize — multi-strip in halacha prose', () => {
  it('strips all function-word parens in the user-reported snippet', () => {
    const input = 'The (sugya) covers a (kushya) of (rov), with the (terutz) relying on a (baraita).';
    const out = hebraize(input);
    expect(out).toBe('The סוגיא covers a קושיא of רוב, with the תירוץ relying on a ברייתא.');
  });
});
