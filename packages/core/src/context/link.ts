/**
 * Link — a piece that connects a source anchor to one or more TARGET anchors
 * under a named relation. This is the asymmetric "link piece" of the framework
 * (see docs/framework.md): unlike a note, which sits at one place, a link points
 * from where it lives to somewhere else.
 *
 * Two relations are modelled so far:
 *   - CITES: a study note pointing at the coordinates it cites (e.g. Revach
 *     l'Daf saying "see Pesachim 50a").
 *   - CONTINUES: the tractate-continuity edge — the closing discussion of one
 *     daf carrying into the next (the cross-daf bridge), targeted at the next
 *     daf (whole-daf level).
 * The source anchor is implicit in the piece carrying the link; a `Link` names
 * the relation + its targets. Flow / voice edges are the remaining links in the
 * system and join this union as they are unified (framework step 5) — this file
 * is where their shared rendering converges, instead of each having its own
 * bespoke encoding.
 */

import { type AnchorCoord, coordForSeg, type DafRef, dafCoord, spineCoord } from './coord.ts';
import { coordLabel } from './types.ts';

/** The kinds of link the system models. This is the SAME relation set the
 *  argument-overview flow graph emits between sections, so flow / voice edges
 *  express directly as Links (see `flowLinks`). `cites` + `continues` already
 *  render in prose / on /api/bridge; the rest arrive with their consumers. */
export type LinkRelation =
  | 'cites'
  | 'continues'
  | 'resolves'
  | 'depends-on'
  | 'parallels'
  | 'contrasts'
  | 'generalizes'
  // A commentary spine (Rashi / Tosafot / a rishon) glossing the daf text it
  // sits over. Not a flow relation — it's the cross-spine edge from a
  // commentary spine into the Gemara. See `glossLinks`.
  | 'glosses';

/** Runtime membership test for the LinkRelation union (for validating an
 *  untyped `kind` string from an enrichment's JSON output). */
const LINK_RELATIONS: ReadonlySet<string> = new Set<LinkRelation>([
  'cites',
  'continues',
  'resolves',
  'depends-on',
  'parallels',
  'contrasts',
  'generalizes',
  'glosses',
]);
export function isLinkRelation(kind: string): kind is LinkRelation {
  return LINK_RELATIONS.has(kind);
}

/** The subset of relations the argument-overview FLOW graph can emit between
 *  sections. Excludes `cites` (a citation, not a flow edge) and `glosses` (the
 *  cross-spine commentary edge) so `flowLinks` can't promote either to a
 *  `via: 'flow'` link from stray cached flow data. */
const FLOW_RELATIONS: ReadonlySet<string> = new Set<LinkRelation>([
  'continues',
  'resolves',
  'depends-on',
  'parallels',
  'contrasts',
  'generalizes',
]);
function isFlowRelation(kind: string): kind is LinkRelation {
  return FLOW_RELATIONS.has(kind);
}

export interface Link {
  relation: LinkRelation;
  /** The anchors this link points TO. Deduped at render time. */
  targets: AnchorCoord[];
}

/** The citation link for a context item's external refs, or null when it cites
 *  nothing. Replaces the old `citesLabel` side channel: a citation is now just a
 *  Link with relation 'cites'. */
export function citationLink(refs: AnchorCoord[] | undefined): Link | null {
  if (!refs?.length) return null;
  return { relation: 'cites', targets: refs };
}

/** The tractate-continuity link: this daf's discussion continues into `to` (the
 *  next daf), at whole-daf level. Built from a cross-daf bridge when it
 *  `continues`; null otherwise. The bespoke DafBridge shape still carries the
 *  verdict + reasoning — this expresses just the EDGE in the shared Link
 *  vocabulary, so a continuous-spine view can stitch dapim the same way it
 *  renders any other link. */
export function continuationLink(to: DafRef | null | undefined): Link | null {
  if (!to) return null;
  return { relation: 'continues', targets: [dafCoord(to)] };
}

