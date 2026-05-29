/**
 * @fileoverview Cross-daf anchor coordinate — a (tractate, page, seg) triple
 * that names a single segment ANYWHERE in Shas, not just on the daf currently
 * in view.
 *
 * The rest of the grounding layer (placement.ts, match.ts) speaks in bare
 * segment indices, which are only meaningful relative to one daf. That's the
 * right model for in-daf reading, but it can't express "this note's real home
 * is Gittin 67b seg 4" while you're looking at 68a, which is what a cross-page
 * sugya map needs. An `AnchorCoord` carries the daf with the segment so a span
 * can straddle pages.
 *
 * This module is PURELY ADDITIVE: in-daf readers ignore `coord` and keep using
 * `segs`. Producers that know an off-daf target (a parallel-sugya matcher, a
 * citation resolver, the existing CrossDafAnchor output) populate it; the
 * helpers here normalize, group, and bridge it. Nothing here reads the network
 * or the DOM, so it lives in src/lib and is unit-testable.
 */

/** One segment anywhere in Shas. `seg` is the 0-based Sefaria segment index
 *  within (tractate, page) — the same canonical coordinate the in-daf layer
 *  uses, just carried together with its daf. */
export interface AnchorCoord {
  tractate: string;
  page: string;
  seg: number;
}

/** An ordered set of coordinates that may straddle multiple dapim. */
export type AnchorSpan = AnchorCoord[];

/** A daf reference (the (tractate, page) half of a coordinate). */
export type DafRef = { tractate: string; page: string };

/** Stable string id for a coordinate — safe as a Map/Set key. */
export function coordKey(c: AnchorCoord): string {
  return `${c.tractate}:${c.page}:${c.seg}`;
}

/** Whether two daf references name the same page. */
export function sameDaf(a: DafRef, b: DafRef): boolean {
  return a.tractate === b.tractate && a.page === b.page;
}

/** A coordinate for a local segment index on a given daf. */
export function coordForSeg(daf: DafRef, seg: number): AnchorCoord {
  return { tractate: daf.tractate, page: daf.page, seg };
}

/** Coordinates for a list of local segment indices on a given daf. */
export function coordsForSegs(daf: DafRef, segs: number[]): AnchorSpan {
  return segs.map((seg) => coordForSeg(daf, seg));
}

/** The local segment index if `c` sits on `daf`, else null. The inverse of
 *  coordForSeg — used to fold a cross-daf span back to in-daf segments for the
 *  page currently in view. */
export function localSeg(c: AnchorCoord, daf: DafRef): number | null {
  return sameDaf(c, daf) ? c.seg : null;
}

/** Whether a coordinate points off the given daf (i.e. is genuinely cross-daf
 *  relative to the page in view). */
export function isCrossDaf(c: AnchorCoord, currentDaf: DafRef): boolean {
  return !sameDaf(c, currentDaf);
}

/** Dedupe + order a span by (tractate, page, seg). Stable across processes so
 *  the same span always serializes identically (cache-key friendly). */
export function normalizeSpan(span: AnchorSpan): AnchorSpan {
  const seen = new Set<string>();
  const out: AnchorCoord[] = [];
  for (const c of span) {
    const k = coordKey(c);
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  }
  return out.sort(
    (a, b) =>
      a.tractate.localeCompare(b.tractate) ||
      a.page.localeCompare(b.page) ||
      a.seg - b.seg,
  );
}

/** Group a span into per-daf segment lists (normalized: deduped + ordered).
 *  The shape a cross-page sugya map consumes — one entry per daf, each with the
 *  local segments it touches. */
export function spanByDaf(span: AnchorSpan): { tractate: string; page: string; segs: number[] }[] {
  const groups = new Map<string, { tractate: string; page: string; segs: number[] }>();
  for (const c of normalizeSpan(span)) {
    const dk = `${c.tractate}:${c.page}`;
    const g = groups.get(dk) ?? { tractate: c.tractate, page: c.page, segs: [] };
    g.segs.push(c.seg);
    groups.set(dk, g);
  }
  return [...groups.values()];
}

/** Bridge from the existing CrossDafAnchor target shape
 *  ({ tractate, page, segIdx? }) to an AnchorCoord. A missing segIdx means the
 *  target is the whole daf; we anchor it to seg 0 so it still has a coordinate. */
export function coordFromTarget(target: { tractate: string; page: string; segIdx?: number }): AnchorCoord {
  return { tractate: target.tractate, page: target.page, seg: target.segIdx ?? 0 };
}
