import { describe, it, expect } from 'vitest';
import { hebraize, stripEchoParens } from '../src/client/hebraize';

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
  ['Mishneh Torah (Hilchot Shabbat 8:1)',        'Mishneh Torah (Hilchot Shabbat 8:1)'],
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
  // Gloss contains Hebrew — leave alone (it's not a gloss, it's a citation).
  ['kushya (קושיא) is resolved', 'kushya (קושיא) is resolved'],
  // Gloss contains a digit — verse ref / page number style, leave alone.
  ['Shabbat (31a) records',     'Shabbat (31a) records'],
  // Word-boundary guard: translit is mid-word, not a standalone term.
  ['xkushya (a difficulty)',    'xkushya (a difficulty)'],
  // Translit not in dict — no swap.
  ['foobar (some gloss)',       'foobar (some gloss)'],
];

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
  ['the (sugya) records',              'the (סוגיא) records'],
  ['final (psak) of the Rambam',       'final (פסק) of the Rambam'],
  ['the principle of (rov)',           'the principle of (רוב)'],
  ['a (chazaka) overrides',            'a (חזקה) overrides'],
  ['matter of (safek)',                'matter of (ספק)'],
  ['restored to (tahara)',             'restored to (טהרה)'],
  ['set aside as (terumah)',           'set aside as (תרומה)'],
  ['tithed as (maaser)',               'tithed as (מעשר)'],
  ['the (chametz) is sold',            'the (חמץ) is sold'],
  ['eats (matzah) on seder night',     'eats (מצה) on seder night'],
  ['classified as (treif)',            'classified as (טריפה)'],
  ['is (kosher) for the table',        'is (כשר) for the table'],
  ['observance of (pesach)',           'observance of (פסח)'],
  ['the (yom tov) restrictions',       'the (יום טוב) restrictions'],
  ['recites a (bracha)',               'recites a (ברכה)'],
  ['wears (tzitzit) daily',            'wears (ציצית) daily'],
  ['dons (tefillin) at shacharit',     'dons (תפילין) at shacharit'],
  ['convened the (bet din)',           'convened the (בית דין)'],
  ['freed his (eved)',                 'freed his (עבד)'],
  ['delivers a (get)',                 'delivers a (גט)'],
  ['the (kiddushin) is valid',         'the (קידושין) is valid'],
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
  ['the (be-dieved) ruling',       'the (בדיעבד) ruling'],
  // Trailing -h optional pair.
  ['restored to (taharah)',        'restored to (טהרה)'],
  ['relies on a (chazakah)',       'relies on a (חזקה)'],
  ['set aside as (teruma)',        'set aside as (תרומה)'],
  ['eats (matza) on seder night',  'eats (מצה) on seder night'],
  // Sephardi/academic transliteration of ḥ (folded to h, then matches "h").
  ['the (hametz) is sold',         'the (חמץ) is sold'],
  ['the (ḥametz) is sold',         'the (חמץ) is sold'],
  // Apostrophe variants — `ma'aser` and `maaser` both hit מעשר.
  ['tithed as (ma\'aser)',         'tithed as (מעשר)'],
  ['tithed as (maaser)',           'tithed as (מעשר)'],
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
  ['final פסק (psak) of the Rambam',      'final פסק of the Rambam'],
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
