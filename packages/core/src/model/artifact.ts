/**
 * Artifact — one produced piece: a typed body pinned to anchors, with full
 * provenance. Marks' instances, enrichment outputs, context items, links, and
 * anchor refinements are all artifacts; `kind` is an open string so apps can
 * define their own without touching core.
 */

import type { Anchor } from './anchor.ts';
import type { Provenance } from './provenance.ts';

export interface Artifact<Body = unknown> {
  id: string;
  /** 'mark-instance' | 'enrichment' | 'context-item' | 'link' |
   *  'anchor-refinement' | app-defined. */
  kind: string;
  anchors: Anchor[];
  body: Body;
  provenance: Provenance;
}

/** Body of a kind='link' artifact: the artifact's anchors[0] is the source,
 *  the rest are targets, related under `relation` (see ../context/link.ts for
 *  the modelled relation set). */
export interface LinkBody {
  relation: string;
}

export type { LinkRelation } from '../context/link.ts';
