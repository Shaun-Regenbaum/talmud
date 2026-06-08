/**
 * Deterministic linter for halacha-anchor prose against HEBREW_GLOSS_STYLE.
 * The render-time backstop (hebraize() in src/client/hebraize.ts) repairs the
 * parens / inverted forms it can see, but it can't conjure a Hebrew anchor for
 * a BARE transliteration the LLM drops mid-sentence ("performed lechatchila,
 * one may…"), and it never sees the raw output a generation-time guard would.
 * This linter catches the gloss-style violations deterministically.
 *
 * Intended use is primarily over RAW LLM output (a generation-time
 * reject-and-retry / quality signal): after hebraize() runs at render time the
 * parens forms are already fixed, so most of these won't survive to the user —
 * but a bare transliteration WILL, and linting the raw output also tells us
 * when the prompt is drifting out of compliance.
 *
 * Single-sourced: the term set is derived from CANONICAL_HEBREW_TERMS, the same
 * list that drives the prompt's always-hebraize block and the client dict, so
 * this linter EXTENDS the single-source guarantee instead of becoming a third
 * place that drifts. Calque detection is delegated to lintCalques (which
 * already covers the "NEVER" terms: רוב בשר, בן שנתו, בית דין, שבע מצוות בני נח).
 *
 * Checks (deliberately scoped to the tractable, low-false-positive ones):
 *   1. transliteration-in-parens — "(lechatchila)" etc. The parens are the
 *      signal of intent-to-gloss, so a romanization there instead of Hebrew is
 *      unambiguously the forbidden form (HEBREW_GLOSS_STYLE: "NEVER write a
 *      transliteration alone in parens").
 *   2. bare-transliteration — a clearly-technical romanization standing alone
 *      with no Hebrew script nearby. Conservative: English-adopted / homograph
 *      terms (Shabbat, mitzvah, kosher, get, …) are excluded, because bare
 *      usage there is common and flagging it would be noisy.
 *   3. calques — delegated to lintCalques.
 *
 * NOT implemented: "bare English term that should be Hebrew" (flag every
 * "Shabbat"). That's genuinely hard and noisy; it's deliberately out of scope.
 */

import { CANONICAL_HEBREW_TERMS } from './hebrewTerms';
import { lintCalques, type CalqueIssue } from './synthesisLint';

export interface GlossIssue {
  kind: 'bare-transliteration' | 'transliteration-in-parens';
  /** The matched text in the source. */
  match: string;
  /** Character offset in the source text. */
  index: number;
  /** The canonical romanization that matched. */
  translit: string;
  /** The Hebrew the term should have appeared as. */
  hebrew: string;
}

const HEBREW_RE = /[֐-׿]/;

// Window (chars each side) for the Hebrew-anchor test on a bare romanization.
// A legit pairing keeps the Hebrew close ("the לכתחילה (lechatchila) standard"),
// so a nearby Hebrew char means we skip — favouring low false positives over
// catching every last bare term.
const BARE_WINDOW = 60;

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** All romanization forms (primary + variants) paired with their Hebrew. */
const ALL_FORMS: ReadonlyArray<{ form: string; hebrew: string }> = CANONICAL_HEBREW_TERMS
  .flatMap((t) => [t.translit, ...(t.variants ?? [])].map((form) => ({ form, hebrew: t.hebrew })));

// ── transliteration-in-parens ─────────────────────────────────────────────
// Exclude only pure English homographs, where "(get)" / "(kosher)" could be a
// legitimate English parenthetical rather than a stranded romanization.
const PARENS_EXCLUDE = new Set(['get', 'kosher', 'kasher']);
const PARENS_LOOKUP: ReadonlyMap<string, string> = new Map(
  ALL_FORMS.filter(({ form }) => !PARENS_EXCLUDE.has(norm(form))).map(({ form, hebrew }) => [norm(form), hebrew]),
);
const PARENS_RE = /\(([^()]{1,80})\)/g;

