/**
 * Codifier-anchored halacha: the data layer.
 * ------------------------------------------
 * The halacha redesign anchors each card on the law as it is actually CODIFIED
 * (Mishneh Torah / Tur / Shulchan Aruch), not on topics guessed from the gemara.
 * Sefaria already gives us the grounded links both ways:
 *
 *   forward  (daf  → codifiers): `fetchHalachicRefs` → `HalachicRefBundle`
 *            (Sefaria `/api/related`, category "Halakhah", grouped by index_title)
 *   reverse  (code → gemara sources, "where it comes from"): `/api/related` on a
 *            code ref → its Talmud/Tanakh links.
 *
 * This module is the PURE classification + assembly over those shapes — no I/O,
 * no client imports — so the worker (collection/enrichment) and the client
 * (render) share one source of truth, and it is unit-tested against the real
 * Sefaria link shapes.
 *
 * Two things the raw Sefaria data needs:
 *   1. an ALLOWLIST — the "Halakhah" category is noisy (Sefer Mitzvot Gadol,
 *      Halakhot Gedolot, Peninei Halakhah, Ben Ish Hai, Contemporary Halakhic
 *      Problems, …). We keep only the canonical codifiers, matched by the
 *      index_title PREFIX (codifier index_titles are "Mishneh Torah, <topic>",
 *      "Tur, <section>", "Shulchan Arukh, <section>" — keyed by prefix, not by
 *      tractate as the Rishonim are).
 *   2. Bavli-PRIMARY marking — the reverse links mix the Bavli daf (the source
 *      we care about) with Yerushalmi parallels and Tanakh roots.
 */

import type { HalachicRefBundle, HalachicSnippet } from '../sefref/sefaria/client';

// ---------------------------------------------------------------------------
// Codifier registry (forward: daf → codifiers)
// ---------------------------------------------------------------------------

export type CodifierId =
  | 'mishneh-torah'
  | 'tur'
  | 'shulchan-aruch'
  | 'mishnah-berurah'
  | 'arukh-hashulchan';

export type CodifierTier = 'primary' | 'secondary';

export interface CodifierMeta {
  id: CodifierId;
  /** Display name of the work (e.g. "Shulchan Aruch"). */
  label: string;
  /** The author/short handle used in the lineage chip (e.g. "Mechaber"). */
  short: string;
  /** Chronological position in the lineage spine (lower = earlier). */
  order: number;
  tier: CodifierTier;
  /** Matches the START of a Sefaria `index_title`. */
  prefix: RegExp;
}

/**
 * The canonical codifiers we anchor on, in lineage order. "primary" is the
 * Rambam→Tur→SA spine every card is built from; "secondary" are the major
 * Acharonim glosses we surface only when asked (they sharpen, they don't anchor).
 *
 * Sefaria spells Shulchan Aruch "Shulchan Arukh"; we match both. Rema is not a
 * separate Sefaria index_title here (its glosses live inside / alongside the SA),
 * so the Mechaber/Rema split is carried by the dispute enrichment, not by link
 * classification — see the redesign notes.
 */
