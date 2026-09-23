/**
 * Bilingual prose — ONE house rule for Hebrew inside English prose, applied at
 * display time instead of trusting each producer prompt to follow it:
 *
 *   Hebrew first, English in parentheses. A name or term's first mention in a
 *   paragraph is its Hebrew with the English after it in parentheses; later
 *   mentions are the Hebrew alone. A quotation is its Hebrew wording inside
 *   the quote marks, the English meaning in parentheses after.
 *     "רבי יוחנן (Rabbi Yoḥanan) holds ... later רבי יוחנן answers ..."
 *     "the verse 'לי יהיו' (Mine they shall be)"
 *
 * Saved prose mostly has the opposite order ("Rabbi Yoḥanan (רבי יוחנן)"), or
 * no Hebrew at all, depending on which prompt wrote it. The reader rewrites
 * it rather than regenerating Shas.
 *
 * Where each English/Hebrew pair comes from:
 *   - Jev, per paragraph: for each Hebrew-only parenthesis it says what it is
 *     (name, term, quote, other) and which English words just before it the
 *     Hebrew belongs to. Jev only picks among candidate spans cut from the
 *     text; it never writes text.
 *   - The page glossary: pairs Jev found in the page's other paragraphs, so a
 *     name glossed in one paragraph gets its Hebrew in all of them.
 *   - The daf's rabbi list (English name + Hebrew name), no model at all.
 * hebrewFirst then rewrites every mention of those names and terms.
 *
 * Measured on 100 hand-labeled parentheses from five pages
 * (Sandbox/2026-09-23-hebrew-mixing-jev): Jev put 46/46 names in "name" and
 * one non-name there.
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

const HE_LETTER = /[א-ת]/;
const NIKUD = /[֑-ׇ]/g;

/** Identity of a Hebrew gloss: strip nikud/cantillation and geresh/quote
 *  marks, collapse whitespace. "רַבִּי יוֹחָנָן" and "רבי יוחנן" are one key. */
