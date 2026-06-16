/**
 * linkSelect — per-anchor SELECTION and family CLASSIFICATION over the link
 * graph. The spine produces every connection as a sourced link (a DafLink:
 * source coord + relation + targets + via); both the worker (bucketing a daf's
 * links onto its sections) and the reader (placing a marker on the right node)
 * need to ask the same two questions: "which links hang off THIS segment?" and
 * "what kind of marker is this?". Those used to be answered ad hoc — the
 * worker's inline section bucketing, the reader's relation-grouped chip list.
 * This is the one shared, tested place, so the #spine page and the daf reader
 * agree.
 *
 * Pure: depends only on coord.ts + link.ts. No I/O, no DOM, unit-testable.
 */

import { type AnchorCoord, coordForSeg, coordKey, DAF_SEG, type DafRef } from './coord.ts';
import type { LinkRelation } from './link.ts';

/** The minimal source-explicit edge shape the selector operates on. `DafLink`
 *  (dafLinks.ts) — the only link shape carrying source + relation + targets +
 *  via on every edge — satisfies it structurally; defining it here keeps core
 *  free of any talmud dependency. */
export interface SourcedLink {
  source: AnchorCoord;
  relation: LinkRelation;
  targets: AnchorCoord[];
  via?: string;
  note?: string;
}

export type LinkDirection = 'out' | 'in' | 'both';

export interface LinkAtOpts {
  /** 'out' (default): links whose SOURCE is at `coord`. 'in': links TARGETING
   *  `coord`. 'both': either side. */
  direction?: LinkDirection;
  /** Restrict to these producers (a DafLink `via`). */
  via?: string | readonly string[];
  /** Restrict to these relations. */
  relation?: LinkRelation | readonly LinkRelation[];
  /** When true (default), a daf-level coord (DAF_SEG) on EITHER side matches any
   *  segment of the same (tractate, page, spine) — so a whole-daf link (the
   *  continuity backbone, an unplaced cite, a gloss spine) is found by a
   *  per-section query, and a per-section query finds a daf-level target.
   *  Exact-coord equality alone silently under-selects every whole-daf link. */
  dafLevel?: boolean;
}

/** Whether two coords name the same place. With `dafLevel`, a DAF_SEG on either
 *  side widens the match to the whole (tractate, page, spine); otherwise the
 *  full coordKey (segment AND spine) must be equal. Spine stays in the
 *  comparison even when widened, so a Gemara-section query never picks up a
 *  commentary- or external-spine source sitting at the same seg. */
function coordMatch(a: AnchorCoord, b: AnchorCoord, dafLevel: boolean): boolean {
  if (dafLevel && (a.seg === DAF_SEG || b.seg === DAF_SEG)) {
    return a.tractate === b.tractate && a.page === b.page && (a.spine ?? '') === (b.spine ?? '');
  }
  return coordKey(a) === coordKey(b);
}

/** Membership test for an optional single-or-list filter. Absent filter = no
 *  restriction; a value of `undefined` never matches a present filter. */
function matchesFilter<T>(filter: T | readonly T[] | undefined, value: T | undefined): boolean {
  if (filter === undefined) return true;
  if (value === undefined) return false;
  return Array.isArray(filter) ? (filter as readonly T[]).includes(value) : filter === value;
}

/** The links touching `coord`, filtered by direction / via / relation. */
export function linksAt<L extends SourcedLink>(
  edges: readonly L[],
  coord: AnchorCoord,
  opts: LinkAtOpts = {},
): L[] {
  const direction = opts.direction ?? 'out';
  const dafLevel = opts.dafLevel ?? true;
  const out: L[] = [];
  for (const e of edges) {
    if (!matchesFilter(opts.via, e.via)) continue;
    if (!matchesFilter(opts.relation, e.relation)) continue;
    const isOut = direction !== 'in' && coordMatch(coord, e.source, dafLevel);
    const isIn = direction !== 'out' && e.targets.some((t) => coordMatch(coord, t, dafLevel));
    if (isOut || isIn) out.push(e);
  }
  return out;
}

/** The outgoing links anchored to a section, given the section's first segment.
 *  This is the per-node placement the reader's argument map calls — and the
 *  shared rule the worker's section bucketing uses — so a link sourced anywhere
 *  in the section (or daf-level) hangs off that section's node. Consumers filter
 *  the result by {@link family} (a 'continuity'/'flow' link is a caption/arrow,
 *  not a marker). */
export function linksFromSection<L extends SourcedLink>(
  edges: readonly L[],
  daf: DafRef,
  sectionStartSeg: number,
  opts: Omit<LinkAtOpts, 'direction'> = {},
): L[] {
  return linksAt(edges, coordForSeg(daf, sectionStartSeg), {
    ...opts,
    direction: 'out',
    dafLevel: opts.dafLevel ?? true,
  });
}

/** The display/marker family a link belongs to — drives marker colour and
 *  whether a link renders as an exit marker, an in-graph arrow, or a caption. */
export type LinkFamily =
  | 'flow' // in-daf section→section: an in-graph arrow, not a marker
  | 'continuity' // the tractate backbone (daf→next daf): a caption
  | 'parallel' // cross-text parallels (mesorat ha-shas, Yerushalmi)
  | 'citation' // a cite to another daf
  | 'scripture' // a cite into Tanach (a pasuk)
  | 'codification' // a halachic-code ref (Rambam → Tur → Shulchan Arukh)
  | 'gloss'; // a commentary spine glossing the daf

const PARALLEL_VIA: ReadonlySet<string> = new Set(['mesorah', 'yerushalmi']);

/**
 * Classify a link into its display family. Via-aware, because the relation
 * alone is lossy: 'continues' is the backbone (via 'bridge') vs in-daf flow
 * (via 'flow'); 'parallels' is a cross-text parallel (via 'mesorah'/'yerushalmi')
 * vs an in-daf flow relation; 'cites' is scripture (via 'pesuk') vs a daf cite.
 * Takes the bare (relation, via) so a relation not yet in the LinkRelation union
 * (e.g. 'codifies', wired with the halacha producer) classifies without a
 * union change here. Anything unclassified falls through to 'flow' — it renders
 * as an arrow / is excluded from markers, the safe default.
 */
export function family(edge: { relation: string; via?: string }): LinkFamily {
  const { relation, via } = edge;
  if (relation === 'cites') return via === 'pesuk' ? 'scripture' : 'citation';
  if (relation === 'codifies') return 'codification';
  if (relation === 'glosses') return 'gloss';
  if (relation === 'continues') return via === 'bridge' ? 'continuity' : 'flow';
  if (relation === 'parallels' && via !== undefined && PARALLEL_VIA.has(via)) return 'parallel';
  return 'flow';
}