export const CODIFIERS: readonly CodifierMeta[] = [
  {
    id: 'mishneh-torah',
    label: 'Mishneh Torah',
    short: 'Rambam',
    order: 1,
    tier: 'primary',
    prefix: /^Mishneh Torah\b/,
  },
  {
    id: 'tur',
    label: 'Tur',
    short: 'Tur',
    order: 2,
    tier: 'primary',
    prefix: /^(?:Tur\b|Arba'ah Turim\b)/,
  },
  {
    id: 'shulchan-aruch',
    label: 'Shulchan Aruch',
    short: 'Mechaber',
    order: 3,
    tier: 'primary',
    prefix: /^Shulchan Aru[ck]h\b/,
  },
  {
    id: 'mishnah-berurah',
    label: 'Mishnah Berurah',
    short: 'Mishnah Berurah',
    order: 4,
    tier: 'secondary',
    prefix: /^Mishnah Berurah\b/,
  },
  {
    id: 'arukh-hashulchan',
    label: 'Arukh HaShulchan',
    short: 'Arukh HaShulchan',
    order: 5,
    tier: 'secondary',
    prefix: /^Arukh HaShulchan\b/,
  },
];

/** Classify a Sefaria `index_title` to a canonical codifier, or null when it is
 *  not one we anchor on (the bulk of the noisy "Halakhah" category). */
export function classifyCodifier(indexTitle: string): CodifierMeta | null {
  const title = (indexTitle ?? '').trim();
  for (const c of CODIFIERS) if (c.prefix.test(title)) return c;
  return null;
}

/** One codifier in the lineage, carrying every grounded ref+snippet that maps
 *  to it (a codifier can appear under several Sefaria sub-books, e.g. "Mishneh
 *  Torah, Reading the Shema" and "Mishneh Torah, Heave Offerings"). */
export interface CodifierNode {
  id: CodifierId;
  label: string;
  short: string;
  order: number;
  tier: CodifierTier;
  /** Grounded refs (with text + daf anchors), Ein Mishpat refs first. */
  refs: HalachicSnippet[];
  /** True when Ein Mishpat / Ner Mitzvah anchors at least one of this codifier's
   *  refs to the daf — i.e. the codification is classically attested, not just a
   *  topical match. */
  einMishpat: boolean;
}

/**
 * Assemble the ordered codification chain from the already-cached
 * `HalachicRefBundle` (keyed by Sefaria index_title). Keeps only allowlisted
 * codifiers, merges a codifier's sub-books into one node, and orders the spine
 * chronologically. `includeSecondary` adds the Acharonim glosses (off by
 * default — the anchor is the primary spine).
 */
export function buildCodificationChain(
  bundle: HalachicRefBundle | undefined,
  opts: { includeSecondary?: boolean } = {},
): CodifierNode[] {
  if (!bundle) return [];
  const byId = new Map<CodifierId, CodifierNode>();
  for (const [indexTitle, snippets] of Object.entries(bundle)) {
    const meta = classifyCodifier(indexTitle);
    if (!meta) continue;
    if (meta.tier === 'secondary' && !opts.includeSecondary) continue;
    let node = byId.get(meta.id);
    if (!node) {
      node = {
        id: meta.id,
        label: meta.label,
        short: meta.short,
        order: meta.order,
        tier: meta.tier,
        refs: [],
        einMishpat: false,
      };
      byId.set(meta.id, node);
    }
    for (const s of snippets) {
      if (!node.refs.some((r) => r.ref === s.ref)) node.refs.push(s);
    }
  }
  for (const node of byId.values()) {
    node.einMishpat = node.refs.some((r) => r.einMishpat);
    // Surface the classically-attested refs first within each codifier.
    node.refs.sort((a, b) => Number(Boolean(b.einMishpat)) - Number(Boolean(a.einMishpat)));
  }
  return Array.from(byId.values()).sort((a, b) => a.order - b.order);
}

/** True when a daf has any codifier anchor — i.e. is genuinely practical
 *  halacha. The redesign suppresses cards on dapim with no codifier hit
 *  (the aggadah over-fire). */
export function hasCodification(bundle: HalachicRefBundle | undefined): boolean {
  return buildCodificationChain(bundle, { includeSecondary: true }).length > 0;
}

function truncate(s: string | undefined, n: number): string {
  const t = (s ?? '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// ---------------------------------------------------------------------------
// Clean code text (Sefaria HTML → plain text a reader or a prompt can use)
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

/** Remove every `<i class="footnote">…</i>` block. Footnotes nest their own
 *  `<i>` tags (book titles), so a lazy regex would stop at the first `</i>` and
 *  leave the rest of the footnote in the text; this walks the nesting. */
function dropFootnotes(html: string): string {
  let out = '';
  let i = 0;
  const open = /<i\b[^>]*class="footnote"[^>]*>/g;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    out += html.slice(i, m.index);
    let depth = 1;
    const tag = /<(\/?)i\b[^>]*>/g;
    tag.lastIndex = m.index + m[0].length;
    let t = tag.exec(html);
    while (t) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) break;
      t = tag.exec(html);
    }
    i = t ? t.index + t[0].length : html.length;
    open.lastIndex = i;
  }
  return out + html.slice(i);
}

/** Sefaria code text → plain text: drops footnotes and their markers, the empty
 *  commentator anchors (`<i data-commentator=…></i>`), the "ובו ד סעיפים" siman
 *  header, and all remaining tags. */
export function cleanCodeText(html: string | undefined): string {
  let t = dropFootnotes(html ?? '');
  t = t
    .replace(/<sup class="footnote-marker">[\s\S]*?<\/sup>/g, '')
    .replace(/^\s*<b>[^<]*סעיפ[^<]*<\/b>\s*(?:<br\s*\/?>)?/, '')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '');
  for (const [k, v] of Object.entries(ENTITIES)) t = t.split(k).join(v);
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Split a Shulchan Aruch seif into the Mechaber's words and the Rema's glosses.
 * Sefaria prints every Rema gloss in `<small>`: a long one opens with הגה, a
 * short one is just bracketed ("פודין בבן פקועה <small>(וי"א שאין פודין בבן
 * פקועה)</small>"). So this is a text split, not a judgment. `rema` is empty
 * when the seif has no gloss.
 */
