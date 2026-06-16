/**
 * Canonical "ALWAYS hebraize" term list — the single source of truth shared by
 * the generation prompt (HEBREW_GLOSS_STYLE in src/worker/code-marks.ts) and
 * the deterministic render-time backstop (HEBRAIZE_DICT in
 * src/client/hebraize.ts).
 *
 * Before this module existed the list was duplicated: the prompt told the LLM
 * to gloss ~40 terms, and the client dict independently re-listed them so the
 * backstop could repair stray transliteration. The two drifted — the prompt
 * promised `pidyon haben` and `sheva mitzvot bnei Noach` but the dict had
 * neither, so when the LLM disobeyed those terms slipped through untouched.
 *
 * Now both derive from CANONICAL_HEBREW_TERMS:
 *   - alwaysHebraizeBlock() builds the prompt's bullet list.
 *   - canonicalDictEntries() builds the translit→Hebrew pairs the dict spreads.
 * Adding a term in one place lights it up in both, and the drift-guard test
 * (tests/hebrew-terms.test.ts) fails if either consumer falls out of sync.
 */

/** Reader-facing display policy for a term. Authored per-term so the same term
 *  renders the same way on every daf instead of being re-decided per generation.
 *  Consumed by the first-mention gloss pass (PR3 of the terms-registry rework);
 *  not yet wired, so today's output is unchanged.
 *    - 'hebrew': the Hebrew script is the term surface in prose.
 *    - 'english': the English label (`en`) is the surface; Hebrew is parenthetical/tooltip.
 *    - 'hebrew-first-gloss': Hebrew surface, English gloss on first mention only. */
export type TermDisplay = 'hebrew' | 'english' | 'hebrew-first-gloss';

/** Glossary grouping, aligned with the daf-background.concepts categories so the
 *  global list and the per-daf list share one taxonomy. */
export type TermCategory = 'legal-concepts' | 'realia' | 'assumed-prior';

export interface CanonicalHebrewTerm {
  /** Canonical romanization, shown verbatim in the prompt's always-list. */
  translit: string;
  /** Hebrew script — the canonical anchor the LLM and the dict both target. */
  hebrew: string;
  /** Short English meaning, shown as the parenthetical gloss in the prompt. */
  gloss: string;
  /** Short Hebrew meaning — the gloss/tooltip surface in Hebrew mode, so a
   *  Hebrew reader hovering a term gets a Hebrew explanation rather than the
   *  English `gloss`. Required so every term carries both. */
  glossHe: string;
  /** Alternate romanizations the client dict must also resolve to `hebrew`.
   *  Only spellings that DON'T already collapse under normalizeKey (which
   *  folds ch/kh/ḥ and strips apostrophes/diacritics) need listing here. */
  variants?: string[];
  /** Per-term display policy. Required so every canonical term carries an
   *  explicit, auditable verdict. */
  display: TermDisplay;
  /** English surface to show in prose when `display === 'english'`. */
  en?: string;
  /** Optional glossary grouping (left unset on most globals for now; the
   *  per-daf concepts carry their own category). */
  category?: TermCategory;
}

/** Ordered exactly as the prompt presents them, so the generated bullet list
 *  reads in the same sequence a human author would expect. */
