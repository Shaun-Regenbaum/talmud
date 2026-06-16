/**
 * Unified term registry — one `Term` shape behind three things that used to be
 * forked: the hebraization always-list (CANONICAL_HEBREW_TERMS), the per-daf
 * background glossary (the daf-background.concepts enrichment), and the prose
 * tooltip pool (ConceptTerm in src/client/conceptLinks.tsx).
 *
 * This is PR1 of the terms-registry rework: it lands the model and the merge
 * resolver, fully unit-tested, but does NOT yet rewire any route or renderer —
 * so reader output is unchanged. Later PRs consume it:
 *   - PR2 feeds globalTerms() into the conceptLinks matcher (tooltip on every
 *     registry term, not just the daf's background concepts).
 *   - PR3 reads `display` for the first-mention-per-section gloss pass.
 *
 * Identity is the Hebrew surface (`hebrew`): the per-daf list overrides a global
 * of the same Hebrew so a daf can sharpen a generic gloss for its own context.
 */
import { CANONICAL_HEBREW_TERMS, type TermCategory, type TermDisplay } from '../hebrewTerms';

export type { TermCategory, TermDisplay } from '../hebrewTerms';

/** Where a term came from: the always-known global list, or this daf's
 *  extracted background concepts. */
export type TermScope = 'global' | 'daf';

/** The unified runtime term. Globals and per-daf concepts both normalize to
 *  this so everything downstream (hebraize, tooltip, glossary card, gloss pass)
 *  reads one shape. */
export interface Term {
  /** Canonical Hebrew surface — the identity key for merge/override. */
  hebrew: string;
  /** Primary romanization. Present on globals; per-daf concepts may lack one. */
  translit?: string;
  /** Alternate romanizations (globals only). */
  variants?: string[];
  /** English label — the surface shown in prose when `display === 'english'`. */
  en?: string;
  /** Short English meaning (tooltip + first-mention gloss). */
  gloss: string;
  /** Short Hebrew meaning, for the tooltip in Hebrew mode. Present on globals
   *  (authored in CANONICAL_HEBREW_TERMS); per-daf concepts leave it unset —
   *  their `gloss` is already in the daf-enrichment's language. */
  glossHe?: string;
  /** Per-term display policy (see TermDisplay). */
  display: TermDisplay;
  /** Glossary grouping. */
  category?: TermCategory;
  /** Provenance. */
  scope: TermScope;
}

/** The shape a daf-background.concepts term arrives in (the enrichment output:
 *  `groups[].terms[]`). Kept local so src/lib stays free of any client import. */
export interface DafConcept {
  /** English label. */
  term: string;
  /** Hebrew script (optional in the wild; concepts without it can't be a term). */
  termHe?: string;
  gloss: string;
  category?: TermCategory;
}

const TERM_CATEGORIES: ReadonlySet<string> = new Set<TermCategory>([
  'legal-concepts',
  'realia',
  'assumed-prior',
]);

const asCategory = (c: string | undefined): TermCategory | undefined =>
  c !== undefined && TERM_CATEGORIES.has(c) ? (c as TermCategory) : undefined;

/** The always-known global terms, normalized to `Term`. */
export function globalTerms(): Term[] {
  return CANONICAL_HEBREW_TERMS.map((t) => ({
    hebrew: t.hebrew,
    translit: t.translit,
    variants: t.variants ? [...t.variants] : undefined,
    en: t.en,
    gloss: t.gloss,
    glossHe: t.glossHe,
    display: t.display,
    category: t.category,
    scope: 'global' as const,
  }));
}

/** Normalize one daf-background concept to a `Term`. Returns null when the
 *  concept has no Hebrew surface (nothing to anchor or hebraize). Daf concepts
 *  default to 'hebrew-first-gloss': Hebrew anchor, glossed on first mention. */
export function conceptToTerm(c: DafConcept): Term | null {
  const hebrew = c.termHe?.trim();
  if (!hebrew) return null;
  return {
    hebrew,
    en: c.term,
    gloss: c.gloss,
    display: 'hebrew-first-gloss',
    category: asCategory(c.category),
    scope: 'daf',
  };
}

/** The glossary in effect for a daf: globals ∪ this daf's terms, with the daf's
 *  term winning on a Hebrew-key collision. Order is globals first (stable input
 *  order), then daf-only terms in input order. */
export function glossaryForDaf(dafTerms: readonly Term[]): Term[] {
  const byHebrew = new Map<string, Term>();
  for (const t of globalTerms()) byHebrew.set(t.hebrew, t);
  for (const t of dafTerms) byHebrew.set(t.hebrew, t);
  return [...byHebrew.values()];
}