export function splitRema(html: string | undefined): { mechaber: string; rema: string[] } {
  const src = html ?? '';
  const rema: string[] = [];
  const mechaber = src.replace(/<small>([\s\S]*?)<\/small>/g, (_m, inner: string) => {
    const text = cleanCodeText(inner)
      .replace(/^הגה[:.\s]*/, '')
      .replace(/^\(([^()]*)\)[\s:.]*$/, '$1')
      .trim();
    if (text) rema.push(text);
    return ' ';
  });
  return { mechaber: cleanCodeText(mechaber).replace(/\s+([:.])/g, '$1'), rema };
}

// ---------------------------------------------------------------------------
// Which codes belong to a topic (by the daf lines Sefaria links them from)
// ---------------------------------------------------------------------------

/** A topic's place on the daf, 0-indexed like the halacha mark's segment range. */
export interface LineRange {
  start: number;
  end: number;
}

/** How a code ref was tied to a topic: linked from one of the topic's own daf
 *  lines, or from a line just outside it (Ein Mishpat marks a law once, where
 *  its source starts, so a topic can sit a line or two past the mark). */
export type LineMatch = 'on-lines' | 'near';

/** How far outside a topic's lines a link may sit and still count as `near`. */
export const NEAR_LINES = 2;

function anchorsOf(s: HalachicSnippet): LineRange[] {
  if (s.anchors?.length) return s.anchors.map((a) => ({ start: a.segStart, end: a.segEnd }));
  if (typeof s.segStart === 'number') return [{ start: s.segStart, end: s.segEnd ?? s.segStart }];
  return [];
}

/** Lines between a link and a topic range: 0 when they overlap. */
function lineDistance(a: LineRange, topic: LineRange): number {
  if (a.end < topic.start) return topic.start - a.end;
  if (a.start > topic.end) return a.start - topic.end;
  return 0;
}

/** One code ref tied to a topic, with its clean text. */
export interface TopicCodeRef {
  ref: string;
  /** Hebrew form of `ref`; empty when Sefaria gave none. */
  heRef?: string;
  match: LineMatch;
  einMishpat: boolean;
  /** Clean Hebrew. For the Shulchan Aruch this is the Mechaber's words only. */
  hebrew: string;
  english: string;
  /** Shulchan Aruch only: the Rema's glosses on this seif (Hebrew), if any. */
  rema?: string[];
}

export interface TopicCodifier {
  id: CodifierId;
  label: string;
  short: string;
  order: number;
  refs: TopicCodeRef[];
}

/**
 * The codes that belong to one topic, chosen by the daf lines Sefaria links them
 * from — no model involved. For each primary codifier (Rambam, Tur, Shulchan
 * Aruch): refs linked from the topic's own lines; if there are none, refs linked
 * from within NEAR_LINES of it. Only Ein Mishpat links may count as `near`; a
 * looser topical link must sit on the topic's lines. A codifier with no match is
 * left out, so an empty result means "nothing is linked to these lines".
 *
 * With no range (older callers) every ref on the daf counts as on-lines.
 */
export function codesForLines(
  bundle: HalachicRefBundle | undefined,
  range?: LineRange | null,
): TopicCodifier[] {
  const out: TopicCodifier[] = [];
  for (const node of buildCodificationChain(bundle)) {
    const scored = node.refs
      .map((r) => {
        const dists = anchorsOf(r).map((a) => (range ? lineDistance(a, range) : 0));
        const d = dists.length ? Math.min(...dists) : range ? Number.POSITIVE_INFINITY : 0;
        return { r, d };
      })
      .filter(({ r, d }) => d === 0 || (r.einMishpat && d <= NEAR_LINES));
    const onLines = scored.filter((x) => x.d === 0);
    const picked = onLines.length ? onLines : scored.sort((a, b) => a.d - b.d);
    if (!picked.length) continue;
    out.push({
      id: node.id,
      label: node.label,
      short: node.short,
      order: node.order,
      refs: picked.map(({ r, d }) => {
        const isSA = node.id === 'shulchan-aruch';
        const split = isSA ? splitRema(r.hebrew) : null;
        return {
          ref: r.ref,
          heRef: r.heRef ?? '',
          match: d === 0 ? 'on-lines' : 'near',
          einMishpat: Boolean(r.einMishpat),
          hebrew: split ? split.mechaber : cleanCodeText(r.hebrew),
          english: cleanCodeText(r.english),
          ...(split?.rema.length ? { rema: split.rema } : {}),
        };
      }),
    });
  }
  return out;
}