export function heKey(s: string): string {
  return s
    .replace(NIKUD, '')
    .replace(/["'׳״‘’“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const isHebrewOnly = (s: string): boolean => HE_LETTER.test(s) && !/[A-Za-z0-9]/.test(s);

/** Every Hebrew-only parenthesis in `text`, in order. A parenthesis right
 *  after Hebrew text is skipped: that is a Hebrew-first phrase or a variant
 *  spelling, not an English word's gloss. */
export function findHebrewParens(text: string): HebrewParen[] {
  const out: HebrewParen[] = [];
  for (const m of text.matchAll(/\(([^()]*)\)/g)) {
    const inner = m[1];
    if (!isHebrewOnly(inner)) continue;
    const before = text.slice(0, m.index).trimEnd();
    const prev = before.replace(/["'’”]+$/, '').slice(-1);
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
    ...['.', ';', ':', '!', '?', ',', '(', ')', '—', '–', '\n'].map((c) => before.lastIndexOf(c)),
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
  term: 'The Hebrew is the original Hebrew or Aramaic behind the English words just before it: a concept, a legal or ritual term, or a single word the Talmud or a verse uses (a verbal analogy (גזירה שווה), one who immersed that day (טבול יום)).',
  quote:
    "The Hebrew is the original wording of a quotation from the Talmud or a verse whose English translation, in quote marks, comes just before it (the phrase 'from that day onward' (מאותו היום ואילך)).",
  other:
    'Anything else: a source reference, or Hebrew that does not belong to the English words just before it.',
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

/** What Jev said about one parenthesis. */
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

interface Edit {
  at: number;
  del: number;
  ins: string;
}

function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.at - a.at)) {
    out = out.slice(0, e.at) + e.ins + out.slice(e.at + e.del);
  }
  return out;
}

const insideParen = (text: string, at: number): boolean =>
  text.lastIndexOf('(', at) > text.lastIndexOf(')', at);

/** Quotations: "'from that day onward' (מאותו היום ואילך)" becomes
 *  "'מאותו היום ואילך' (from that day onward)" — the Hebrew wording goes
 *  inside the quote marks. Only parentheses Jev calls a quote, right after an
 *  English phrase in quote marks. */
export function flipQuotes(
  text: string,
  parens: readonly HebrewParen[],
  decisions: readonly ParenDecision[],
): string {
  const edits: Edit[] = [];
  parens.forEach((p, i) => {
    const d = decisions[i];
    if (!d || d.kind !== 'quote' || d.kindP < DECIDE_MIN) return;
    const before = text.slice(0, p.start);
    const close = before.trimEnd();
    const q = close.slice(-1);
    const pairs: Record<string, string> = { "'": "'", '’': '‘', '"': '"', '”': '“' };
    const openCh = pairs[q];
    if (!openCh) return;
    // The opening quote starts the quotation: at the text start or after a space.
    let open = -1;
    for (let j = close.length - 2; j >= Math.max(0, close.length - 300); j--) {
      if ((close[j] === openCh || close[j] === q) && (j === 0 || /[\s(—]/.test(close[j - 1]))) {
        open = j;
        break;
      }
    }
    if (open < 0) return;
    const english = close.slice(open + 1, close.length - 1);
    if (!english.trim() || HE_LETTER.test(english) || /[()]/.test(english)) return;
    edits.push({
      at: open,
      del: p.end - open,
      ins: `${close[open]}${p.inner}${q} (${english})`,
    });
  });
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
    .replace(/['’]/g, '');
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
    } else if (n[i] === "'" || n[i] === '’') out += "['’]?";
    else if (/\s/.test(n[i])) out += '\\s+';
    else out += escapeRe(n[i]);
  }
  return out;
}

/** A regex source matching Hebrew `he` with or without nikud and geresh /
 *  quote marks between the letters. */
function hebrewPattern(he: string): string {
  const key = heKey(he);
  let out = '';
  for (const c of key) {
    out += c === ' ' ? '\\s+' : `${escapeRe(c)}[\\u0591-\\u05C7"'\\u05F3\\u05F4]*`;
  }
  return out;
}

/** A leading English article, folded away when comparing or counting words. */
const ARTICLE = /^(?:the|a|an)\s+/i;

/** Whether the name found at [at, end) is only part of a longer name: the
 *  next word is capitalized or a patronymic ("Rav" inside "Rav Papa", "Rabbi
 *  Elazar" inside "Rabbi Elazar ben Pedat"), or the word before is a title
 *  or patronymic ("Yochanan" inside "Rabbi Yochanan"). A capitalized word
 *  before is fine ("Later Rabbi Yochanan"). */
function partOfLongerName(text: string, at: number, end: number): boolean {
  if (/^[ \t]+(?:\p{Lu}|ben\b|bar\b|b\.)/u.test(text.slice(end))) return true;
  return /\b(?:Rabbi|Rabban|Rav|Rabbeinu|Mar|R\.|ben|bar|b\.)[ \t]+$/.test(
    text.slice(Math.max(0, at - 40), at),
  );
}

/** One English name or term and its Hebrew. */
export interface BilingualItem {
  en: string;
  he: string;
  kind: 'name' | 'term';
}

/** Kept for the glossary's wire shape. */
export type GlossaryEntry = BilingualItem;

/** A daf rabbi as the reader knows it: the English display name and its Hebrew. */
export interface NamedRabbi {
  name: string;
  nameHe: string;
}

/** The daf's rabbis as items (nikud stripped: prose Hebrew carries none). */
export function rabbiItems(rabbis: readonly NamedRabbi[]): BilingualItem[] {
  return rabbis
    .filter((r) => r.name?.trim() && HE_LETTER.test(r.nameHe ?? ''))
    .map((r) => ({ en: r.name, he: r.nameHe.replace(NIKUD, '').trim(), kind: 'name' }));
}

interface Mention {
  start: number;
  end: number;
  /** 'en' = the English words (plus any Hebrew paren that followed them);
   *  'he' = the Hebrew itself. */
  script: 'en' | 'he';
  /** The English as written (for the first mention's parentheses). */
  english?: string;
  /** A possessive ("'s") that followed an English name. */
  poss?: string;
  /** Whether a parenthesis already follows (Hebrew mentions only). */
  glossed?: boolean;
}

/**
 * The house rule over one paragraph, for a set of known names and terms:
 *   - first mention (English or Hebrew, whichever comes first): Hebrew, then
 *     the English in parentheses;
 *   - every later mention: the Hebrew alone (a one-word term stays English);
 *   - a Hebrew parenthesis that restated the item after its English is folded
 *     into that rewrite.
 * Longest items first; a mention inside a longer one already handled is left
 * alone. Items earlier in the list win a tie on the same English. Idempotent.
 */
export function hebrewFirst(text: string, items: readonly BilingualItem[]): string {
  if (!text || items.length === 0) return text;
  const seen = new Set<string>();
  const uniq: BilingualItem[] = [];
  for (const it of items) {
    const en = it.en.replace(ARTICLE, '').trim();
    const he = it.he.replace(NIKUD, '').trim();
    if (!en || !HE_LETTER.test(he)) continue;
    const k = nameFold(en);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push({ en, he, kind: it.kind });
  }
  uniq.sort((a, b) => b.en.length - a.en.length);
  const claimed: [number, number][] = [];
  const free = (s: number, e: number): boolean => !claimed.some(([a, b]) => s < b && e > a);
  const edits: Edit[] = [];

  for (const it of uniq) {
    const mentions: Mention[] = [];
    const enRe = new RegExp(
      `(?<![\\p{L}\\p{M}])${spellingPattern(it.en)}(?![\\p{L}\\p{M}])`,
      'giu',
    );
    for (const m of text.matchAll(enRe)) {
      const at = m.index;
      let end = at + m[0].length;
      if (insideParen(text, at)) continue;
      if (it.kind === 'name' && (!/^\p{Lu}/u.test(m[0]) || partOfLongerName(text, at, end))) {
        continue;
      }
      // "Kontrokos's" and "Kontrokos'" are both possessives.
      const poss =
        it.kind === 'name' ? text.slice(end).match(/^['’]s?(?![\p{L}])/u)?.[0] : undefined;
      if (poss) end += poss.length;
      const paren = text.slice(end).match(/^\s*\(([^()]*)\)/);
      if (paren && isHebrewOnly(paren[1]) && heKey(paren[1]) === heKey(it.he))
        end += paren[0].length;
      if (!free(at, end)) continue;
      mentions.push({ start: at, end, script: 'en', english: m[0], poss });
    }
    const heRe = new RegExp(
      `(?<![\\u05D0-\\u05EA])${hebrewPattern(it.he)}(?![\\u05D0-\\u05EA])`,
      'gu',
    );
    for (const m of text.matchAll(heRe)) {
      const at = m.index;
      const end = at + m[0].length;
      if (insideParen(text, at) || !free(at, end)) continue;
      mentions.push({ start: at, end, script: 'he', glossed: /^\s*\(/.test(text.slice(end)) });
    }
    if (mentions.length === 0) continue;
    mentions.sort((a, b) => a.start - b.start);
    // Later mentions become the Hebrew for names and multi-word terms. A
    // one-word term is often an everyday English word ("halachic", "lamb"):
    // it gets its Hebrew once and stays English after that.
    const swapLater = it.kind === 'name' || it.en.split(/\s+/).length > 1;
    mentions.forEach((mn, i) => {
      claimed.push([mn.start, mn.end]);
      if (mn.script === 'he') {
        if (i === 0 && !mn.glossed) edits.push({ at: mn.end, del: 0, ins: ` (${it.en})` });
        return;
      }
      const english = `${mn.english}${mn.poss ?? ''}`;
      let ins = english; // a later one-word term: keep the English, drop any repeated Hebrew
      if (i === 0) ins = `${it.he} (${english})`;
      else if (swapLater) ins = `${it.he}${mn.poss ?? ''}`;
      edits.push({ at: mn.start, del: mn.end - mn.start, ins });
    });
  }
  return edits.length ? applyEdits(text, edits) : text;
}

// ── Pairs and the page glossary ──────────────────────────────────────────────

/** The name/term pairs one paragraph's decisions pin down (the paragraph's
 *  own items, and the page glossary's input). A name must start with a
 *  capital letter and use at least as many English words as Hebrew ones
 *  (rejects a span cut too short, like "Hyrcanus = רבי אליעזר"). */
export function pairsFromDecisions(
  parens: readonly HebrewParen[],
  decisions: readonly ParenDecision[],
): BilingualItem[] {
  const out: BilingualItem[] = [];
  parens.forEach((p, i) => {
    const d = decisions[i];
    if (!d || (d.kind !== 'name' && d.kind !== 'term') || d.kindP < DECIDE_MIN) return;
    if (!d.span || d.spanP < DECIDE_MIN) return;
    const en = d.span
      .replace(/^["'‘“]+|["'’”]+$/g, '')
      .replace(/['’]s?$/, '')
      .trim();
    if (!en) return;
    const he = p.inner.replace(NIKUD, '').trim();
    if (d.kind === 'name') {
      if (!/^\p{Lu}/u.test(en)) return;
      const enWords = en.split(/\s+/).filter((w) => !/^(?:ben|bar|b\.)$/.test(w)).length;
      if (enWords < he.split(/\s+/).length) return;
    }
    out.push({ en, he, kind: d.kind });
  });
  return out;
}

/** A term must be two real words (not counting a leading article) and be
 *  pinned down by at least this many paragraphs on the page to spread to the
 *  others. On Bekhorot 5a the one-paragraph terms included "they were
 *  sanctified = קדשו" and "a reason = טעם"; the two-paragraph ones were
 *  "sacred maneh", "faithful treasurer", "detailed counting". A name spreads
 *  from a single paragraph. */
export const TERM_MIN_PARAGRAPHS = 2;

/** Merge per-paragraph pairs into one list for the page. For each English
 *  name or term (spelling and a leading article folded), keep the Hebrew the
 *  most paragraphs used; when two different Hebrew forms tie, keep neither. */
export function buildGlossary(
  perParagraph: readonly (readonly BilingualItem[])[],
): BilingualItem[] {
  const byEn = new Map<string, Map<string, { e: BilingualItem; n: number }>>();
  for (const pairs of perParagraph) {
    const seenHere = new Set<string>();
    for (const e of pairs) {
      if (e.kind === 'term' && e.en.replace(ARTICLE, '').split(/\s+/).length < 2) continue;
      const enK = `${e.kind}:${nameFold(e.en.replace(ARTICLE, ''))}`;
      const heK = heKey(e.he);
      if (seenHere.has(`${enK}\u0000${heK}`)) continue;
      seenHere.add(`${enK}\u0000${heK}`);
      const forms = byEn.get(enK) ?? new Map();
      const f = forms.get(heK) ?? { e, n: 0 };
      f.n++;
      forms.set(heK, f);
      byEn.set(enK, forms);
    }
  }
  const out: BilingualItem[] = [];
  for (const forms of byEn.values()) {
    const ranked = [...forms.values()].sort((a, b) => b.n - a.n);
    if (ranked.length > 1 && ranked[0].n === ranked[1].n) continue;
    if (ranked[0].e.kind === 'term' && ranked[0].n < TERM_MIN_PARAGRAPHS) continue;
    out.push(ranked[0].e);
  }
  return out;
}

/** The English prose paragraphs in a page's saved pieces (the /api/daf-view
 *  `pieces` object) that carry Hebrew parentheses — the paragraphs a page
 *  glossary is learned from. Deduplicated; raw JSON strings are skipped. */
export function proseWithHebrew(pieces: unknown, maxChars = 4000): string[] {
  const out = new Set<string>();
  const walk = (x: unknown): void => {
    if (typeof x === 'string') {
      const s = x.trim();
      if (s.length < 40 || s.length > maxChars || s.startsWith('{') || s.startsWith('[')) return;
      const latin = (s.match(/[A-Za-z]/g) ?? []).length;
      if (latin < s.length * 0.4) return;
      if (findHebrewParens(x).length > 0) out.add(x);
    } else if (Array.isArray(x)) {
      for (const v of x) walk(v);
    } else if (x && typeof x === 'object') {
      for (const v of Object.values(x)) walk(v);
    }
  };
  walk(pieces);
  return [...out];
}
