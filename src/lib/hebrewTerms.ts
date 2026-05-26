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
}

/** Ordered exactly as the prompt presents them, so the generated bullet list
 *  reads in the same sequence a human author would expect. */
export const CANONICAL_HEBREW_TERMS: readonly CanonicalHebrewTerm[] = [
  { translit: 'lechatchila', hebrew: 'לכתחילה', gloss: 'the ideal standard / a-priori', variants: ['le-chatchila'] },
  { translit: 'bedieved', hebrew: 'בדיעבד', gloss: 'after the fact', variants: ['bediavad', 'be-dieved'] },
  { translit: 'mitzvah', hebrew: 'מצוה', gloss: 'commandment' },
  { translit: 'halacha', hebrew: 'הלכה', gloss: 'binding law', variants: ['halakhah'] },
  { translit: 'sugya', hebrew: 'סוגיא', gloss: 'Talmudic discussion', variants: ['sugiya'] },
  { translit: 'psak', hebrew: 'פסק', gloss: 'ruling', variants: ['pesak'] },
  { translit: 'rov', hebrew: 'רוב', gloss: 'majority principle' },
  { translit: 'chazaka', hebrew: 'חזקה', gloss: 'presumption', variants: ['chazakah'] },
  { translit: 'safek', hebrew: 'ספק', gloss: 'doubt' },
  { translit: "tum'ah", hebrew: 'טומאה', gloss: 'ritual impurity' },
  { translit: 'tahara', hebrew: 'טהרה', gloss: 'ritual purity', variants: ['taharah'] },
  { translit: 'terumah', hebrew: 'תרומה', gloss: 'priestly portion', variants: ['teruma'] },
  { translit: 'maaser', hebrew: 'מעשר', gloss: 'tithe', variants: ["ma'aser"] },
  { translit: 'chametz', hebrew: 'חמץ', gloss: 'leaven', variants: ['hametz'] },
  { translit: 'matzah', hebrew: 'מצה', gloss: 'unleavened bread', variants: ['matza'] },
  { translit: 'treif', hebrew: 'טריפה', gloss: 'ritually unfit', variants: ['trefah'] },
  { translit: 'kosher', hebrew: 'כשר', gloss: 'ritually fit', variants: ['kasher'] },
  { translit: 'pesach', hebrew: 'פסח', gloss: 'Passover' },
  { translit: 'shabbat', hebrew: 'שבת', gloss: 'Sabbath' },
  { translit: 'yom tov', hebrew: 'יום טוב', gloss: 'festival day' },
  { translit: 'bracha', hebrew: 'ברכה', gloss: 'blessing' },
  { translit: 'tefillah', hebrew: 'תפילה', gloss: 'prayer' },
  { translit: 'tzitzit', hebrew: 'ציצית', gloss: 'ritual fringes' },
  { translit: 'tefillin', hebrew: 'תפילין', gloss: 'phylacteries' },
  { translit: 'bet din', hebrew: 'בית דין', gloss: 'court', variants: ['beit din'] },
  { translit: 'eved', hebrew: 'עבד', gloss: 'slave' },
  { translit: 'get', hebrew: 'גט', gloss: 'bill of divorce' },
  { translit: 'kiddushin', hebrew: 'קידושין', gloss: 'betrothal' },
  { translit: 'chayav', hebrew: 'חייב', gloss: 'liable / obligated' },
  { translit: 'patur', hebrew: 'פטור', gloss: 'exempt' },
  { translit: 'asur', hebrew: 'אסור', gloss: 'forbidden' },
  { translit: 'mutar', hebrew: 'מותר', gloss: 'permitted' },
  { translit: 'rov basar', hebrew: 'רוב בשר', gloss: 'majority of surrounding flesh — shechita / neveila threshold', variants: ['rov besar'] },
  { translit: 'mafreket', hebrew: 'מפרקת', gloss: 'spinal column / nape — neveila context' },
  { translit: 'siman', hebrew: 'סימן', gloss: 'a shechita organ (trachea / esophagus)' },
  { translit: 'simanim', hebrew: 'סימנים', gloss: 'the shechita organs (trachea + esophagus)' },
  { translit: 'veshet', hebrew: 'ושט', gloss: 'esophagus' },
  { translit: 'kaneh', hebrew: 'קנה', gloss: 'trachea / windpipe' },
  { translit: 'bnei Noach', hebrew: 'בני נח', gloss: 'Noahides — NEVER "sons of Noah"', variants: ['bnei noah'] },
  { translit: 'sheva mitzvot bnei Noach', hebrew: 'שבע מצוות בני נח', gloss: 'Noahide laws — NEVER "seven commandments of the sons of Noah"', variants: ['sheva mitzvot bnei noah'] },
  { translit: 'ben shnato', hebrew: 'בן שנתו', gloss: 'a one-year-old [animal] — NEVER "son of his year"', variants: ['ben shenato'] },
  { translit: 'bekhor', hebrew: 'בכור', gloss: 'firstborn', variants: ['bechor'] },
  { translit: 'pidyon haben', hebrew: 'פדיון הבן', gloss: 'redemption of the firstborn son' },
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
