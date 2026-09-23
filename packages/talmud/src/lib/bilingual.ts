/**
 * Bilingual prose — ONE house rule for Hebrew inside English prose, applied at
 * display time instead of trusting each producer prompt to follow it:
 *
 *   A name or a term gets its Hebrew in parentheses ONCE, at its first mention
 *   in the paragraph, and runs plain after that.
 *     "Rabbi Yoḥanan (רבי יוחנן) holds ... Rabbi Yoḥanan answers ..."
 *
 * The 39 prompts that share HEBREW_GLOSS_STYLE follow it differently call to
 * call (one paragraph glosses every name, the next none), so the reader fixes
 * the saved prose instead of regenerating it.
 *
 * Two passes, both pure here:
 *   1. applyBilingual — per Hebrew parenthesis, Jev says what it is (a name, a
 *      term, or something else such as a quote or a source reference) and
 *      which English words just before it the Hebrew belongs to. Code then
 *      keeps that Hebrew on the FIRST mention of those words and removes the
 *      repeats. Jev only picks among candidate spans cut from the text; it
 *      never writes text.
 *   2. rabbiHebrewOnce — deterministic, for the daf's own rabbis (whose Hebrew
 *      name the reader already has): add the Hebrew to a rabbi's first mention
 *      when the model left it out, and drop it from later mentions.
 *
 * Measured on 100 hand-labeled parentheses from five pages
 * (Sandbox/2026-09-23-hebrew-mixing-jev): Jev put 46/46 names in "name" and
 * one non-name there. It can't judge whether an ordinary word "deserves"
 * Hebrew, so nothing here drops a gloss for being ordinary (a policy call:
 * those stay).
 */
import type { ChoiceQuestion } from '@corpus/core/llm/jev';

/** A parenthesis whose content is Hebrew script only (no Latin letters, no
 *  digits): the only kind this module ever moves or removes. */
export interface HebrewParen {
  /** Index of '(' in the text. */
  start: number;
  /** Index just past ')'. */
  end: number;
  /** Content between the parens, verbatim. */
  inner: string;
  /** Normalized Hebrew (no nikud, no quote marks) — the identity for repeats. */
  key: string;
}

const HE_LETTER = /[\u05D0-\u05EA]/;
const NIKUD = /[\u0591-\u05C7]/g;

/** Identity of a Hebrew gloss: strip nikud/cantillation and geresh/quote
 *  marks, collapse whitespace. "רַבִּי יוֹחָנָן" and "רבי יוחנן" are one key. */
