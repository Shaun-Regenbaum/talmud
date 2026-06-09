/**
 * Whole-daf Background: the terms/concepts a reader needs to follow the daf,
 * grouped into themed categories. DOM-free types + the pure normalizer that
 * canonicalizes the `daf-background.concepts` LLM output for display. Kept in its
 * own module (no JSX / no solid imports) so it's cheaply unit-testable in the
 * node project — the renderer (BackgroundGroups in ArgumentSidebar.tsx) imports
 * from here.
 */

export type BackgroundCategory = 'legal-concepts' | 'realia' | 'assumed-prior';
export interface BackgroundTerm {
  term: string;
  termHe?: string;
  gloss: string;
}
export interface BackgroundGroup {
  category: BackgroundCategory;
  terms: BackgroundTerm[];
}

/** Fixed display order — also the allowlist of known categories. (No 'persons':
 *  who-argues-what is the daf's argument, owned by the Overview pill.) */
export const BACKGROUND_CATEGORY_ORDER: BackgroundCategory[] = [
  'legal-concepts',
  'realia',
  'assumed-prior',
];

/** Canonicalize the LLM's background groups for display: keep only known
 *  categories that actually carry usable terms, in the fixed order, merging any
 *  duplicate category emissions and dropping terms missing a label or gloss.
 *  Pure (no DOM) so the grouping is unit-testable, mirroring filterFlowConnections. */
export function orderBackgroundGroups(groups: BackgroundGroup[] | undefined): BackgroundGroup[] {
  if (!Array.isArray(groups)) return [];
  const byCat = new Map<BackgroundCategory, BackgroundTerm[]>();
  for (const g of groups) {
    if (!g || !BACKGROUND_CATEGORY_ORDER.includes(g.category) || !Array.isArray(g.terms)) continue;
    const terms = g.terms.filter(
      (tm) =>
        tm &&
        typeof tm.term === 'string' &&
        tm.term.trim() &&
        typeof tm.gloss === 'string' &&
        tm.gloss.trim(),
    );
    if (terms.length === 0) continue;
    const existing = byCat.get(g.category);
    if (existing) existing.push(...terms);
    else byCat.set(g.category, [...terms]);
  }
  return BACKGROUND_CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({
    category: c,
    terms: byCat.get(c)!,
  }));
}