/** A link's targets as a compact, deduped label: "Pesachim 50a, Shabbat 2a".
 *  '' when there are no targets. The relation WORD (e.g. "cites") is supplied by
 *  the renderer, not baked in here, so one link can read differently in prose vs.
 *  a chip. */
export function linkLabel(link: Link | null | undefined): string {
  if (!link?.targets.length) return '';
  return [...new Set(link.targets.map(coordLabel))].join(', ');
}

/** One edge of the argument-overview flow graph: section `from` relates to
 *  section `to` under `kind`, where the numbers are 0-based section indices on
 *  the daf. (Mirrors `FlowConnection` in ArgumentFlowGraph, kept structural so
 *  this lib doesn't depend on the client.) */
export interface FlowEdge {
  from: number;
  to: number;
  kind: string;
}

/** A flow edge expressed in the shared Link vocabulary: the SOURCE section's
 *  coordinate paired with the Link to its target. The flow graph's source is
 *  implicit-per-section, so we surface it explicitly here. */
export interface FlowLink {
  source: AnchorCoord;
  link: Link;
}

/**
 * Express the argument-overview flow graph as Links. The graph emits
 * `{from, to, kind}` over section INDICES; given a resolver from a section
 * index to its coordinate (e.g. the section's first segment), each edge becomes
 * a `{source, link}` in the same vocabulary as citations and bridges. So a
 * future "all links on this daf" or continuous-spine view renders flow edges
 * with the one `linkLabel` path, instead of the flow graph being a bespoke
 * island. Edges with an unknown `kind`, or whose endpoints don't resolve to a
 * coordinate, are dropped (the renderer already guards bad indices).
 */
export function flowLinks(
  edges: readonly FlowEdge[],
  coordOf: (sectionIdx: number) => AnchorCoord | null,
): FlowLink[] {
  const out: FlowLink[] = [];
  for (const e of edges) {
    if (!isFlowRelation(e.kind) || e.from === e.to) continue;
    const source = coordOf(e.from);
    const target = coordOf(e.to);
    if (!source || !target) continue;
    out.push({ source, link: { relation: e.kind, targets: [target] } });
  }
  return out;
}

/** The minimal shape `glossLinks` needs from a commentary work — kept
 *  structural so this lib doesn't depend on the worker's `CommentaryWork`. Each
 *  comment carries the daf segment index it glosses (the Sefaria anchor). */
export interface CommentaryWorkLike {
  title: string;
  comments: readonly { anchorSegIdx: number }[];
}

/**
 * Express a daf's commentary as Links — the cross-spine edges the framework's
 * "commentary spines" step adds. Each commentary work (Rashi, Tosafot, a
 * rishon) becomes ONE link sourced on its own spine ({@link spineCoord}) and
 * targeting the deduped daf segments it glosses, under relation 'glosses'. One
 * link per work (not per comment) keeps the daf-level graph compact: "Rashi
 * glosses segs 0,1,4 of this daf." Works with no resolvable anchor segment are
 * dropped. This lifts the bespoke `CommentaryAnchorIndex` (segToPieces /
 * pieceToSegs) into the same Link vocabulary as citations, bridges, and flow.
 */
export function glossLinks(daf: DafRef, works: readonly CommentaryWorkLike[]): FlowLink[] {
  const out: FlowLink[] = [];
  for (const work of works) {
    const segs = new Set<number>();
    for (const cm of work.comments) {
      if (typeof cm.anchorSegIdx === 'number' && cm.anchorSegIdx >= 0) segs.add(cm.anchorSegIdx);
    }
    if (segs.size === 0) continue;
    const targets = [...segs].sort((a, b) => a - b).map((s) => coordForSeg(daf, s));
    out.push({ source: spineCoord(work.title, daf), link: { relation: 'glosses', targets } });
  }
  return out;
}