export function lintTransliterationInParens(text: string): GlossIssue[] {
  if (!text) return [];
  const out: GlossIssue[] = [];
  for (const m of text.matchAll(PARENS_RE)) {
    const inner = m[1];
    if (HEBREW_RE.test(inner)) continue; // already has the Hebrew anchor
    const hebrew = PARENS_LOOKUP.get(norm(inner));
    if (!hebrew) continue;
    out.push({
      kind: 'transliteration-in-parens',
      match: m[0],
      index: m.index ?? 0,
      translit: inner.trim(),
      hebrew,
    });
  }
  return out;
}

// ── bare-transliteration ──────────────────────────────────────────────────
// Exclude English-adopted / homograph forms where bare romanization is common
// and accepted (so flagging it would be noise), plus short homographs that risk
// matching ordinary English ("get", "rov").
const BARE_EXCLUDE = new Set([
  'get', 'kosher', 'kasher', 'rov', 'shabbat', 'mitzvah', 'matzah', 'matza',
  'chametz', 'hametz', 'pesach', 'halacha', 'halakhah', 'bracha', 'tzitzit',
  'tefillin', 'treif', 'trefah', 'sugya', 'sugiya', 'psak', 'pesak',
  'bet din', 'beit din', 'yom tov',
]);
const BARE_FORMS: ReadonlyArray<{ form: string; hebrew: string }> = ALL_FORMS
  .filter(({ form }) => !BARE_EXCLUDE.has(norm(form)))
  // Longest first so multi-word forms win over any single-word substring.
  .slice()
  .sort((a, b) => b.form.length - a.form.length);

const BARE_LOOKUP: ReadonlyMap<string, string> = new Map(BARE_FORMS.map(({ form, hebrew }) => [norm(form), hebrew]));
const BARE_RE = new RegExp(`\\b(${BARE_FORMS.map(({ form }) => esc(form)).join('|')})\\b`, 'gi');

export function lintBareTransliteration(text: string): GlossIssue[] {
  if (!text) return [];
  const out: GlossIssue[] = [];
  for (const m of text.matchAll(BARE_RE)) {
    const idx = m.index ?? 0;
    const start = Math.max(0, idx - BARE_WINDOW);
    const end = Math.min(text.length, idx + m[0].length + BARE_WINDOW);
    // A Hebrew char nearby means the romanization is part of a pairing
    // (e.g. the doubled "לכתחילה (lechatchila)" form) — not a stranded term.
    if (HEBREW_RE.test(text.slice(start, end))) continue;
    out.push({
      kind: 'bare-transliteration',
      match: m[0],
      index: idx,
      translit: m[0],
      hebrew: BARE_LOOKUP.get(norm(m[0])) ?? '',
    });
  }
  return out;
}

/** Run every halacha gloss-style check (parens + bare + calques) and return
 *  all issues, sorted by position. The single entry point a caller (a test
 *  guard over cached output, or a generation-time validator) should use. */
export function lintHalachaText(text: string): Array<GlossIssue | CalqueIssue> {
  if (!text) return [];
  return [
    ...lintTransliterationInParens(text),
    ...lintBareTransliteration(text),
    ...lintCalques(text),
  ].sort((a, b) => a.index - b.index);
}

/** Lint a parsed enrichment payload by deep-collecting every string leaf and
 *  linting each independently — covers prose fields (lechatchila / bedieved /
 *  prose / ruling / position / settled) AND the appliesWhen / exceptions chip
 *  arrays without coupling to any one halacha enrichment's shape. Linting each
 *  field separately (rather than a joined blob) avoids a Hebrew anchor in one
 *  field masking a violation in another across the join boundary. */
export function lintHalachaParsed(parsed: unknown): Array<GlossIssue | CalqueIssue> {
  const out: Array<GlossIssue | CalqueIssue> = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(...lintHalachaText(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(parsed);
  return out;
}
