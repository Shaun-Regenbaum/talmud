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

import { canonicalDictEntries } from '../lib/hebrewTerms';

const HEBRAIZE_DICT: Record<string, string> = {
  // HEBREW_GLOSS_STYLE "ALWAYS hebraize" core terms — single-sourced from
  // src/lib/hebrewTerms so the prompt's always-list and this dict can't drift.
  // Spread first; everything below is the long tail (sugya structure, places,
  // texts, codices) that lives only here.
  ...canonicalDictEntries(),
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

/** Bare-word hebraize whitelist — names of authorities + work titles that
 *  should be in Hebrew script whenever they appear, even outside parens.
 *  Curated CONSERVATIVELY: each entry must be unambiguous in halachic
 *  context. Generic religious terms ("Torah", "Mishnah", "Gemara",
 *  "Halacha") are deliberately excluded — they flow naturally as English
 *  in this corpus and bare-swapping would hurt readability. Multi-word
 *  entries are matched first via longest-first sort so "Mishneh Torah"
 *  wins over a hypothetical bare "Torah" entry. */
const BARE_HEBRAIZE_NAMES: Record<string, string> = {
  // Halachic authorities
  Rambam: 'רמב״ם',
  Ramban: 'רמב״ן',
  Rashba: 'רשב״א',
  Ritva: 'ריטב״א',
  Rashi: 'רש״י',
  Tosafot: 'תוספות',
  Tosfos: 'תוספות',
  Meiri: 'מאירי',
  Maharsha: 'מהרש״א',
  Rema: 'רמ״א',
  Tur: 'טור',
  Rosh: 'רא״ש',
  // Work titles (multi-word — listed alongside their spelling variants).
  'Mishneh Torah': 'משנה תורה',
  'Shulchan Aruch': 'שולחן ערוך',
  'Orach Chaim': 'אורח חיים',
  'Orach Chayim': 'אורח חיים',
  'Orach Chayyim': 'אורח חיים',
  'Yoreh Deah': 'יורה דעה',
  'Even HaEzer': 'אבן העזר',
  'Even Ha-Ezer': 'אבן העזר',
  'Choshen Mishpat': 'חושן משפט',
  // Halachic procedures (unambiguous in this corpus).
  melikah: 'מליקה',
  melikha: 'מליקה',
  shechita: 'שחיטה',
  shechitah: 'שחיטה',
  chalitza: 'חליצה',
  chalitzah: 'חליצה',
  yibum: 'יבום',
  // Kashrut categories.
  neveilah: 'נבלה',
  neveila: 'נבלה',
  nevelah: 'נבלה',
  treif: 'טריפה',
  treifa: 'טריפה',
  trefah: 'טריפה',
  // Sacrifices.
  chatat: 'חטאת',
  asham: 'אשם',
  korban: 'קרבן',
  korbanot: 'קרבנות',
  // Marriage / family.
  ketubah: 'כתובה',
  ketuba: 'כתובה',
  // Priestly portions / firstborn.
  challah: 'חלה',
  challa: 'חלה',
  pidyon: 'פדיון',
  bechor: 'בכור',
  bekhor: 'בכור',
  // Concluding / collective sages.
  siyum: 'סיום',
  Chazal: 'חז״ל',
  Hazal: 'חז״ל',
  // Generation labels.
  amoraim: 'אמוראים',
  tannaim: 'תנאים',
  rishonim: 'ראשונים',
  acharonim: 'אחרונים',
  // Discourse / argument terms.
  baraita: 'ברייתא',
  baraitot: 'ברייתות',
  kushya: 'קושיא',
  terutz: 'תירוץ',
};

/** Lowercase lookup for case-insensitive match. */
const BARE_NAMES_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.entries(BARE_HEBRAIZE_NAMES).map(([k, v]) => [k.toLowerCase(), v]),
);

/** Names with collision potential — exclude via negative lookahead. `Rosh`
 *  also means a holiday qualifier ("Rosh Hashanah", "Rosh Chodesh"); never
 *  swap in those contexts. */