export const CANONICAL_HEBREW_TERMS: readonly CanonicalHebrewTerm[] = [
  {
    translit: 'lechatchila',
    hebrew: 'לכתחילה',
    gloss: 'the ideal standard / a-priori',
    glossHe: 'מראש, באופן הראוי',
    variants: ['le-chatchila'],
    display: 'hebrew',
  },
  {
    translit: 'bedieved',
    hebrew: 'בדיעבד',
    gloss: 'after the fact',
    glossHe: 'לאחר מעשה',
    variants: ['bediavad', 'be-dieved'],
    display: 'hebrew',
  },
  {
    translit: 'mitzvah',
    hebrew: 'מצוה',
    gloss: 'commandment',
    glossHe: 'ציווי מן התורה או מדרבנן',
    display: 'hebrew',
  },
  {
    translit: 'halacha',
    hebrew: 'הלכה',
    gloss: 'binding law',
    glossHe: 'דין מחייב',
    variants: ['halakhah'],
    display: 'hebrew',
  },
  {
    translit: 'sugya',
    hebrew: 'סוגיא',
    gloss: 'Talmudic discussion',
    glossHe: 'דיון תלמודי',
    variants: ['sugiya'],
    display: 'hebrew',
  },
  {
    translit: 'psak',
    hebrew: 'פסק',
    gloss: 'ruling',
    glossHe: 'הכרעת הדין',
    variants: ['pesak'],
    display: 'hebrew',
  },
  {
    translit: 'rov',
    hebrew: 'רוב',
    gloss: 'majority principle',
    glossHe: 'הליכה אחר הרוב',
    display: 'hebrew',
  },
  {
    translit: 'chazaka',
    hebrew: 'חזקה',
    gloss: 'presumption',
    glossHe: 'הנחה על פי מצב קודם',
    variants: ['chazakah'],
    display: 'hebrew',
  },
  { translit: 'safek', hebrew: 'ספק', gloss: 'doubt', glossHe: 'מצב של ספק', display: 'hebrew' },
  {
    translit: "tum'ah",
    hebrew: 'טומאה',
    gloss: 'ritual impurity',
    glossHe: 'טומאה הלכתית',
    display: 'hebrew',
  },
  {
    translit: 'tahara',
    hebrew: 'טהרה',
    gloss: 'ritual purity',
    glossHe: 'טהרה הלכתית',
    variants: ['taharah'],
    display: 'hebrew',
  },
  {
    translit: 'terumah',
    hebrew: 'תרומה',
    gloss: 'priestly portion',
    glossHe: 'מתנה לכהן מן התבואה',
    variants: ['teruma'],
    display: 'hebrew',
  },
  {
    translit: 'maaser',
    hebrew: 'מעשר',
    gloss: 'tithe',
    glossHe: 'עישור מן התבואה',
    variants: ["ma'aser"],
    display: 'hebrew',
  },
  {
    translit: 'chametz',
    hebrew: 'חמץ',
    gloss: 'leaven',
    glossHe: 'מאכל מחמיץ האסור בפסח',
    variants: ['hametz'],
    display: 'hebrew',
  },
  {
    translit: 'matzah',
    hebrew: 'מצה',
    gloss: 'unleavened bread',
    glossHe: 'לחם שלא החמיץ',
    variants: ['matza'],
    display: 'hebrew',
  },
  {
    translit: 'treif',
    hebrew: 'טריפה',
    gloss: 'ritually unfit',
    glossHe: 'בהמה פסולה לאכילה מחמת מום',
    variants: ['trefah'],
    display: 'hebrew',
  },
  {
    translit: 'kosher',
    hebrew: 'כשר',
    gloss: 'ritually fit',
    glossHe: 'ראוי וכשר על פי ההלכה',
    variants: ['kasher'],
    display: 'english',
    en: 'kosher',
  },
  { translit: 'pesach', hebrew: 'פסח', gloss: 'Passover', glossHe: 'חג הפסח', display: 'hebrew' },
  { translit: 'shabbat', hebrew: 'שבת', gloss: 'Sabbath', glossHe: 'יום השבת', display: 'hebrew' },
  {
    translit: 'yom tov',
    hebrew: 'יום טוב',
    gloss: 'festival day',
    glossHe: 'יום חג',
    display: 'hebrew',
  },
  {
    translit: 'bracha',
    hebrew: 'ברכה',
    gloss: 'blessing',
    glossHe: 'נוסח שבח והודיה',
    display: 'hebrew',
  },
  {
    translit: 'tefillah',
    hebrew: 'תפילה',
    gloss: 'prayer',
    glossHe: 'עבודה שבלב',
    display: 'hebrew',
  },
  {
    translit: 'tzitzit',
    hebrew: 'ציצית',
    gloss: 'ritual fringes',
    glossHe: 'חוטי הכנף שבבגד',
    display: 'hebrew',
  },
  {
    translit: 'tefillin',
    hebrew: 'תפילין',
    gloss: 'phylacteries',
    glossHe: 'בתי פרשיות הנקשרים על היד והראש',
    display: 'hebrew',
  },
  {
    translit: 'bet din',
    hebrew: 'בית דין',
    gloss: 'court',
    glossHe: 'בית דין הלכתי',
    variants: ['beit din'],
    display: 'english',
    en: 'court',
  },
  {
    translit: 'eved',
    hebrew: 'עבד',
    gloss: 'slave',
    glossHe: 'עבד הקנוי לאדונו',
    display: 'english',
    en: 'slave',
  },
  {
    translit: 'get',
    hebrew: 'גט',
    gloss: 'bill of divorce',
    glossHe: 'שטר גירושין',
    display: 'hebrew',
  },
  {
    translit: 'kiddushin',
    hebrew: 'קידושין',
    gloss: 'betrothal',
    glossHe: 'אירוסין, קניין האישה לנישואין',
    display: 'hebrew',
  },
  {
    translit: 'chayav',
    hebrew: 'חייב',
    gloss: 'liable / obligated',
    glossHe: 'חייב או מחויב',
    display: 'hebrew',
  },
  { translit: 'patur', hebrew: 'פטור', gloss: 'exempt', glossHe: 'פטור מחיוב', display: 'hebrew' },
  {
    translit: 'asur',
    hebrew: 'אסור',
    gloss: 'forbidden',
    glossHe: 'אסור על פי ההלכה',
    display: 'hebrew',
  },
  {
    translit: 'mutar',
    hebrew: 'מותר',
    gloss: 'permitted',
    glossHe: 'מותר על פי ההלכה',
    display: 'hebrew',
  },
  {
    translit: 'rov basar',
    hebrew: 'רוב בשר',
    gloss: 'majority of surrounding flesh — shechita / neveila threshold',
    glossHe: 'רוב הבשר המקיף — סף שחיטה ונבילה',
    variants: ['rov besar'],
    display: 'hebrew',
  },
  {
    translit: 'mafreket',
    hebrew: 'מפרקת',
    gloss: 'spinal column / nape — neveila context',
    glossHe: 'עצם העורף — בהקשר נבילה',
    display: 'hebrew',
  },
  {
    translit: 'siman',
    hebrew: 'סימן',
    gloss: 'a shechita organ (trachea / esophagus)',
    glossHe: 'אבר השחיטה (קנה או ושט)',
    display: 'hebrew',
  },
  {
    translit: 'simanim',
    hebrew: 'סימנים',
    gloss: 'the shechita organs (trachea + esophagus)',
    glossHe: 'אברי השחיטה (קנה וושט)',
    display: 'hebrew',
  },
  { translit: 'veshet', hebrew: 'ושט', gloss: 'esophagus', glossHe: 'הוושט', display: 'hebrew' },
  {
    translit: 'kaneh',
    hebrew: 'קנה',
    gloss: 'trachea / windpipe',
    glossHe: 'קנה הנשימה',
    display: 'hebrew',
  },
  {
    translit: 'bnei Noach',
    hebrew: 'בני נח',
    gloss: 'Noahides — NEVER "sons of Noah"',
    glossHe: 'בני נח, אומות העולם',
    variants: ['bnei noah'],
    display: 'hebrew',
  },
  {
    translit: 'sheva mitzvot bnei Noach',
    hebrew: 'שבע מצוות בני נח',
    gloss: 'Noahide laws — NEVER "seven commandments of the sons of Noah"',
    glossHe: 'שבע המצוות שנצטוו בהן כל בני האדם',
    variants: ['sheva mitzvot bnei noah'],
    display: 'hebrew',
  },
  {
    translit: 'ben shnato',
    hebrew: 'בן שנתו',
    gloss: 'a one-year-old [animal] — NEVER "son of his year"',
    glossHe: 'בהמה בת שנה',
    variants: ['ben shenato'],
    display: 'hebrew',
  },
  {
    translit: 'bekhor',
    hebrew: 'בכור',
    gloss: 'firstborn',
    glossHe: 'הוולד הראשון',
    variants: ['bechor'],
    display: 'hebrew',
  },
  {
    translit: 'pidyon haben',
    hebrew: 'פדיון הבן',
    gloss: 'redemption of the firstborn son',
    glossHe: 'פדיון הבן הבכור',
    display: 'hebrew',
  },
];

/** Flatten to the translit→Hebrew pairs the client dict spreads in. Keys are
 *  lowercased to match the dict's existing convention; the dict's own
 *  normalizeKey() handles apostrophe / ch-kh-ḥ folding on top of these. */
export function canonicalDictEntries(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of CANONICAL_HEBREW_TERMS) {
    out[t.translit.toLowerCase()] = t.hebrew;
    for (const v of t.variants ?? []) out[v.toLowerCase()] = t.hebrew;
  }
  return out;
}

/** Build the prompt's "ALWAYS hebraize" bullet block — one indented line per
 *  term, rendered in the term's own display orientation so the canonical list
 *  doesn't contradict the per-term `display` policy:
 *    - hebrew-first (Form A): `translit → hebrew (gloss)`
 *    - english-first (Form B): `en (hebrew)`
 *  Column alignment is cosmetic and intentionally dropped; the LLM reads
 *  content, not whitespace. */
export function alwaysHebraizeBlock(): string {
  return CANONICAL_HEBREW_TERMS.map((t) =>
    t.display === 'english' && t.en
      ? `    ${t.en} (${t.hebrew})`
      : `    ${t.translit} → ${t.hebrew} (${t.gloss})`,
  ).join('\n');
}
