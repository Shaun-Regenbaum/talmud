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
  { translit: 'lechatchila', hebrew: 'לכתחילה', gloss: 'the ideal standard / a-priori', variants: ['le-chatchila'], display: 'hebrew' },
  { translit: 'bedieved', hebrew: 'בדיעבד', gloss: 'after the fact', variants: ['bediavad', 'be-dieved'], display: 'hebrew' },
  { translit: 'mitzvah', hebrew: 'מצוה', gloss: 'commandment', display: 'hebrew' },
  { translit: 'halacha', hebrew: 'הלכה', gloss: 'binding law', variants: ['halakhah'], display: 'hebrew' },
  { translit: 'sugya', hebrew: 'סוגיא', gloss: 'Talmudic discussion', variants: ['sugiya'], display: 'hebrew' },
  { translit: 'psak', hebrew: 'פסק', gloss: 'ruling', variants: ['pesak'], display: 'hebrew' },
  { translit: 'rov', hebrew: 'רוב', gloss: 'majority principle', display: 'hebrew' },
  { translit: 'chazaka', hebrew: 'חזקה', gloss: 'presumption', variants: ['chazakah'], display: 'hebrew' },
  { translit: 'safek', hebrew: 'ספק', gloss: 'doubt', display: 'hebrew' },
  { translit: "tum'ah", hebrew: 'טומאה', gloss: 'ritual impurity', display: 'hebrew' },
  { translit: 'tahara', hebrew: 'טהרה', gloss: 'ritual purity', variants: ['taharah'], display: 'hebrew' },
  { translit: 'terumah', hebrew: 'תרומה', gloss: 'priestly portion', variants: ['teruma'], display: 'hebrew' },
  { translit: 'maaser', hebrew: 'מעשר', gloss: 'tithe', variants: ["ma'aser"], display: 'hebrew' },
  { translit: 'chametz', hebrew: 'חמץ', gloss: 'leaven', variants: ['hametz'], display: 'hebrew' },
  { translit: 'matzah', hebrew: 'מצה', gloss: 'unleavened bread', variants: ['matza'], display: 'hebrew' },
  { translit: 'treif', hebrew: 'טריפה', gloss: 'ritually unfit', variants: ['trefah'], display: 'hebrew' },
  { translit: 'kosher', hebrew: 'כשר', gloss: 'ritually fit', variants: ['kasher'], display: 'english', en: 'kosher' },
  { translit: 'pesach', hebrew: 'פסח', gloss: 'Passover', display: 'hebrew' },
  { translit: 'shabbat', hebrew: 'שבת', gloss: 'Sabbath', display: 'hebrew' },
  { translit: 'yom tov', hebrew: 'יום טוב', gloss: 'festival day', display: 'hebrew' },
  { translit: 'bracha', hebrew: 'ברכה', gloss: 'blessing', display: 'hebrew' },
  { translit: 'tefillah', hebrew: 'תפילה', gloss: 'prayer', display: 'hebrew' },
  { translit: 'tzitzit', hebrew: 'ציצית', gloss: 'ritual fringes', display: 'hebrew' },
  { translit: 'tefillin', hebrew: 'תפילין', gloss: 'phylacteries', display: 'hebrew' },
  { translit: 'bet din', hebrew: 'בית דין', gloss: 'court', variants: ['beit din'], display: 'english', en: 'court' },
  { translit: 'eved', hebrew: 'עבד', gloss: 'slave', display: 'english', en: 'slave' },
  { translit: 'get', hebrew: 'גט', gloss: 'bill of divorce', display: 'hebrew' },
  { translit: 'kiddushin', hebrew: 'קידושין', gloss: 'betrothal', display: 'hebrew' },
  { translit: 'chayav', hebrew: 'חייב', gloss: 'liable / obligated', display: 'hebrew' },
  { translit: 'patur', hebrew: 'פטור', gloss: 'exempt', display: 'hebrew' },
  { translit: 'asur', hebrew: 'אסור', gloss: 'forbidden', display: 'hebrew' },
  { translit: 'mutar', hebrew: 'מותר', gloss: 'permitted', display: 'hebrew' },
  { translit: 'rov basar', hebrew: 'רוב בשר', gloss: 'majority of surrounding flesh — shechita / neveila threshold', variants: ['rov besar'], display: 'hebrew' },
  { translit: 'mafreket', hebrew: 'מפרקת', gloss: 'spinal column / nape — neveila context', display: 'hebrew' },
  { translit: 'siman', hebrew: 'סימן', gloss: 'a shechita organ (trachea / esophagus)', display: 'hebrew' },
  { translit: 'simanim', hebrew: 'סימנים', gloss: 'the shechita organs (trachea + esophagus)', display: 'hebrew' },
  { translit: 'veshet', hebrew: 'ושט', gloss: 'esophagus', display: 'hebrew' },
  { translit: 'kaneh', hebrew: 'קנה', gloss: 'trachea / windpipe', display: 'hebrew' },
  { translit: 'bnei Noach', hebrew: 'בני נח', gloss: 'Noahides — NEVER "sons of Noah"', variants: ['bnei noah'], display: 'hebrew' },
  { translit: 'sheva mitzvot bnei Noach', hebrew: 'שבע מצוות בני נח', gloss: 'Noahide laws — NEVER "seven commandments of the sons of Noah"', variants: ['sheva mitzvot bnei noah'], display: 'hebrew' },
  { translit: 'ben shnato', hebrew: 'בן שנתו', gloss: 'a one-year-old [animal] — NEVER "son of his year"', variants: ['ben shenato'], display: 'hebrew' },
  { translit: 'bekhor', hebrew: 'בכור', gloss: 'firstborn', variants: ['bechor'], display: 'hebrew' },
  { translit: 'pidyon haben', hebrew: 'פדיון הבן', gloss: 'redemption of the firstborn son', display: 'hebrew' },
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

/** Build the prompt's "ALWAYS hebraize" bullet block — one indented
 *  `translit → hebrew (gloss)` line per term. Column alignment is cosmetic and
 *  intentionally dropped; the LLM reads content, not whitespace. */
export function alwaysHebraizeBlock(): string {
  return CANONICAL_HEBREW_TERMS
    .map((t) => `    ${t.translit} → ${t.hebrew} (${t.gloss})`)
    .join('\n');
}
