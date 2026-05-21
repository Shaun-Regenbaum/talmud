/**
 * Deterministic linter for pesukim synthesis output. Catches the regression
 * where the LLM cites a pasuk with an English translation but no Hebrew
 * verbatim text — the rule says Hebrew script is the canonical anchor and
 * English is optional gloss.
 *
 * Failure modes observed in cached output:
 *   1. "Tehillim 119:62 states, 'At midnight I will rise to give thanks…'"
 *      → English quote follows the ref, no Hebrew anywhere in the sentence.
 *   2. "Tehillim 119:148 ('My eyes preceded the watches')"
 *      → English in parens after the ref, no Hebrew.
 *
 * Both share the signature: verse ref + English quote nearby + no Hebrew
 * within the surrounding window. Bare references like "the discussion of
 * Tehillim 119:62 follows" (no quote at all) are NOT flagged — those are
 * legit prose citations.
 */

/** One flagged citation. Carries the matched ref + position so callers can
 *  highlight or auto-repair. */
export interface PasukCitationIssue {
  kind: 'missing-hebrew-excerpt';
  match: string;
  index: number;
  book: string;
  chapter: number;
  verse: number;
}

// Yeshivish-traditional Tanach book names. Matches what TANACH_NAMING_STYLE
// asks the LLM to emit. Christian-English names ("Psalms", "Deuteronomy")
// would be a separate, naming-style violation — out of scope for this lint.
const TANACH_BOOKS = [
  // Chumash
  'Bereishit', 'Shemot', 'Vayikra', 'Bamidbar', 'Devarim',
  // Nevi'im
  'Yehoshua', 'Shoftim',
  'Shmuel Aleph', 'Shmuel Bet', 'Shmuel',
  'Melachim Aleph', 'Melachim Bet', 'Melachim',
  'Yeshayahu', 'Yirmiyahu', 'Yechezkel',
  'Hoshea', 'Yoel', 'Amos', 'Ovadiah', 'Yonah', 'Michah',
  'Nachum', 'Chavakuk', 'Tzefaniah', 'Chaggai', 'Zechariah', 'Malachi',
  // Ketuvim
  'Tehillim', 'Mishlei', 'Iyov', 'Shir HaShirim', 'Rut', 'Eichah',
  'Kohelet', 'Esther', 'Daniel', 'Ezra', 'Nechemiah',
  'Divrei HaYamim Aleph', 'Divrei HaYamim Bet', 'Divrei HaYamim',
];

// Sort longest first so "Shmuel Aleph" wins over "Shmuel" when both are
// candidates. Regex alternation otherwise picks the first match.
const BOOK_ALT = TANACH_BOOKS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const VERSE_REF_RE = new RegExp(`\\b(${BOOK_ALT})\\s+(\\d+)(?::(\\d+))?`, 'g');

// Quoted English: opening quote + Latin letter + at least 4 more chars + closing
// quote. Catches ASCII and smart quotes (U+2018/U+2019, U+201C/U+201D).
const ENGLISH_QUOTE_RE = /['"‘“][A-Za-z][^'"‘’“”]{4,200}?['"’”]/;

// Window around the verse ref for the Hebrew-presence and English-quote tests.
// 150 chars covers a sentence on either side comfortably.
const WINDOW = 150;

const HEBREW_RE = /[֐-׿]/;

export function lintSynthesis(text: string): PasukCitationIssue[] {
  if (!text) return [];
  const issues: PasukCitationIssue[] = [];
  for (const m of text.matchAll(VERSE_REF_RE)) {
    const idx = m.index ?? 0;
    const start = Math.max(0, idx - WINDOW);
    const end = Math.min(text.length, idx + m[0].length + WINDOW);
    const window = text.slice(start, end);
    // Hebrew anywhere in the window → the citation has its verbatim text. OK.
    if (HEBREW_RE.test(window)) continue;
    // No English quote anywhere nearby → bare reference, not a quotation. OK.
    if (!ENGLISH_QUOTE_RE.test(window)) continue;
    issues.push({
      kind: 'missing-hebrew-excerpt',
      match: m[0],
      index: idx,
      book: m[1],
      chapter: parseInt(m[2], 10),
      verse: m[3] ? parseInt(m[3], 10) : 0,
    });
  }
  return issues;
}
