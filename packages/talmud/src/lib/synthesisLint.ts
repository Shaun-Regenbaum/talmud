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

// ---------------------------------------------------------------------------
// Calque detector — flags English phrases that are word-for-word literal
// renderings of fixed Hebrew/Aramaic halachic terms. The grammatically
// marked English ("most flesh", "son of his year", "house of justice")
// reads as nonsense to a learner who doesn't already know the underlying
// Hebrew. HEBREW_GLOSS_STYLE and TANACH_NAMING_STYLE explicitly forbid
// these; this lint guards against the prompt drifting back to them.
//
// Originally added after a Chulin 21a synthesis emitted "Eli's broken neck
// occurred without most flesh" — calque of רוב בשר, the technical threshold
// of "majority of surrounding neck-flesh that normally tears with the
// spine."
// ---------------------------------------------------------------------------

export interface CalqueIssue {
  kind: 'calque';
  /** The English calque text that was matched in the output. */
  match: string;
  /** Character offset in the source text. */
  index: number;
  /** The Hebrew/Aramaic term the calque is a literal rendering of. */
  hebrew: string;
  /** Short label for what the calque means (the legitimate concept). */
  meaning: string;
}

interface CalqueRule {
  /** Pattern must be /…/i (case-insensitive). The detector adds the `g` flag. */
  re: RegExp;
  hebrew: string;
  meaning: string;
}

// Add a new rule here when a calque ships to production. Keep patterns
// CONSERVATIVE — a false positive in a synthesis blocks the user. Only
// include phrases that have no legitimate non-Talmudic English usage.
const CALQUE_RULES: CalqueRule[] = [
  // רוב בשר — Chulin 21a's failure case. "Most flesh" / "most of the flesh" /
  // "majority of the flesh" are all calques of the shechita/neveila threshold
  // term. The legitimate English is either "רוב בשר" itself or a clear gloss
  // like "the majority of the surrounding neck-flesh."
  {
    re: /\b(?:without|severing|severs|majority of(?: the)?|most of(?: the)?|most)\s+(?:the\s+)?flesh\b/i,
    hebrew: 'רוב בשר',
    meaning: 'majority of surrounding flesh (shechita / neveila threshold)',
  },
  // בן שנתו — cattle/sheep terminology for a one-year-old animal. "Son of
  // his year" / "sons of their year" are pure calques.
  {
    re: /\bsons?\s+of\s+(?:his|their)\s+year\b/i,
    hebrew: 'בן שנתו',
    meaning: 'a year-old animal',
  },
  // בית דין — rabbinic court. "House of justice" is the literal calque;
  // legitimate English is "court" (or just "בית דין").
  {
    re: /\bhouse\s+of\s+justice\b/i,
    hebrew: 'בית דין',
    meaning: 'rabbinic court',
  },
  // שבע מצוות בני נח — the Noahide laws. Two phrasings of the calque cover
  // most LLM outputs. Plain "sons of Noah" appears in legitimate biblical
  // narrative (Bereishit 10) so we only flag the compound *commandments*
  // forms, never bare "sons of Noah."
  {
    re: /\b(?:seven\s+)?(?:commandments|laws|mitzvot)\s+of\s+(?:the\s+)?sons?\s+of\s+Noah\b/i,
    hebrew: 'שבע מצוות בני נח',
    meaning: 'the Noahide laws',
  },
  {
    re: /\bsons?\s+of\s+Noah'?s?\s+(?:commandments|laws|mitzvot)\b/i,
    hebrew: 'שבע מצוות בני נח',
    meaning: 'the Noahide laws',
  },
];

export function lintCalques(text: string): CalqueIssue[] {
  if (!text) return [];
  const out: CalqueIssue[] = [];
  for (const { re, hebrew, meaning } of CALQUE_RULES) {
    // Force global so matchAll walks every occurrence; keep the source rule
    // non-global so adding `g` here is the only place we juggle that flag.
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(globalRe)) {
      out.push({
        kind: 'calque',
        match: m[0],
        index: m.index ?? 0,
        hebrew,
        meaning,
      });
    }
  }
  return out;
}
