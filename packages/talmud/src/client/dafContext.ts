import type { GenerationId } from './generations';

// The unit of identified-rabbi state shared by underlines, timeline, geography
// map, and the bio sidebar. Sourced from the `rabbi` mark run (name/nameHe/
// generation) joined with the rabbi.identity enrichment (slug/region/places/
// moved, from the Sefaria-derived rabbi-places dataset).
export type Movement = 'bavel->israel' | 'israel->bavel' | 'both' | null;

export interface IdentifiedRabbi {
  slug: string | null;
  name: string;
  nameHe: string;
  generation: GenerationId;
  region: 'israel' | 'bavel' | null;
  places: string[];
  moved: Movement;
  bio: string | null;
  image: string | null;
  wiki: string | null;
  /** Grounding provenance from the rabbi mark (unique | relational |
   *  generation | ambiguous | none). 'ambiguous' = an unpinnable homonym. */
  genSource?: string;
  /** Registry candidate count for the name when >1 — lets the card say
   *  "N rabbis share this name" for an ambiguous homonym. */
  homonyms?: number;
}

/**
 * List-identity dedup for daf rabbi lists. The LLM legitimately emits one
 * instance per Hebrew FORM (anchors differ — "ר' ירמיה" and "רבי ירמיה" each
 * underline their own occurrences), but the sidebar/timeline LIST should show
 * one entry per rabbi. Identity, in order of strength:
 *   1. the grounded registry slug (two transliteration variants of the same
 *      rabbi — "Rabbi Yirmiyah"/"Rabbi Yirmeyah" — collapse once grounding
 *      stamped them both);
 *   2. the normalized Hebrew name (geresh title expanded: ר' ירמיה ≡ רבי
 *      ירמיה) — Hebrew comes verbatim from the daf, so it folds English
 *      spelling drift even when only one of the pair carries a slug. Two
 *      entries with DIFFERENT slugs never collapse (a genuine same-name
 *      homonym pair distinguished by grounding stays two rabbis). A
 *      slugless entry folds into a slugged same-name entry ONLY when the
 *      name is not a known homonym (homonyms absent or 1) — when several
 *      registry rabbis share the name, the slugless mention may be a
 *      DIFFERENT bearer than the one grounding pinned, so both stay. Two
 *      SLUGLESS entries with identical Hebrew always collapse — with no
 *      slug on either side they are indistinguishable, and one honest list
 *      row beats two identical ones;
 *   3. the lowercased English name, when there is no Hebrew form.
 * Keeps the FIRST entry per identity. Anchors/underlines are NOT deduped —
 * only list identity.
 */
export function dedupRabbiList<
  T extends { slug?: string | null; name: string; nameHe: string; homonyms?: number },
>(items: T[]): T[] {
  const bySlug = new Set<string>();
  // name key → first owner's {slug, homonyms} so later same-name entries can
  // tell a unique pin from a pinned HOMONYM.
  const byName = new Map<string, { slug: string | null; homonyms: number }>();
  // name keys that already produced a SLUGLESS row — all later slugless
  // same-name entries are indistinguishable from it and always collapse,
  // even when the FIRST bearer of the name was a slugged homonym.
  const keptSlugless = new Set<string>();
  const out: T[] = [];
  const heKey = (s: string): string =>
    s
      .replace(/[֑-ׇ]/g, '') // nikkud + cantillation
      .replace(/^ר['׳]\s+/, 'רבי ') // geresh title shorthand → full title
      .replace(/[.,:;?!"'״׳]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  for (const it of items) {
    const slug = it.slug ?? null;
    const homonyms = typeof it.homonyms === 'number' ? it.homonyms : 1;
    const nameKey = it.nameHe ? heKey(it.nameHe) : it.name.trim().toLowerCase();
    if (!slug && !nameKey) continue;
    if (slug && bySlug.has(slug)) continue;
    if (!slug && nameKey && keptSlugless.has(nameKey)) continue;
    const owner = nameKey ? byName.get(nameKey) : undefined;
    if (owner) {
      // Same surface name. Collapse when:
      //  - both slugless (indistinguishable — keep one honest row), or
      //  - same slug (caught above via bySlug, kept for clarity), or
      //  - exactly one side carries a slug AND the name is not a known
      //    homonym — the slug then identifies the one bearer both refer to.
      // Keep both when the slugs differ, or when one side is slugless and
      // the name IS a homonym (the slugless mention may be another bearer).
      const oneSideSlugless = !slug !== !owner.slug;
      const isHomonym = owner.homonyms > 1 || homonyms > 1;
      if (!slug && !owner.slug) continue;
      if (oneSideSlugless && !isHomonym) continue;
    }
    if (slug) bySlug.add(slug);
    if (!slug && nameKey) keptSlugless.add(nameKey);
    if (nameKey && !owner) byName.set(nameKey, { slug, homonyms });
    out.push(it);
  }
  return out;
}
