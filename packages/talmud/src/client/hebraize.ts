/**
 * Hebraize — replace transliterated Talmudic technical terms inside
 * parentheses with their Hebrew script equivalent.
 *
 * Input  : `the dispute hinges on designation (yi'ud)`
 * Output : `the dispute hinges on designation (ייעוד)`
 *
 * Only parentheticals whose normalized text matches a dictionary entry are
 * swapped — anything else (verse refs, English asides, dates) is left alone.
 *
 * Adding a term:
 *   1. Pick the conventional transliteration the AI emits (Sefaria-style).
 *   2. Add the lowercase form, with apostrophes normalized to `'`, mapping
 *      to the unvocalized Hebrew.
 *   3. Both `ma'aseh` and `maaseh` (with and without apostrophe) should
 *      map to the same Hebrew — the lookup normalizes both.
 */

import { type DisplayItem, heKey } from '../lib/bilingual';
import { canonicalDictEntries } from '../lib/hebrewTerms';

const HEBRAIZE_DICT: Record<string, string> = {
  // HEBREW_GLOSS_STYLE "ALWAYS hebraize" core terms — single-sourced from
  // src/lib/hebrewTerms so the prompt's always-list and this dict can't drift.
  // Spread first; everything below is the long tail (sugya structure, places,
  // texts, codices) that lives only here.
  ...canonicalDictEntries(),
  // Additional spellings used by the display allowlist below.
  'tosafot harosh': 'תוספות הרא״ש',
  'tosfos harosh': 'תוספות הרא״ש',
  'tosafot rid': 'תוספות רי״ד',
  'tosfos rid': 'תוספות רי״ד',
  'tosafot yeshanim': 'תוספות ישנים',
  'tosfos yeshanim': 'תוספות ישנים',
  tosfos: 'תוספות',
  'orach chayim': 'אורח חיים',
  'orach chayyim': 'אורח חיים',
  'even haezer': 'אבן העזר',
  treif: 'טריפה',
  treifa: 'טריפה',
  trefah: 'טריפה',
  baraitot: 'ברייתות',

  // ── Sugya structure / argument moves ─────────────────────────────────
  "yi'ud": 'ייעוד',
  hakhanah: 'הכנה',
  kushya: 'קושיא',
  terutz: 'תירוץ',
  derashah: 'דרשה',
  derash: 'דרש',
  peshat: 'פשט',
  pilpul: 'פלפול',
  hava: 'הוה אמינא',
  'hava amina': 'הוה אמינא',
  'gezera shava': 'גזרה שוה',
  'kal vachomer': 'קל וחומר',
  'binyan av': 'בנין אב',
  'al tikri': 'אל תקרי',

  // ── Halachic concepts ─────────────────────────────────────────────────
  muktzeh: 'מוקצה',
  muktzah: 'מוקצה',
  mashal: 'משל',
  nimshal: 'נמשל',
  kaparah: 'כפרה',
  shemirah: 'שמירה',
  mitzvah: 'מצוה',
  aveirah: 'עבירה',
  takanah: 'תקנה',
  gezeirah: 'גזרה',
  minhag: 'מנהג',
  halakhah: 'הלכה',
  halacha: 'הלכה',
  agadah: 'אגדה',
  aggadah: 'אגדה',
  "tum'ah": 'טומאה',
  tahor: 'טהור',
  tamei: 'טמא',
  asur: 'אסור',
  mutar: 'מותר',
  patur: 'פטור',
  chayav: 'חייב',
  bittul: 'ביטול',
  hefsek: 'הפסק',
  "shi'ur": 'שיעור',
  // (lechatchila, bedieved, sugya, psak, rov, chazaka, safek, tahara,
  //  terumah, maaser, chametz, matzah, treif, kosher, pesach, yom tov,
  //  bracha, tzitzit, tefillin, bet din, eved, get, kiddushin, rov basar,
  //  mafreket, siman/simanim, veshet, kaneh, bnei Noach, ben shnato, bekhor,
  //  pidyon haben, … now come from canonicalDictEntries() spread above.)
  // Halachic procedures + categories — common bare-transliteration leaks
  // (also added to BARE_HEBRAIZE_NAMES below for whole-word swap).
  melikah: 'מליקה',
  melikha: 'מליקה',
  shechita: 'שחיטה',
  shechitah: 'שחיטה',
  chalitza: 'חליצה',
  chalitzah: 'חליצה',
  yibum: 'יבום',
  neveilah: 'נבלה',
  neveila: 'נבלה',
  nevelah: 'נבלה',
  ketubah: 'כתובה',
  ketuba: 'כתובה',
  challah: 'חלה',
  challa: 'חלה',
  pidyon: 'פדיון',
  bechor: 'בכור',
  bekhor: 'בכור',
  siyum: 'סיום',
  chazal: 'חז״ל',
  hazal: 'חז״ל',

  // ── Composite phrases (multi-word) ────────────────────────────────────
  'yetzer hara': 'יצר הרע',
  'yetzer ha-tov': 'יצר הטוב',
  'pasuk shel rachamim': 'פסוק של רחמים',
  'yissurin shel ahavah': 'יסורים של אהבה',
  'keriat shema al ha-mitah': 'קריאת שמע על המיטה',
  'keriat shema': 'קריאת שמע',
  "keri'at shema": 'קריאת שמע',
  'neger hanegrar': 'נגר הנגרר',
  'tevua tzvura': 'תבואה צבורה',
  'olam haba': 'עולם הבא',
  'olam ha-zeh': 'עולם הזה',
  'bnei yisrael': 'בני ישראל',
  'eretz yisrael': 'ארץ ישראל',
  'beit din': 'בית דין',
  'beit ha-mikdash': 'בית המקדש',
  'tikkun olam': 'תיקון עולם',
  'lashon ha-ra': 'לשון הרע',
  // Times of day / liturgical deadlines
  'amud ha-shachar': 'עמוד השחר',
  'amud hashachar': 'עמוד השחר',
  'ha-ashmurah ha-rishonah': 'האשמורה הראשונה',
  'ashmurah ha-rishonah': 'האשמורה הראשונה',
  'ashmurah rishonah': 'האשמורה הראשונה',
  ashmurah: 'אשמורה',
  chatzot: 'חצות',
  hatzot: 'חצות',
  'alot ha-shachar': 'עלות השחר',
  'shkiat ha-chamah': 'שקיעת החמה',
  'tzeit ha-kochavim': 'צאת הכוכבים',
  'bein ha-shmashot': 'בין השמשות',
  "ne'etzu": 'נאצו',
  // Sacrificial / temple terms
  'haqtarat chalavim ve-evarim': 'הקטרת חלבים ואיברים',
  'haktarat chalavim ve-eivarim': 'הקטרת חלבים ואיברים',
  'haktarat chalavim': 'הקטרת חלבים',
  'chalavim ve-evarim': 'חלבים ואיברים',
  korban: 'קרבן',
  korbanot: 'קרבנות',
  olah: 'עולה',
  chatat: 'חטאת',
  asham: 'אשם',
  shelamim: 'שלמים',
  // Rabbinic-fence / homiletic
  geder: 'גדר',
  syag: 'סייג',
  'syag la-torah': 'סייג לתורה',
  'le-harchik adam min ha-aveirah': 'להרחיק אדם מן העבירה',
  'harchakah min ha-aveirah': 'הרחקה מן העבירה',
  'harchik min ha-aveirah': 'הרחיק מן העבירה',
  // Rhetorical formulas
  've-lo zu bilvad': 'ולא זו בלבד',
  've-lo zu af zu': 'ולא זו אף זו',
  'kal she-ken': 'כל שכן',
  'kol she-ken': 'כל שכן',
  'mi-divrei sofrim': 'מדברי סופרים',
  'de-orayta': 'דאורייתא',
  'de-oraita': 'דאורייתא',
  'de-rabbanan': 'דרבנן',
  // Variants from real LLM output
  'richuk min ha-aveirah': 'ריחוק מן העבירה',
  richuk: 'ריחוק',
  'beit ha-mishteh': 'בית המשתה',
  'beit mishteh': 'בית משתה',
  asmakhta: 'אסמכתא',
  hekdesh: 'הקדש',
  malkhut: 'מלכות',
  rabbanan: 'רבנן',
  hakhamim: 'חכמים',
  chakhamim: 'חכמים',
  // Verbs and aspect
  hitkin: 'התקין',
  takinu: 'תקנו',
  takin: 'תקן',
  amar: 'אמר',
  tana: 'תנא',
  tanu: 'תנו',
  tanu_rabbanan: 'תנו רבנן',
  'tanu rabbanan': 'תנו רבנן',

  // ── Texts & literature ────────────────────────────────────────────────
  mishnah: 'משנה',
  gemara: 'גמרא',
  baraita: 'ברייתא',
  amora: 'אמורא',
  amoraim: 'אמוראים',
  tanna: 'תנא',
  tannaim: 'תנאים',
  stam: 'סתם',
  rishonim: 'ראשונים',
  acharonim: 'אחרונים',
  tosefta: 'תוספתא',
  midrash: 'מדרש',
  tanakh: 'תנ״ך',
  torah: 'תורה',
  "nevi'im": 'נביאים',
  ketuvim: 'כתובים',
  yerushalmi: 'ירושלמי',
  bavli: 'בבלי',
  shas: 'ש״ס',

  // ── Halacha codices ───────────────────────────────────────────────────
  'shulchan aruch': 'שולחן ערוך',
  'mishneh torah': 'משנה תורה',
  'orach chaim': 'אורח חיים',
  'yoreh deah': 'יורה דעה',
  'even ha-ezer': 'אבן העזר',
  'choshen mishpat': 'חושן משפט',
  rema: 'רמ״א',
  rambam: 'רמב״ם',
  ramban: 'רמב״ן',
  rashba: 'רשב״א',
  ritva: 'ריטב״א',
  meiri: 'מאירי',
  rosh: 'רא״ש',
  rashi: 'רש״י',
  tosafot: 'תוספות',
  maharsha: 'מהרש״א',
  tur: 'טור',

  // ── Aggadic theme tags ────────────────────────────────────────────────
  "ma'aseh": 'מעשה',
  maaseh: 'מעשה',
  chazon: 'חזון',
  tefillah: 'תפילה',
  "ma'amar": 'מאמר',
  maamar: 'מאמר',

  // ── Reference structure ───────────────────────────────────────────────
  siman: 'סימן',
  seif: 'סעיף',
  perek: 'פרק',
  daf: 'דף',
  amud: 'עמוד',
  parashah: 'פרשה',
  pasuk: 'פסוק',
  pesukim: 'פסוקים',
  passuk: 'פסוק',
  'd.h.': 'ד״ה',
  'dibbur ha-matchil': 'דיבור המתחיל',

  // ── Locations ─────────────────────────────────────────────────────────
  pumbedita: 'פומבדיתא',
  sura: 'סורא',
  bavel: 'בבל',
  babylonia: 'בבל',
  lod: 'לוד',
  tzippori: 'ציפורי',
  tiberias: 'טבריה',
  yavneh: 'יבנה',
  galilee: 'גליל',
  judea: 'יהודה',
  jerusalem: 'ירושלים',
  yerushalayim: 'ירושלים',

  // ── Common nouns ──────────────────────────────────────────────────────
  shvil: 'שביל',
  letekh: 'לתך',
  kor: 'כור',
  shabbat: 'שבת',
  yom: 'יום',
  zman: 'זמן',
  brachah: 'ברכה',
  brachot: 'ברכות',
  shema: 'שמע',
  amen: 'אמן',

  // ── Process verbs ─────────────────────────────────────────────────────
  tikku: 'תיקו',
  itmar: 'איתמר',
  meytivi: 'מיתיבי',
  taneha: 'תנא',
};

