/** What the text says about one sage: who they are linked to, how, and the words that say it. */

export interface SageLinkRow {
  ref: string;
  /** The sage who does the relation, and the sage it is done to. */
  s: string;
  o: string;
  relation: string;
  quote: string | null;
  reason: string | null;
}

export interface SageLinkExample {
  ref: string;
  quote: string | null;
  reason: string | null;
}

export interface SageLink {
  partner: string;
  relation: string;
  /** What this sage is in the relation. "both" for a relation that has no direction. */
  role: 'subject' | 'object' | 'both';
  passages: number;
  examples: SageLinkExample[];
}

// Disagreement has no side to read it from: "A disagreed with B" and "B disagreed with A" are one thing here.
const SYMMETRIC = new Set(['spouse_of', 'sibling_of', 'opposes']);
export const MAX_EXAMPLES = 3;
export const MAX_LINKS = 150;

/** Groups one sage's confirmed links by partner and relation. One passage counts once. */
export function summarizeSageLinks(slug: string, rows: SageLinkRow[]): SageLink[] {
  const found = new Map<string, SageLink & { seen: Set<string> }>();
  for (const row of rows) {
    if (row.s !== slug && row.o !== slug) continue;
    if (row.s === row.o) continue;
    const partner = row.s === slug ? row.o : row.s;
    const role = SYMMETRIC.has(row.relation) ? 'both' : row.s === slug ? 'subject' : 'object';
    const key = `${partner}|${row.relation}|${role}`;
    let link = found.get(key);
    if (!link) {
      link = { partner, relation: row.relation, role, passages: 0, examples: [], seen: new Set() };
      found.set(key, link);
    }
    if (link.seen.has(row.ref)) continue;
    link.seen.add(row.ref);
    link.passages++;
    if (link.examples.length < MAX_EXAMPLES && row.quote) {
      link.examples.push({ ref: row.ref, quote: row.quote, reason: row.reason });
    }
  }
  return [...found.values()]
    .map(({ seen: _seen, ...link }) => link)
    .sort(
      (a, b) =>
        b.passages - a.passages ||
        a.partner.localeCompare(b.partner) ||
        a.relation.localeCompare(b.relation),
    )
    .slice(0, MAX_LINKS);
}
