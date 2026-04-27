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

const HEBRAIZE_DICT: Record<string, string> = {
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

/** Bare-word lookup for the inverted-format pass. Built once from the
 *  normalized dict, escaped for regex, longest first so multi-word phrases
 *  win over their single-word substrings. */
const BARE_KEYS_SORTED = Object.keys(NORMALIZED_DICT).sort((a, b) => b.length - a.length);
const ESCAPED_KEYS = BARE_KEYS_SORTED.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
// Match "<known-transliteration> (english gloss)" — bare transliteration
// outside parens followed by a Latin-only gloss inside parens. Word boundary
// on the left, no leading letter to avoid mid-word matches.
const INVERTED_RE = new RegExp(
  `(?<![A-Za-zÀ-ſḀ-ỿ])(${ESCAPED_KEYS.join('|')})\\s*\\(([A-Za-z][A-Za-z \\-./']{1,40})\\)`,
  'gi',
);

/** Scan `text` for two formats:
 *   1. `english (transliteration)` → `english (עברית)`
 *   2. `transliteration (english gloss)` → `english gloss (עברית)`
 *  Anything else (verse refs, dates, English-only asides) is unchanged.
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
