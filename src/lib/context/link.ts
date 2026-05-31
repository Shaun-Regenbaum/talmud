/**
 * Link — a piece that connects a source anchor to one or more TARGET anchors
 * under a named relation. This is the asymmetric "link piece" of the framework
 * (see docs/framework.md): unlike a note, which sits at one place, a link points
 * from where it lives to somewhere else.
 *
 * Today only the CITATION relation is modelled — a study note pointing at the
 * coordinates it cites (e.g. Revach l'Daf saying "see Pesachim 50a"). The
 * source anchor is implicit in the piece carrying the link; a `Link` names the
 * relation + its targets. Flow / bridge / voice edges are the other links in the
 * system and will join this union as they are unified (framework step 5) — at
 * which point this file is where their shared rendering converges, instead of
 * each having its own bespoke encoding.
 */

import type { AnchorCoord } from './coord.ts';
import { coordLabel } from './types.ts';

/** The kinds of link the system models. Grows as flow/bridge/voice converge. */
export type LinkRelation = 'cites';

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

/** A link's targets as a compact, deduped label: "Pesachim 50a, Shabbat 2a".
 *  '' when there are no targets. The relation WORD (e.g. "cites") is supplied by
 *  the renderer, not baked in here, so one link can read differently in prose vs.
 *  a chip. */
export function linkLabel(link: Link | null | undefined): string {
  if (!link || !link.targets.length) return '';
  return [...new Set(link.targets.map(coordLabel))].join(', ');
}