export function heKey(s: string): string {
  return s
    .replace(NIKUD, '')
    .replace(/["'\u05F3\u05F4\u2018\u2019\u201C\u201D]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every Hebrew-only parenthesis in `text`, in order. A parenthesis right
 *  after Hebrew text is skipped: that is a Hebrew-first phrase or a variant
 *  spelling, not an English word's gloss. */
export function findHebrewParens(text: string): HebrewParen[] {
  const out: HebrewParen[] = [];
  for (const m of text.matchAll(/\(([^()]*)\)/g)) {
    const inner = m[1];
    if (!HE_LETTER.test(inner) || /[A-Za-z0-9]/.test(inner)) continue;
    const before = text.slice(0, m.index).trimEnd();
    const prev = before.replace(/["'\u2019\u201D]+$/, '').slice(-1);
    if (HE_LETTER.test(prev)) continue;
    out.push({ start: m.index, end: m.index + m[0].length, inner, key: heKey(inner) });
  }
  return out;
}

/** The English words a parenthesis could belong to: suffixes (1..6 words) of
 *  the clause right before it. The clause stops at sentence punctuation, a
 *  comma, a dash or another parenthesis, so a candidate never reaches across
 *  into a different phrase. Longest last. */
export function spanCandidates(text: string, parenStart: number, maxWords = 6): string[] {
  const before = text.slice(0, parenStart);
  const cut = Math.max(
    ...['.', ';', ':', '!', '?', ',', '(', ')', '\u2014', '\u2013', '\n'].map((c) =>
      before.lastIndexOf(c),
    ),
  );
  const clause = before.slice(cut + 1).trim();
  if (!clause) return [];
  const words = clause.split(/\s+/).slice(-maxWords);
  const out: string[] = [];
  for (let n = 1; n <= words.length; n++) out.push(words.slice(-n).join(' '));
  return out;
}

export const KIND_CRITERIA = {
  name: 'The Hebrew is the Hebrew form of a PERSON or PLACE name, or a book or tractate title, written in English just before it (Rabbi Akiva (רבי עקיבא), Pumbedita (פומבדיתא), Ramban (רמב"ן)).',
  term: 'The Hebrew is the original Hebrew or Aramaic behind the English words just before it: a concept, a legal or ritual term, or a word the Talmud or a verse itself uses (a verbal analogy (גזירה שווה), one who immersed that day (טבול יום)).',
  other:
    'Anything else: a quotation from the Talmud or a verse, a source reference, or Hebrew that does not belong to the English words just before it.',
} as const;
export type ParenKind = keyof typeof KIND_CRITERIA;

/** Jev questions for one paragraph: per parenthesis, a kind Choice and a span
 *  Choice over its candidates. All ride one request (they share the state). */
export function buildBilingualQuestions(
  text: string,
  parens: readonly HebrewParen[],
): Record<string, ChoiceQuestion> {
  const qs: Record<string, ChoiceQuestion> = {};
  parens.forEach((p, i) => {
    const target = {
      text_before: text.slice(Math.max(0, p.start - 80), p.start),
      parenthesis: text.slice(p.start, p.end),
    };
    qs[`k${i}`] = {
      type: 'choice',
      instructions: {
        target,
        question:
          'This is English prose about the Talmud. What is the Hebrew parenthesis `target.parenthesis`, which directly follows `target.text_before` in `paragraph`?',
      },
      criteria: { ...KIND_CRITERIA },
    };
    const cands = spanCandidates(text, p.start);
    if (cands.length > 1) {
      const criteria: Record<string, string> = {};
      cands.forEach((c, j) => {
        criteria[`w${j + 1}`] = `"${c}"`;
      });
      qs[`s${i}`] = {
        type: 'choice',
        instructions: {
          target,
          question:
            'Which English words directly before `target.parenthesis` does its Hebrew translate or name? Pick exactly those words: no fewer, and no extra words from the surrounding sentence.',
        },
        criteria,
      };
    }
  });
  return qs;
}

/** What Jev said about one parenthesis, reduced to what applyBilingual uses. */
export interface ParenDecision {
  kind: ParenKind;
  kindP: number;
  /** The English words the Hebrew belongs to, or null when unsure. */
  span: string | null;
  spanP: number;
}

/** Minimum probability for a kind or span to be acted on. Below it the
 *  parenthesis is left exactly where the model put it. */
export const DECIDE_MIN = 0.6;

type ChoiceLike = { choice: string; probabilities: Record<string, number> };

/** Turn raw Jev answers back into per-parenthesis decisions. */
export function readDecisions(
  text: string,
  parens: readonly HebrewParen[],
  answers: Record<string, ChoiceLike | undefined>,
): ParenDecision[] {
  return parens.map((p, i) => {
    const k = answers[`k${i}`];
    const kind = (k && k.choice in KIND_CRITERIA ? k.choice : 'other') as ParenKind;
    const kindP = k?.probabilities[k.choice] ?? 0;
    const cands = spanCandidates(text, p.start);
    let span: string | null = null;
    let spanP = 0;
    if (cands.length === 1) {
      span = cands[0];
      spanP = 1;
    } else {
      const s = answers[`s${i}`];
      const idx = s ? Number(s.choice.slice(1)) - 1 : -1;
      if (s && idx >= 0 && idx < cands.length) {
        span = cands[idx];
        spanP = s.probabilities[s.choice] ?? 0;
      }
    }
    return { kind, kindP, span, spanP };
  });
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Index of the first whole-word, case-insensitive occurrence of `phrase` in
 *  `text` that sits outside any parenthesis, or -1. */
function firstMention(text: string, phrase: string): number {
  const re = new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(phrase)}(?![\\p{L}\\p{M}])`, 'giu');
  for (const m of text.matchAll(re)) {
    const i = m.index;
    const open = text.lastIndexOf('(', i);
    const close = text.lastIndexOf(')', i);
    if (open > close) continue; // inside a parenthesis
    return i;
  }
  return -1;
}

interface Edit {
  at: number;
  del: number;
  ins: string;
}

/** Remove a parenthesis together with the whitespace right before it. */
function removal(text: string, p: HebrewParen): Edit {
  let s = p.start;
  while (s > 0 && /[ \t]/.test(text[s - 1])) s--;
  return { at: s, del: p.end - s, ins: '' };
}

function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.at - a.at)) {
    out = out.slice(0, e.at) + e.ins + out.slice(e.at + e.del);
  }
  return out;
}

/**
 * Apply the house rule to one paragraph given Jev's decisions (index-aligned
 * with `parens`). For each name/term Hebrew (grouped by heKey):
 *   - keep ONE copy, on the first mention of its English words;
 *   - remove every other copy of the same Hebrew.
 * Parentheses judged "other", or decided below DECIDE_MIN, are never touched.
 * Pure and idempotent: a cleaned paragraph comes back unchanged.
 */
export function applyBilingual(
  text: string,
  parens: readonly HebrewParen[],
  decisions: readonly ParenDecision[],
): string {
  const groups = new Map<string, { p: HebrewParen; d: ParenDecision }[]>();
  parens.forEach((p, i) => {
    const d = decisions[i];
    if (!d || d.kind === 'other' || d.kindP < DECIDE_MIN) return;
    const g = groups.get(p.key) ?? [];
    g.push({ p, d });
    groups.set(p.key, g);
  });
  const edits: Edit[] = [];
  for (const g of groups.values()) {
    const kept = g[0];
    for (const other of g.slice(1)) edits.push(removal(text, other.p));
    const span = g.find((x) => x.d.span && x.d.spanP >= DECIDE_MIN)?.d.span;
    if (!span) continue;
    const at = firstMention(text, span);
    if (at < 0) continue;
    const after = at + span.length;
    if (after > kept.p.start) continue; // the kept copy is already the first mention
    // The first mention already carries some other parenthesis: leave it.
    if (/^\s*\(/.test(text.slice(after))) continue;
    edits.push(removal(text, kept.p));
    edits.push({ at: after, del: 0, ins: ` (${kept.p.inner})` });
  }
  return edits.length ? applyEdits(text, edits) : text;
}

/** Fold the romanization choices our producers disagree on, so the rabbi
 *  list's "Rabbi Yochanan" / "Reish Lakish" / "Rav Mordechai" also find the
 *  prose's "Rabbi Yoḥanan" / "Resh Lakish" / "Rav Mordekhai". */
export function nameFold(s: string): string {
  return s
    .toLowerCase()
    .replace(/kh|ḥ|ch/g, 'h')
    .replace(/ei/g, 'e')
    .replace(/['\u2019]/g, '');
}

/** A regex source matching `name` under every spelling nameFold folds together. */
function spellingPattern(name: string): string {
  let out = '';
  const n = name.toLowerCase();
  for (let i = 0; i < n.length; i++) {
    const two = n.slice(i, i + 2);
    if (two === 'ch' || two === 'kh') {
      out += '(?:ch|kh|ḥ)';
      i++;
    } else if (n[i] === 'ḥ') out += '(?:ch|kh|ḥ)';
    else if (two === 'ei') {
      out += 'ei?';
      i++;
    } else if (n[i] === "'" || n[i] === '\u2019') out += "['\u2019]?";
    else out += escapeRe(n[i]);
  }
  return out;
}

/** A daf rabbi as the reader knows it: the English display name and its Hebrew. */
export interface NamedRabbi {
  name: string;
  nameHe: string;
}

/**
 * The name half of the rule, with no model: for each of the daf's rabbis
 * (English name + Hebrew name known), make the FIRST mention carry the Hebrew
 * and strip the same Hebrew from later mentions. Only a parenthesis whose
 * Hebrew is that rabbi's (by heKey against the Hebrew name, or against the
 * Hebrew the text already gave the first mention) is removed.
 */
export function rabbiHebrewOnce(text: string, rabbis: readonly NamedRabbi[]): string {
  if (!text || rabbis.length === 0) return text;
  const withHe = rabbis.filter((r) => r.name?.trim() && HE_LETTER.test(r.nameHe ?? ''));
  if (withHe.length === 0) return text;
  // Longest names first, one alternation, so "Rabbi Yochanan ben Zakkai" is
  // matched as itself and never as "Rabbi Yochanan".
  const byName = new Map(withHe.map((r) => [nameFold(r.name), r]));
  const alts = [...withHe]
    .sort((a, b) => b.name.length - a.name.length)
    .map((r) => spellingPattern(r.name));
  const re = new RegExp(`(?<![\\p{L}\\p{M}])(${alts.join('|')})(?![\\p{L}\\p{M}])`, 'giu');
  const seen = new Map<NamedRabbi, Set<string>>();
  const edits: Edit[] = [];
  for (const m of text.matchAll(re)) {
    const at = m.index;
    const open = text.lastIndexOf('(', at);
    if (open > text.lastIndexOf(')', at)) continue; // inside a parenthesis
    const r = byName.get(nameFold(m[1]));
    if (!r) continue;
    // A possessive stays on the name: "Rabbi Yoḥanan's (רבי יוחנן) objection",
    // never "Rabbi Yoḥanan (רבי יוחנן)'s objection".
    const poss = text.slice(at + m[1].length).match(/^['’]s(?![\p{L}])/u);
    const after = at + m[1].length + (poss ? poss[0].length : 0);
    const paren = text.slice(after).match(/^(\s*)\(([^()]*)\)/);
    const parenHe = paren && HE_LETTER.test(paren[2]) && !/[A-Za-z0-9]/.test(paren[2]);
    const keys = seen.get(r);
    if (!keys) {
      const k = new Set([heKey(r.nameHe)]);
      if (parenHe && paren) k.add(heKey(paren[2]));
      seen.set(r, k);
      if (!paren) edits.push({ at: after, del: 0, ins: ` (${r.nameHe.replace(NIKUD, '')})` });
      continue;
    }
    if (paren && parenHe && keys.has(heKey(paren[2]))) {
      edits.push({ at: after, del: paren[0].length, ins: '' });
    }
  }
  return edits.length ? applyEdits(text, edits) : text;
}