const BARE_NAMES_KEYS_SORTED = Object.keys(BARE_HEBRAIZE_NAMES).sort((a, b) => b.length - a.length);
const BARE_NAMES_ALT = BARE_NAMES_KEYS_SORTED.map((k) => {
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (k === 'Rosh') {
    return `${esc}(?!\\s+(?:Hashanah|HaShanah|Hashana|HaShana|Chodesh|Hodesh|HaShana))`;
  }
  return esc;
}).join('|');
const BARE_NAMES_RE = new RegExp(`\\b(${BARE_NAMES_ALT})\\b`, 'gi');

/** Replace bare-word occurrences of whitelisted authorities and work titles
 *  with their Hebrew script. Case-insensitive; word-boundary on both sides
 *  prevents mid-word matches ("torture" never matches "tor"). Multi-word
 *  entries match first (longest-first sort), so "Mishneh Torah" wins. */
export function hebraizeBareNames(text: string): string {
  if (!text) return text;
  return text.replace(BARE_NAMES_RE, (match) => BARE_NAMES_LOOKUP[match.toLowerCase()] ?? match);
}

/** Function words that, when immediately preceding a pure-Hebrew parens
 *  group, mark the parens as a redundant mid-phrase interjection rather
 *  than a Form B gloss. `the (מליקה) procedure` has "the" before — strip.
 *  `procedure (מליקה)` has "procedure" before (content word, not in list)
 *  — keep, because parens correctly hold the Hebrew gloss for "procedure". */
const PAREN_STRIP_STOPWORDS = [
  // Articles
  'the', 'a', 'an',
  // Possessive determiners — behave like articles before a noun.
  'his', 'her', 'its', 'their', 'our', 'my', 'your',
  // Demonstratives
  'this', 'that', 'these', 'those',
  // Prepositions
  'of', 'in', 'on', 'at', 'by', 'for', 'with', 'to', 'from', 'as',
  'into', 'onto', 'upon', 'against', 'between', 'among', 'through',
  'over', 'under', 'before', 'after', 'about',
  // Conjunctions
  'and', 'or', 'but', 'nor', 'so', 'yet',
];

/** Match: `<stopword><space>(Hebrew content)` — and strip just the parens.
 *  Hebrew content can include nikud, gershayim, and basic Hebrew-adjacent
 *  punctuation (commas, periods, colons used in verse refs). */
const STOPWORD_HEB_PAREN_RE = new RegExp(
  `(\\b(?:${PAREN_STRIP_STOPWORDS.join('|')})\\s+)\\(([֐-׿][֐-׿װ-״\\s'\".,:;-]*)\\)`,
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
  `([${HE}][${HE}\\u05BE\\u05F3\\u05F4 -]*?)([${GLOSS_GAP}]*)\\(\\s*([${HE}][${HE}\\u05BE\\u05F3\\u05F4 ]*)\\)`,
  'g',
);

/** Drop an all-Hebrew parenthetical that merely restates the Hebrew term before
 *  it (a redundant/duplicated gloss). Conservative: drop only when EVERY word in
 *  the paren already appears in the preceding term — i.e. it adds no new
 *  information (the observed failures are exact or padded repetitions like
 *  "מלא צואר (מלא צואר וחוץ לצואר)"). A paren that introduces even one new word
 *  is a real clarification and is kept. Any closing quote in the gap is kept (it
 *  belongs to the term); only the paren and the whitespace that separated it
 *  are dropped. */
