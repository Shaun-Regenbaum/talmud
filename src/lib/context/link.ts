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

import { dafCoord, type AnchorCoord, type DafRef } from './coord.ts';
import { coordLabel } from './types.ts';

/** The kinds of link the system models. Grows as flow/voice converge. */
export type LinkRelation = 'cites' | 'continues';

export interface Link {
  relation: LinkRelation;
  /** The anchors this link points TO. Deduped at render time. */
  targets: AnchorCoord[];
}

/** The citation link for a context item's external refs, or null when it cites
 *  nothing. Replaces the old `citesLabel` side channel: a citation is now just a
 *  Link with relation 'cites'. */
export function citationLink(refs: AnchorCoord[] | undefined): Link | null {
  if (!refs || !refs.length) return null;
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
  if (!link || !link.targets.length) return '';
  return [...new Set(link.targets.map(coordLabel))].join(', ');
}
