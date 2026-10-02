/** Hebrew-first display rules shared by both readers. */
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
      out += '(?:ch|kh|ḥ|h)';
      i++;
    } else if (n[i] === 'ḥ') out += '(?:ch|kh|ḥ|h)';
    else if (n[i] === 'h') out += '(?:ch|kh|ḥ|h)';
    else if (two === 'ei') {
      out += 'ei?';
      i++;
    } else if (n[i] === 'e') out += 'ei?';
    else if (n[i] === "'" || n[i] === '’') out += "['’]?";
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
    out += c === ' ' ? '\\s+' : `${escapeRe(c)}[\\u0591-\\u05C7"'\\u05F3\\u05F4‘’“”]*`;
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

/** Display-only dictionary entries may match lowercase transliterations too.
 * This does not change the server's bilingual response or saved schema. */
export interface DisplayItem extends BilingualItem {
  transliteration?: boolean;
  /** Ordinary glossary meanings match English only beside their own Hebrew gloss. */
  requireGloss?: boolean;
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
  /** A possessive after a name in either script. */
  poss?: string;
  /** Closing quotation mark kept with the Hebrew wording. */
  quote?: string;
  /** Whether a parenthesis already follows (Hebrew mentions only). */
  glossed?: boolean;
}

/** Whether a quote closes an earlier opener rather than marking possession. */
function closesQuote(text: string, at: number): boolean {
  const close = text[at];
  const open = ({ '’': '‘', '”': '“', "'": "'", '"': '"' } as Record<string, string>)[close];
  if (!open || /\p{L}/u.test(text[at + 1] ?? '')) return false;
  let inside = false;
  for (let i = 0; i < at; i++) {
    const c = text[i];
    if (c === open && (i === 0 || /[\s([{,:;]/.test(text[i - 1])) && !/\s/.test(text[i + 1] ?? ''))
      inside = true;
    else if (inside && c === close && !/\p{L}/u.test(text[i + 1] ?? '')) inside = false;
  }
  return inside;
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
export function hebrewFirst(text: string, items: readonly DisplayItem[]): string {
  if (!text || items.length === 0) return text;
  const seen = new Map<string, DisplayItem>();
  const groups = new Map<string, DisplayItem[]>();
  for (const it of items) {
    const en = it.en.replace(ARTICLE, '').trim();
    const he = it.he.replace(NIKUD, '').trim();
    if (!en || !HE_LETTER.test(he)) continue;
    const k = nameFold(en);
    const prior = seen.get(k);
    if (prior && heKey(prior.he) !== heKey(he)) continue;
    const key = heKey(he);
    const group = groups.get(key) ?? [];
    const exact = group.find((entry) => entry.en.toLowerCase() === en.toLowerCase());
    if (exact) {
      exact.transliteration ||= it.transliteration;
      if (it.transliteration) exact.requireGloss = false;
      continue;
    }
    const entry = { ...it, en, he };
    if (!prior) seen.set(k, entry);
    group.push(entry);
    groups.set(key, group);
  }
  const candidates: (Mention & { item: DisplayItem; length: number })[] = [];
  const claimed: [number, number][] = [];
  const free = (s: number, e: number): boolean => !claimed.some(([a, b]) => s < b && e > a);
  const edits: Edit[] = [];
  for (const aliases of groups.values()) {
    const it = aliases[0];
    for (const alias of [...aliases].sort((a, b) => b.en.length - a.en.length)) {
      const enRe = new RegExp(
        `(?<![\\p{L}\\p{M}])${spellingPattern(alias.en)}(?![\\p{L}\\p{M}])`,
        'giu',
      );
      for (const m of text.matchAll(enRe)) {
        const at = m.index;
        let end = at + m[0].length;
        if (insideParen(text, at)) continue;
        if (alias.kind === 'name') {
          if (!alias.transliteration && (!/^\p{Lu}/u.test(m[0]) || partOfLongerName(text, at, end)))
            continue;
          // Known compound entries win before their shorter names. Rosh also
          // starts holiday names, which are not references to the commentator.
          if (
            alias.transliteration &&
            /^rosh$/i.test(m[0]) &&
            /^\s+(?:ha)?(?:shana[h]?|[ch]h?odesh)\b/i.test(text.slice(end))
          )
            continue;
        }
        const quote = closesQuote(text, end) ? text[end] : undefined;
        const poss =
          !quote && alias.kind === 'name'
            ? text.slice(end).match(/^['’]s?(?![\p{L}])/u)?.[0]
            : undefined;
        if (quote) end++;
        if (poss) end += poss.length;
        const paren = text.slice(end).match(/^\s*\(([^()]*)\)/);
        const ownParen = paren && isHebrewOnly(paren[1]) && heKey(paren[1]) === heKey(it.he);
        if (alias.requireGloss && !ownParen) continue;
        if (ownParen) end += paren[0].length;
        candidates.push({
          start: at,
          end,
          script: 'en',
          english: m[0],
          poss,
          quote,
          item: { ...alias, he: it.he },
          length: m[0].length,
        });
      }
    }
    const heRe = new RegExp(
      `(?<![\\u05D0-\\u05EA])${hebrewPattern(it.he)}(?![\\u05D0-\\u05EA])`,
      'gu',
    );
    for (const m of text.matchAll(heRe)) {
      const at = m.index;
      let end = at + m[0].length;
      if (insideParen(text, at)) continue;
      // The pattern accepts abbreviation quotes, including a trailing apostrophe.
      // An English possessive must stay together when a gloss is inserted.
      const trailingPoss =
        /['’]$/.test(m[0]) && /^s(?![\p{L}])/u.test(text.slice(end))
          ? `${m[0].slice(-1)}s`
          : undefined;
      const quote = !trailingPoss && closesQuote(text, end - 1) ? text[end - 1] : undefined;
      if (trailingPoss) end++;
      const paren = text.slice(end).match(/^\s*\(([^()]*)\)/);
      const ownGloss =
        paren &&
        aliases.some(
          (alias) =>
            nameFold(
              paren[1]
                .trim()
                .replace(/['’]s?$/, '')
                .replace(/\s+/g, ' '),
            ) === nameFold(alias.en.replace(/\s+/g, ' ')),
        );
      if (ownGloss) end += paren[0].length;
      candidates.push({
        start: at,
        end,
        script: 'he',
        quote,
        glossed: !!paren,
        english: ownGloss ? paren[1] : undefined,
        poss: trailingPoss ?? (ownGloss ? paren[1].match(/['’]s?$/)?.[0] : undefined),
        item: it,
        length: m[0].length,
      });
    }
  }
  // Resolve all overlaps by the length actually found in the text, not by
  // another alias in the same group. Only then count first mentions in order.
  const selected = candidates
    .sort((a, b) => b.length - a.length)
    .filter((mn) => {
      if (!free(mn.start, mn.end)) return false;
      claimed.push([mn.start, mn.end]);
      return true;
    })
    .sort((a, b) => a.start - b.start);
  const mentioned = new Set<string>();
  for (const mn of selected) {
    const it = mn.item;
    const key = heKey(it.he);
    const first = !mentioned.has(key);
    mentioned.add(key);
    if (mn.script === 'he') {
      if (first && !mn.glossed) {
        if (mn.poss)
          edits.push({
            at: mn.start,
            del: mn.end - mn.start,
            ins: `${it.he} (${it.en}${mn.poss})`,
          });
        else edits.push({ at: mn.end, del: 0, ins: ` (${it.en})` });
      } else if (!first && mn.english) {
        edits.push({
          at: mn.start,
          del: mn.end - mn.start,
          ins: `${it.he}${mn.poss ?? ''}${mn.quote ?? ''}`,
        });
      }
      continue;
    }
    const swapLater = it.kind === 'name' || it.en.split(/\s+/).length > 1;
    const english = `${mn.english}${mn.poss ?? ''}`;
    const ins = first
      ? `${it.he}${mn.quote ?? ''} (${english})`
      : swapLater
        ? `${it.he}${mn.poss ?? ''}${mn.quote ?? ''}`
        : `${english}${mn.quote ?? ''}`;
    edits.push({ at: mn.start, del: mn.end - mn.start, ins });
  }
  return edits.length ? applyEdits(text, edits) : text;
}