/** Normalize variants so the dictionary lookup is forgiving. Strips combining
 *  diacritic marks (so `ḥatzot` and `hatzot` both hit the same key), unifies
 *  apostrophe-like glyphs and the `ʾ`/`ʿ` glottal markers, and folds `ch`
 *  and `kh` into `h` so academic transliterations (`ḥalavim`, `harḥik`) and
 *  Sefaria-style ones (`chalavim`, `harchik`) both land on the same key.
 *  ח and כ both render as the same glottal sound in modern Hebrew, so this
 *  conflation is safe within the transliteration→Hebrew direction. */
function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʿʼʾʻʽ‘’]/g, "'")
    .normalize('NFKC')
    .replace(/ch/g, 'h')
    .replace(/kh/g, 'h')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pre-built lookup with both apostrophe-bearing and stripped forms. */
const NORMALIZED_DICT: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(HEBRAIZE_DICT)) {
    const nk = normalizeKey(k);
    out[nk] = v;
    const stripped = nk.replace(/'/g, '');
    if (stripped !== nk) out[stripped] = v;
  }
  return out;
})();

// Allow Latin (incl. Extended A: À-ſ and Extended Additional: Ḁ-ỿ — covers
// ḥ, ṣ, ṭ, ḵ, etc. used in academic transliterations), spacing modifier
// letters (ʿ, ʼ, ʾ, ʻ), and the ASCII apostrophe / Unicode quotes.
const PAREN_RE = /\(([A-Za-zÀ-ſḀ-ỿʼʻʿʾʹʺ'‘’ \-.]{2,80})\)/g;

/** Bare-word lookup for the inverted-format pass. Includes BOTH the
 *  original dict keys (e.g. `lechatchila`) and their normalized forms
 *  (`lehathila`) — otherwise `ch`/`kh`/`ḥ`-containing transliterations
 *  never match because the regex only sees the post-normalization form.
 *  Longest first so multi-word phrases win over single-word substrings. */
const BARE_KEYS_SORTED = Array.from(
  new Set([...Object.keys(HEBRAIZE_DICT), ...Object.keys(NORMALIZED_DICT)]),
).sort((a, b) => b.length - a.length);
const ESCAPED_KEYS = BARE_KEYS_SORTED.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
// Match "<known-transliteration> (english gloss)" — bare transliteration
// outside parens followed by a Latin-only gloss inside parens. Word boundary
// on the left, no leading letter to avoid mid-word matches.
const INVERTED_RE = new RegExp(
  `(?<![A-Za-zÀ-ſḀ-ỿ])(${ESCAPED_KEYS.join('|')})\\s*\\(([A-Za-z][A-Za-z \\-./']{1,40})\\)`,
  'gi',
);

/** Bare-word allowlist — names of authorities + work titles that
 *  should be in Hebrew script whenever they appear, even outside parens.
 *  Curated CONSERVATIVELY: each entry must be unambiguous in halachic
 *  context. Generic religious terms ("Torah", "Mishnah", "Gemara",
 *  "Halacha") are deliberately excluded — they flow naturally as English
 *  in this corpus and bare-swapping would hurt readability. Multi-word
 *  entries are matched first via longest-first sort so "Mishneh Torah"
 *  wins over a hypothetical bare "Torah" entry. */
const BARE_DISPLAY_SPELLINGS = [
  // Halachic authorities
  'Rambam',
  'Ramban',
  'Rashba',
  'Ritva',
  'Rashi',
  // Tosafot — compound forms listed alongside the bare word. Longest-first
  // matching makes the compounds win, so "Tosafot HaRosh" swaps whole
  // instead of half-translating to "תוספות HaRosh" (one author rendered half
  // Hebrew, half English). The HaRosh/Rid/Yeshanim suffixes are not bare-list
  // entries on their own, so without these the second word leaks through.
  'Tosafot HaRosh',
  'Tosfos HaRosh',
  'Tosafot Rid',
  'Tosfos Rid',
  'Tosafot Yeshanim',
  'Tosfos Yeshanim',
  'Tosafot',
  'Tosfos',
  'Meiri',
  'Maharsha',
  'Rema',
  'Tur',
  'Rosh',
  // Work titles (multi-word — listed alongside their spelling variants).
  'Mishneh Torah',
  'Shulchan Aruch',
  'Orach Chaim',
  'Orach Chayim',
  'Orach Chayyim',
  'Yoreh Deah',
  'Even HaEzer',
  'Even Ha-Ezer',
  'Choshen Mishpat',
  // Halachic procedures (unambiguous in this corpus).
  'melikah',
  'melikha',
  'shechita',
  'shechitah',
  'chalitza',
  'chalitzah',
  'yibum',
  // Kashrut categories.
  'neveilah',
  'neveila',
  'nevelah',
  'treif',
  'treifa',
  'trefah',
  // Sacrifices.
  'chatat',
  'asham',
  'korban',
  'korbanot',
  // Marriage / family.
  'ketubah',
  'ketuba',
  // Priestly portions / firstborn.
  'challah',
  'challa',
  'pidyon',
  'bechor',
  'bekhor',
  // Concluding / collective sages.
  'siyum',
  'Chazal',
  'Hazal',
  // Generation labels.
  'amoraim',
  'tannaim',
  'rishonim',
  'acharonim',
  // Discourse / argument terms.
  'baraita',
  'baraitot',
  'kushya',
  'terutz',
] as const;

/** Known spellings are data for the paragraph formatter, never blind replacements.
 * Include known compounds so a shorter spelling cannot split a work or term. */
export const DISPLAY_ITEMS: readonly DisplayItem[] = Object.entries({
  ...Object.fromEntries(
    BARE_DISPLAY_SPELLINGS.map((en) => [en, NORMALIZED_DICT[normalizeKey(en)]]),
  ),
  ...Object.fromEntries(
    Object.entries(HEBRAIZE_DICT).filter(([en]) =>
      BARE_DISPLAY_SPELLINGS.some((bare) => en.toLowerCase().startsWith(`${bare.toLowerCase()} `)),
    ),
  ),
}).map(([en, he]) => ({ en, he, kind: 'name', transliteration: true }));

/** Function words that, when immediately preceding a pure-Hebrew parens
 *  group, mark the parens as a redundant mid-phrase interjection rather
 *  than a Form B gloss. `the (מליקה) procedure` has "the" before — strip.
 *  `procedure (מליקה)` has "procedure" before (content word, not in list)
 *  — keep, because parens correctly hold the Hebrew gloss for "procedure". */
const PAREN_STRIP_STOPWORDS = [
  // Articles
  'the',
  'a',
  'an',
  // Possessive determiners — behave like articles before a noun.
  'his',
  'her',
  'its',
  'their',
  'our',
  'my',
  'your',
  // Demonstratives
  'this',
  'that',
  'these',
  'those',
  // Prepositions
  'of',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'to',
  'from',
  'as',
  'into',
  'onto',
  'upon',
  'against',
  'between',
  'among',
  'through',
  'over',
  'under',
  'before',
  'after',
  'about',
  // Conjunctions
  'and',
  'or',
  'but',
  'nor',
  'so',
  'yet',
];

/** Match: `<stopword><space>(Hebrew content)` — and strip just the parens.
 *  Hebrew content can include nikud, gershayim, and basic Hebrew-adjacent
 *  punctuation (commas, periods, colons used in verse refs). */
const STOPWORD_HEB_PAREN_RE = new RegExp(
  `(\\b(?:${PAREN_STRIP_STOPWORDS.join('|')})\\s+)\\(([֐-׿][֐-׿װ-״\\s'".,:;-]*)\\)`,
  'gi',
);

/** Strip pure-Hebrew parens that are awkward mid-phrase interjections.
 *  Detected via the preceding function word — if the parens are preceded
 *  by an article/preposition/conjunction, the LLM injected them where a
 *  Form B gloss would have an English noun. Stripping the parens makes
 *  the Hebrew read as plain prose: `the (מליקה) procedure` → `the מליקה
 *  procedure`. Content-word-preceded parens (real Form B glosses like
 *  `Tanna (תנא)`) are left alone. */
export function stripStopwordHebrewParens(text: string): string {
  if (!text) return text;
  return text.replace(STOPWORD_HEB_PAREN_RE, '$1$2');
}

/** Strip parenthetical echoes — `X (X)` collapses to `X`. The source LLM
 *  produces these when it dutifully applies "Form B" gloss to a proper noun
 *  or bare Hebrew letter that has no useful English equivalent (e.g.
 *  `רבי עקיבא (רבי עקיבא)`, `ח׳ (ח׳)`, `דוד המלך (דוד המלך)`). The backref
 *  forces the parens content to equal the preceding token sequence
 *  character-for-character; legit Form B like `Rabbi Akiva (רבי עקיבא)` —
 *  different scripts — never matches. Caps at 6 tokens preceding to keep
 *  the regex bounded. */
const ECHO_PAREN_RE = /(\S+(?:\s+\S+){0,5})\s*\(\1\)/g;

/** Two ADJACENT identical parentheticals — `(X) (X)` → `(X)`. ECHO_PAREN_RE only
 *  catches the bare `X (X)` form; the LLM gloss convention sometimes doubles a
 *  *parenthesized* term instead (`(ביאת שמשו) (ביאת שמשו)`). A repeated
 *  parenthetical is never intentional, so collapsing it is always safe. */
const DOUBLE_PAREN_RE = /\(\s*([^()]+?)\s*\)(\s*)\(\s*\1\s*\)/g;

// Hebrew/Aramaic ranges as \u escapes - see the same note in Hebraized.tsx:
// a literal presentation form (U+FB1D..) can decompose under normalization and
// silently blow the range open. ־/׳/״ = maqaf/geresh/gershayim.
const HE = '\\u0590-\\u05FF\\uFB1D-\\uFB4F';
// A Hebrew run immediately followed by an ALL-Hebrew parenthetical. The gloss
// convention is "Hebrew term (English meaning)", so an all-Hebrew paren here is
// suspect - but only a near-echo (the paren restates the term, often
// malformed/duplicated) is redundant. A genuine Hebrew clarification that adds
// new words must be kept, so we gate the drop on word overlap below rather than
// stripping every Hebrew paren. The paren body is restricted to Hebrew + Hebrew
// punctuation, so digits / other scripts never match. The GAP between term and
// paren tolerates closing quotes (straight + curly) and spaces, so a quoted
// term like 'מלא צואר' (מלא צואר) still matches; the quote is preserved.
const GLOSS_GAP = ` '"\\u2018\\u2019\\u201C\\u201D`;
const HE_GLOSS_PAREN_RE = new RegExp(
  `([${HE}][${HE}\\u05BE\\u05F3\\u05F4'"‘’“” -]*?)([${GLOSS_GAP}]*)\\(\\s*([${HE}][${HE}\\u05BE\\u05F3\\u05F4'"‘’“” ]*)\\)`,
  'g',
);

/** Hebrew final-form letters → their medial form, so a word at the end of a
 *  parenthetical (final kaf/mem/nun/pe/tsadi) compares equal to the same word
 *  used mid-phrase. */
const HEBREW_FINAL_FORMS: Record<string, string> = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

/** A spelling-invariant skeleton of a Hebrew word: drop the optional matres
 *  lectionis (vav and yud — the letters that vary between male/plene and
 *  chaser/defective spelling, e.g. טריפה vs טרפה) and fold final-form letters to
 *  their medial form. Two spellings of the SAME word collapse to one skeleton.
 *  Lossy: vav/yud are often consonantal, so two DIFFERENT short words can share
 *  a skeleton (בית→בת, מום→ממ, דין→דנ) — the caller gates skeleton matching on a
 *  minimum length so only long, low-collision skeletons are trusted. */
function hebrewSpellingSkeleton(word: string): string {
  return word.replace(/[וי]/g, '').replace(/[ךםןףץ]/g, (c) => HEBREW_FINAL_FORMS[c] ?? c);
}

/** Minimum skeleton length for a male/chaser match to count. Below this, the
 *  matres-stripping is too lossy — distinct short words collide (בית vs בת, מום
 *  vs מים, דין vs דן) — so short paren words must restate the term EXACTLY. The
 *  reported leaks (טרפה/טריפה, skeleton "טרפה") are well above this. */
const MIN_SKELETON_MATCH_LEN = 3;

/** Drop an all-Hebrew parenthetical that merely restates the Hebrew term before
 *  it (a redundant/duplicated gloss). Conservative: drop only when EVERY word in
 *  the paren already appears in the preceding term — exactly, OR (for long
 *  enough words) as a male/chaser spelling variant (same skeleton, e.g.
 *  "a טרפה (טריפה)" — defective inline, full in the paren). The observed failures
 *  are exact, spelling-variant, or padded repetitions like
 *  "מלא צואר (מלא צואר וחוץ לצואר)". A paren that introduces even one genuinely
 *  new word is a real clarification and is kept. Any closing quote in the gap is
 *  kept (it belongs to the term); only the paren and the whitespace that
 *  separated it are dropped. */
function dropHebrewGlossEchoes(text: string): string {
  return text.replace(HE_GLOSS_PAREN_RE, (m: string, term: string, gap: string, paren: string) => {
    const termWords = heKey(term).split(/\s+/).filter(Boolean);
    const parenWords = heKey(paren).split(/\s+/).filter(Boolean);
    if (parenWords.length === 0) return m;
    const termSet = new Set(termWords);
    // Only long skeletons are trusted for variant matching (see MIN_… above).
    const termSkeletons = new Set(
      termWords.map(hebrewSpellingSkeleton).filter((s) => s.length >= MIN_SKELETON_MATCH_LEN),
    );
    const addsNewWord = parenWords.some((w: string) => {
      if (termSet.has(w)) return false;
      const skel = hebrewSpellingSkeleton(w);
      return !(skel.length >= MIN_SKELETON_MATCH_LEN && termSkeletons.has(skel));
    });
    if (addsNewWord) return m;
    return term + gap.replace(/\s+/g, '');
  });
}

export function stripEchoParens(text: string): string {
  if (!text) return text;
  let prev = text;
  // Iterate: nested echoes (rare, but possible after the LLM cascades two
  // glosses) need a second pass to fully collapse.
  for (let i = 0; i < 3; i++) {
    let next = prev.replace(ECHO_PAREN_RE, '$1');
    next = next.replace(DOUBLE_PAREN_RE, '($1)');
    next = dropHebrewGlossEchoes(next);
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

/** Capitalize an English opening after formatting. Hebrew has no letter case. */
export function capitalizeFirst(text: string): string {
  if (!text) return text;
  const i = text.search(/[^\s'"“”‘’([]/);
  if (i < 0) return text;
  return text.slice(0, i) + text.charAt(i).toUpperCase() + text.slice(i + 1);
}

/** Read dictionary spellings without deciding paragraph order or touching an
 * existing Hebrew-first English gloss. Unknown text stays as written. */
export function prepareDisplayText(text: string): string {
  let out = text.replace(PAREN_RE, (full, inner: string, at: number) => {
    if (/[א-ת][\u0591-\u05C7"'׳״’”]*(?:['’]s)?\s*$/.test(text.slice(0, at))) return full;
    const heb = NORMALIZED_DICT[normalizeKey(inner)];
    return heb ? `(${heb})` : full;
  });
  out = out.replace(INVERTED_RE, (full, translit: string, gloss: string) => {
    const heb = NORMALIZED_DICT[normalizeKey(translit)];
    return heb ? `${heb} (${gloss})` : full;
  });
  return stripStopwordHebrewParens(out);
}
