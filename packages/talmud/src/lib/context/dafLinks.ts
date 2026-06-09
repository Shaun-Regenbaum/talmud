/**
 * dafLinks — assemble EVERY link on a daf into one list, all expressed through
 * the shared Link vocabulary (src/lib/context/link.ts). The three edge kinds the
 * system produces converge here:
 *   - 'continues' — the tractate-continuity bridge (this daf → the next)
 *   - 'cites'     — a study-aid/context note's external references
 *   - the flow relations (resolves / depends-on / parallels / …) — the
 *                   argument-overview flow graph between this daf's sections
 *
 * Pure: the worker gathers the inputs (bridge verdict, context pool, cached flow
 * edges, section ranges) and calls this. The first real CONSUMER of the link
 * layer — `GET /api/links/:tractate/:page` returns `dafLinks(...)`.
 */

import { type AnchorCoord, coordForSeg, type DafRef, dafCoord } from '@corpus/core/context/coord';
import {
  type CommentaryWorkLike,
  citationLink,
  continuationLink,
  type FlowEdge,
  flowLinks,
  glossLinks,
  type LinkRelation,
} from '@corpus/core/context/link';
import type { ContextItem } from '@corpus/core/context/types';

/** A link on a daf: where it lives (`source`), the `relation`, and what it
 *  points at (`targets`). `via` records which producer it came from, for
 *  display + debugging. */
export interface DafLink {
  via: 'bridge' | 'context' | 'flow' | 'commentary' | 'cross-flow';
  source: AnchorCoord;
  relation: LinkRelation;
  targets: AnchorCoord[];
  note?: string;
}

export interface DafLinkInputs {
  /** The next daf this sugya continues into, or null. From the cross-daf bridge. */
  continuesTo: DafRef | null;
  /** Context items (study-aids) on this daf — each item's `refs` becomes a
   *  'cites' link sourced at where the item sits. */
  items: ContextItem[];
  /** The argument-overview flow graph edges (section index → section index). */
  flowEdges: readonly FlowEdge[];
  /** startSegIdx of each argument section, in flow-index order, so a flow edge's
   *  section index resolves to a coordinate. */
  sectionStartSegs: readonly number[];
  /** Commentary works on this daf — each becomes a 'glosses' link from its own
   *  spine to the daf segments it glosses. Optional/absent contributes nothing. */
  commentaryWorks?: readonly CommentaryWorkLike[];
}

export function dafLinks(daf: DafRef, input: DafLinkInputs): DafLink[] {
  const out: DafLink[] = [];

  // 1) Tractate-continuity: the cross-daf bridge.
  const cont = continuationLink(input.continuesTo);
  if (cont)
    out.push({
      via: 'bridge',
      source: dafCoord(daf),
      relation: cont.relation,
      targets: cont.targets,
    });

  // 2) Citations: each context item's external refs, sourced where the item sits
  //    (its first placed segment, else whole-daf).
  for (const it of input.items) {
    const cite = citationLink(it.refs);
    if (!cite) continue;
    const source = it.segs.length ? coordForSeg(daf, it.segs[0]) : dafCoord(daf);
    out.push({
      via: 'context',
      source,
      relation: cite.relation,
      targets: cite.targets,
      note: it.sourceLabel,
    });
  }

  // 3) Argument flow: section→section edges, resolved to coordinates.
  const coordOf = (i: number): AnchorCoord | null =>
    i >= 0 && i < input.sectionStartSegs.length
      ? coordForSeg(daf, input.sectionStartSegs[i])
      : null;
  for (const fl of flowLinks(input.flowEdges, coordOf)) {
    out.push({
      via: 'flow',
      source: fl.source,
      relation: fl.link.relation,
      targets: fl.link.targets,
    });
  }

  // 4) Commentary spines: each work glosses the daf segments it sits over.
  for (const gl of glossLinks(daf, input.commentaryWorks ?? [])) {
    out.push({
      via: 'commentary',
      source: gl.source,
      relation: gl.link.relation,
      targets: gl.link.targets,
      note: gl.source.spine,
    });
  }

  return out;
}
