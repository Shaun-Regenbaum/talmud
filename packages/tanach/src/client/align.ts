/**
 * Alignment-page derivations — pure, so they unit-test without the component.
 *
 * A producer piece's verse ANCHOR is computed from its instance (the raw key
 * tail chapter-runs reports): a `start-end` range for `note`, a single verse for
 * the per-verse pieces (`synthesis` / `midrash-synthesis`), or the whole chapter
 * for a chapter-scoped piece (`events` / `overview` / `geography` / `tidbit`,
 * which carry no instance). Nothing here is hard-coded per producer — it reads
 * the instance shape the registry's key already encodes.
 */

/** The fields of a chapter-runs row the alignment view needs to place a piece. */
export interface AlignAnchor {
  instanceRaw: string | null;
}

export function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** The verse numbers a piece anchors to (1-based), derived from its instance. */
export function versesOf(r: AlignAnchor, totalVerses: number): number[] {
  if (r.instanceRaw == null) return range(1, totalVerses);
  const span = r.instanceRaw.match(/^(\d+)-(\d+)$/);
  if (span) return range(Number(span[1]), Number(span[2]));
  const v = Number(r.instanceRaw);
  return Number.isFinite(v) ? [v] : range(1, totalVerses);
}

/** A short human label for a piece's anchor (whole chapter / verses a-b / verse n). */
export function anchorLabel(r: AlignAnchor): string {
  if (r.instanceRaw == null) return 'whole chapter';
  return /^\d+-\d+$/.test(r.instanceRaw) ? `verses ${r.instanceRaw}` : `verse ${r.instanceRaw}`;
}