/** Read a topic's line range off a halacha mark instance (the shape the warm
 *  path and the reader both send). Null when the instance carries none. */
export function lineRangeOf(markInput: unknown): LineRange | null {
  if (!markInput || typeof markInput !== 'object') return null;
  const o = markInput as { startSegIdx?: unknown; endSegIdx?: unknown };
  if (typeof o.startSegIdx !== 'number' || o.startSegIdx < 0) return null;
  const end =
    typeof o.endSegIdx === 'number' && o.endSegIdx >= o.startSegIdx ? o.endSegIdx : o.startSegIdx;
  return { start: o.startSegIdx, end };
}

/** Per-ref text caps for the prompt. A Rambam halacha or a seif is short; a Tur
 *  siman has no seifim and can run to thousands of characters. */
const PROMPT_HE_CAP = 1800;
const PROMPT_EN_CAP = 1800;

/**
 * Format the codes tied to a topic, with their exact text, for the codification
 * and practical PROMPTS, so the model reads what each code actually says and can
 * only cite a ref that Sefaria links to the topic's lines. With no range, every
 * code linked to the daf is listed (the older, daf-wide behaviour).
 */
export function formatGroundedRefsForPrompt(
  bundle: HalachicRefBundle | undefined,
  range?: LineRange | null,
): string {
  const codes = codesForLines(bundle, range);
  if (!codes.length) {
    return range
      ? '(no Mishneh Torah, Tur or Shulchan Aruch ref is linked to these lines of the daf)'
      : '(no codifier links found for this daf)';
  }
  const body = codes
    .map((c) => {
      const refs = c.refs
        .map((r) => {
          const tags = [
            r.match === 'near' ? 'linked from a line just outside this topic' : null,
            r.einMishpat ? 'Ein Mishpat' : null,
          ].filter(Boolean);
          const tag = tags.length ? ` [${tags.join('; ')}]` : '';
          const lines = [`  - ${r.ref}${tag}`];
          if (r.hebrew) lines.push(`    HE: ${truncate(r.hebrew, PROMPT_HE_CAP)}`);
          for (const g of r.rema ?? []) lines.push(`    REMA (הגה): ${truncate(g, PROMPT_HE_CAP)}`);
          if (r.english) lines.push(`    EN: ${truncate(r.english, PROMPT_EN_CAP)}`);
          return lines.join('\n');
        })
        .join('\n');
      return `${c.label}:\n${refs}`;
    })
    .join('\n\n');
  return body;
}

/** Loose ref equality for tying a model's cited ref back to a Sefaria ref: the
 *  model often drops the book name ("Orach Chayim 235" for "Tur, Orach Chayim
 *  235") or spells Chayyim / Shulchan Aruch differently. */
