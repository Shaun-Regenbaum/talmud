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
  { id: 'mishneh-torah', label: 'Mishneh Torah', short: 'Rambam', order: 1, tier: 'primary', prefix: /^Mishneh Torah\b/ },
  { id: 'tur', label: 'Tur', short: 'Tur', order: 2, tier: 'primary', prefix: /^(?:Tur\b|Arba'ah Turim\b)/ },
  { id: 'shulchan-aruch', label: 'Shulchan Aruch', short: 'Mechaber', order: 3, tier: 'primary', prefix: /^Shulchan Aru[ck]h\b/ },
  { id: 'mishnah-berurah', label: 'Mishnah Berurah', short: 'Mishnah Berurah', order: 4, tier: 'secondary', prefix: /^Mishnah Berurah\b/ },
  { id: 'arukh-hashulchan', label: 'Arukh HaShulchan', short: 'Arukh HaShulchan', order: 5, tier: 'secondary', prefix: /^Arukh HaShulchan\b/ },
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
  /** Grounded refs (with text + daf anchors), in bundle order. */
  refs: HalachicSnippet[];
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
      node = { id: meta.id, label: meta.label, short: meta.short, order: meta.order, tier: meta.tier, refs: [] };
      byId.set(meta.id, node);
    }
    for (const s of snippets) {
      if (!node.refs.some((r) => r.ref === s.ref)) node.refs.push(s);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.order - b.order);
}

/** True when a daf has any codifier anchor — i.e. is genuinely practical
 *  halacha. The redesign suppresses cards on dapim with no codifier hit
 *  (the aggadah over-fire). */
export function hasCodification(bundle: HalachicRefBundle | undefined): boolean {
  return buildCodificationChain(bundle, { includeSecondary: true }).length > 0;
}

function truncate(s: string | undefined, n = 360): string {
  const t = (s ?? '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * Format the grounded codifier refs (with their real Hebrew/English text) for
 * the codification PROMPT, so the LLM SELECTS from real Sefaria refs instead of
 * recalling citations. One block per codifier, its refs listed with capped
 * snippets. Empty-bundle dapim get an explicit marker (the prompt then knows
 * there is nothing to codify).
 */
export function formatGroundedRefsForPrompt(bundle: HalachicRefBundle | undefined): string {
  const chain = buildCodificationChain(bundle, { includeSecondary: true });
  if (!chain.length) return '(no codifier links found for this daf)';
  return chain.map((node) => {
    const refs = node.refs.map((r) => {
      const he = truncate(r.hebrew);
      const en = truncate(r.english);
      return `  - ${r.ref}${he ? `\n    HE: ${he}` : ''}${en ? `\n    EN: ${en}` : ''}`;
    }).join('\n');
    return `${node.label}:\n${refs}`;
  }).join('\n\n');
}

// ---------------------------------------------------------------------------
// Derivation (reverse: code → gemara sources, "where it comes from")
// ---------------------------------------------------------------------------

export type SourceKind = 'bavli' | 'yerushalmi' | 'tanakh' | 'other';

/** A Sefaria related-link as seen from a code ref (only the fields we use). */
export interface RelatedLink {
  ref: string;
  category: string;
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

export type DerivationRole = 'primary' | 'related' | 'root';

export interface DerivationSource {
  /** Base ref ("Berakhot 2a", "Leviticus 19:5"). */
  ref: string;
  kind: SourceKind;
  role: DerivationRole;
  /** True when this is the daf currently being viewed. */
  isCurrent: boolean;
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
  const seen = new Set<string>();
  const out: DerivationSource[] = [];
  for (const l of links ?? []) {
    const kind = classifyShasSource(l.ref, l.category);
    if (kind === 'other') continue;
    // Only Bavli refs collapse to the daf; Yerushalmi (chapter:halacha:segment)
    // and Tanakh (verse-precise) refs are kept whole.
    const ref = kind === 'bavli' ? baseDafRef(l.ref) : (l.ref ?? '').trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    out.push({ ref, kind, role: roleFor(kind), isCurrent: curBase != null && ref === curBase });
  }
  const roleRank: Record<DerivationRole, number> = { primary: 0, related: 1, root: 2 };
  return out.sort((a, b) => {
    if (a.role !== b.role) return roleRank[a.role] - roleRank[b.role];
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1; // current daf leads its group
    return a.ref.localeCompare(b.ref);
  });
}