function dropHebrewGlossEchoes(text: string): string {
  return text.replace(HE_GLOSS_PAREN_RE, (m: string, term: string, gap: string, paren: string) => {
    const termWords = new Set(term.trim().split(/\s+/).filter(Boolean));
    const parenWords = paren.trim().split(/\s+/).filter(Boolean);
    if (parenWords.length === 0) return m;
    const addsNewWord = parenWords.some((w: string) => !termWords.has(w));
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
    next = dropHebrewGlossEchoes(next);
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

/** Capitalize the first cased letter of a phrase, skipping leading quotes,
 *  parens, and whitespace. Hebrew script has no case, so a phrase that opens
 *  with Hebrew is returned unchanged (`toUpperCase` is a no-op there). Used
 *  for the appliesWhen / exceptions chips, which the LLM emits lowercase but
 *  which render as standalone scannable labels — "locking a door on Shabbat"
 *  should read "Locking a door on Shabbat". Apply AFTER hebraize() so the
 *  inverted pass (which can move an English gloss to the front) doesn't strand
 *  a lowercased word at the start. */
/** True if `text` contains an empty parenthetical — `()` or `(  )`. The LLM
 *  hebraize fallback can empty a paren it couldn't resolve (e.g. an English
 *  name like `(Rabbi Eliezer)` → `()`); callers use this to reject such a
 *  result and keep the paren-preserving dict pass. Pure + exported for tests. */
export function hasEmptyParens(text: string): boolean {
  return /\(\s*\)/.test(text);
}

export function capitalizeFirst(text: string): string {
  if (!text) return text;
  const i = text.search(/[^\s'"“”‘’(\[]/);
  if (i < 0) return text;
  return text.slice(0, i) + text.charAt(i).toUpperCase() + text.slice(i + 1);
}

/** Scan `text` for two formats:
 *   1. `english (transliteration)` → `english (עברית)`
 *   2. `transliteration (english gloss)` → `english gloss (עברית)`
 *  Anything else (verse refs, dates, English-only asides) is unchanged.
 *  Then bare-swap whitelisted authority/work names. Finally, collapse
 *  echo-parens (`X (X)` → `X`).
 */
export function hebraize(text: string): string {
  if (!text) return text;
  // Pass 1: standard `english (transliteration)` form.
  let out = text.replace(PAREN_RE, (full, inner: string) => {
    const heb = NORMALIZED_DICT[normalizeKey(inner)];
    return heb ? `(${heb})` : full;
  });
  // Pass 2: inverted `transliteration (english gloss)` form. Only swap when
  // the inside-parens text is plain Latin (no Hebrew, no digits) so we don't
  // mangle things like "Shabbat 31a" or "Mishneh Torah (Hilchot Shabbat 8:1)".
  out = out.replace(INVERTED_RE, (full, translit: string, gloss: string) => {
    const heb = NORMALIZED_DICT[normalizeKey(translit)];
    if (!heb) return full;
    if (/[֐-׿\d]/.test(gloss)) return full;
    return `${gloss} (${heb})`;
  });
  // Pass 3: bare-word swap for halachic authorities and work titles. Runs
  // BEFORE echo-strip so that any echoes the bare-swap creates get caught.
  out = hebraizeBareNames(out);
  // Pass 4: strip pure-Hebrew parens preceded by a function word — these
  // are mid-phrase interjections, not Form B glosses. `the (מליקה)
  // procedure` → `the מליקה procedure`. Content-word-preceded parens
  // (real Form B like `Tanna (תנא)`) are kept.
  out = stripStopwordHebrewParens(out);
  // Pass 5: collapse echo-parens. Runs AFTER the dict passes so that a
  // dict-promoted Hebrew matching its English equivalent gets collapsed too.
  out = stripEchoParens(out);
  return out;
}

/** Same as `hebraize` but also returns whether anything was replaced. */
export function hebraizeWithFlag(text: string): { text: string; replaced: number } {
  let replaced = 0;
  if (!text) return { text, replaced };
  const out = text.replace(PAREN_RE, (full, inner: string) => {
    const heb = NORMALIZED_DICT[normalizeKey(inner)];
    if (heb) { replaced++; return `(${heb})`; }
    return full;
  });
  return { text: out, replaced };
}

/** Returns the parenthesized substrings that the static dict couldn't resolve.
 *  The LLM hebraize endpoint only needs to be invoked when this list is
 *  non-empty — otherwise the dict pass alone is sufficient. */
export function unresolvedParens(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(PAREN_RE)) {
    const inner = m[1];
    if (!NORMALIZED_DICT[normalizeKey(inner)]) out.push(inner);
  }
  return out;
}

/** LLM-driven hebraize for the long tail (composite phrases, slash-separated
 *  alternatives, unusual academic spellings). Hits /api/hebraize, which
 *  KV-caches by content hash + double-buffers via the AI Gateway prompt
 *  cache, so repeat calls on the same text are instant + free.
 *  Returns the input unchanged on any error so callers can render fall-back
 *  via the dict pass. */
export async function hebraizeLLM(text: string): Promise<string> {
  if (!text) return text;
  try {
    const res = await fetch('/api/hebraize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return text;
    const body = await res.json() as { hebraized?: string; error?: string };
    return body.hebraized ?? text;
  } catch {
    return text;
  }
}