export function sameCodeRef(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(?:mishneh torah|tur|shulchan aru[ck]h|rema)\s*,\s*/, '')
      .replace(/chayyim/g, 'chayim')
      .replace(/yoreh deah/g, "yoreh de'ah")
      .replace(/[^a-z0-9:' ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return norm(a) !== '' && norm(a) === norm(b);
}

// ---------------------------------------------------------------------------
// Derivation (reverse: code → gemara sources, "where it comes from")
// ---------------------------------------------------------------------------

export type SourceKind = 'bavli' | 'yerushalmi' | 'tanakh' | 'other';

/** A Sefaria related-link as seen from a code ref (only the fields we use). */
export interface RelatedLink {
  ref: string;
  category: string;
  /** True when Ein Mishpat / Ner Mitzvah asserts this code↔source link — the
   *  authoritative classical derivation, vs. a looser topical match. */
  einMishpat?: boolean;
}

/** Classify a source ref returned when querying a code ref's related links.
 *  Bavli is the source we care about; Yerushalmi/Tanakh are parallels/roots. */
export function classifyShasSource(ref: string, category?: string): SourceKind {
  const r = (ref ?? '').trim();
  if (/^Jerusalem Talmud\b/i.test(r)) return 'yerushalmi';
  if (category === 'Tanakh') return 'tanakh';
  if (category === 'Talmud') return 'bavli';
  return 'other';
}

/** Strip a Bavli ref down to its "Tractate Daf" base, dropping the trailing
 *  segment / range — including amud-spanning ranges (e.g. "Berakhot 2a:1-3" →
 *  "Berakhot 2a", "Sanhedrin 2a:1-2b:2" → "Sanhedrin 2a"). Falls back to
 *  trimming a trailing ":N" when there's no daf-form match. */
export function baseDafRef(ref: string): string {
  const r = (ref ?? '').trim();
  const m = r.match(/^(.+?\s\d+[ab])\b/);
  return m ? m[1] : r.replace(/:\d+(?:-\d+)?$/, '');
}

/**
 * Inverse of `baseDafRef`: split a Bavli base ref ("Berakhot 31a", "Bava Metzia
 * 59b") into the tractate + page the in-app reader navigates by. The tractate
 * may be several words (Rosh Hashanah, Moed Katan, Avodah Zarah), so the daf
 * (\d+[ab]) is the anchor and everything before it is the tractate, VERBATIM.
 *
 * Deliberately does NO spelling normalization: the tractate is whatever the
 * source ref spelled. Callers navigate only when that string matches an app
 * tractate slug (the Sefaria-derived refs match for all of Shas today). If a
 * future source spells a tractate differently, this is the seam where a
 * normalization map would slot in — see tests/halacha-codifiers.test.ts.
 *
 * Returns null for anything that isn't a "<words> <daf>" Bavli ref (Tanakh
 * verses, Yerushalmi chapter:halacha refs), which aren't dapim in this reader.
 */
export function parseBavliRef(ref: string): { tractate: string; page: string } | null {
  const m = (ref ?? '').trim().match(/^(.+?)\s+(\d+[ab])$/);
  return m ? { tractate: m[1], page: m[2] } : null;
}

export type DerivationRole = 'primary' | 'related' | 'root';

export interface DerivationSource {
  /** Base ref ("Berakhot 2a", "Leviticus 19:5"). */
  ref: string;
  kind: SourceKind;
  role: DerivationRole;
  /** True when this is the daf currently being viewed. */
  isCurrent: boolean;
  /** True when Ein Mishpat / Ner Mitzvah anchors the code to this source — the
   *  authoritative derivation, surfaced ahead of looser topical links. */
  einMishpat: boolean;
}

function roleFor(kind: SourceKind): DerivationRole {
  if (kind === 'bavli') return 'primary';
  if (kind === 'tanakh') return 'root';
  return 'related';
}

/**
 * Build the "where it comes from" source list from a code ref's related links.
 * Bavli dapim become primary sources, Yerushalmi are related, Tanakh are roots;
 * the daf currently being read is flagged `isCurrent`. Deduped to base refs and
 * ordered primary → related → root, current daf first within its group.
 */
export function buildDerivation(
  links: RelatedLink[],
  current?: { tractate: string; page: string },
): DerivationSource[] {
  const curBase = current ? `${current.tractate} ${current.page}`.trim() : null;
  const byRef = new Map<string, DerivationSource>();
  for (const l of links ?? []) {
    const kind = classifyShasSource(l.ref, l.category);
    if (kind === 'other') continue;
    // Only Bavli refs collapse to the daf; Yerushalmi (chapter:halacha:segment)
    // and Tanakh (verse-precise) refs are kept whole.
    const ref = kind === 'bavli' ? baseDafRef(l.ref) : (l.ref ?? '').trim();
    if (!ref) continue;
    const existing = byRef.get(ref);
    if (existing) {
      // Same base ref can arrive via several links (e.g. a topical match AND an
      // Ein Mishpat anchor) — keep it authoritative if any link asserts it.
      existing.einMishpat = existing.einMishpat || Boolean(l.einMishpat);
      continue;
    }
    byRef.set(ref, {
      ref,
      kind,
      role: roleFor(kind),
      isCurrent: curBase != null && ref === curBase,
      einMishpat: Boolean(l.einMishpat),
    });
  }
  const roleRank: Record<DerivationRole, number> = { primary: 0, related: 1, root: 2 };
  return Array.from(byRef.values()).sort((a, b) => {
    if (a.role !== b.role) return roleRank[a.role] - roleRank[b.role];
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1; // current daf leads its group
    if (a.einMishpat !== b.einMishpat) return a.einMishpat ? -1 : 1; // authoritative first
    return a.ref.localeCompare(b.ref);
  });
}
