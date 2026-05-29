/**
 * @fileoverview Assemble cross-page sugyot from the primitives: per-daf argument
 * sections, the per-daf flow (argument-overview connections between sections),
 * and the cross-daf bridges (does daf N continue into N+1). Maps it all into
 * coord.ts coordinates + SugyaFlowEdges and runs stitchSugyot — the result is
 * the set of sugya units, each spanning whatever dapim its thread covers.
 *
 * Pure: the worker loads the data for a window of dapim and calls this. The flow
 * `from`/`to` are 0-based indices into a daf's ordered argument sections (the
 * argument-overview.flow contract); each maps to that section's coordinate.
 */

import { coordForSeg, type AnchorCoord, type DafRef } from '../context/coord';
import { stitchSugyot, type SugyaFlowEdge, type SugyaUnit } from './sugya';

export interface DafForAssembly {
  ref: DafRef;
  /** Ordered argument sections of this daf. */
  sections: Array<{ startSegIdx: number; endSegIdx: number }>;
  /** Per-daf flow: from/to are section INDICES into `sections`. */
  flow: Array<{ from: number; to: number; kind: string }>;
}

/** Whether dapim[i] continues into dapim[i+1] (one entry per consecutive pair). */
export interface BridgeLink { continues: boolean }

/**
 * Build the section coordinates + edges across a window of consecutive dapim and
 * stitch them into cross-page sugya units. `bridges[i]` links dapim[i] →
 * dapim[i+1]; a continuing bridge adds a `continues` edge from the earlier daf's
 * LAST section to the later daf's FIRST section.
 */
export function assembleSugyot(dapim: readonly DafForAssembly[], bridges: readonly BridgeLink[]): SugyaUnit[] {
  const coords: AnchorCoord[] = [];
  const edges: SugyaFlowEdge[] = [];

  for (const d of dapim) {
    for (const s of d.sections) coords.push(coordForSeg(d.ref, s.startSegIdx));
    // intra-daf flow: section index → that section's coordinate.
    for (const f of d.flow) {
      const from = d.sections[f.from], to = d.sections[f.to];
      if (!from || !to) continue;
      edges.push({ from: coordForSeg(d.ref, from.startSegIdx), to: coordForSeg(d.ref, to.startSegIdx), kind: f.kind });
    }
  }

  // cross-daf bridges: earlier daf's last section → later daf's first section.
  for (let i = 0; i < dapim.length - 1; i++) {
    if (!bridges[i]?.continues) continue;
    const a = dapim[i].sections, b = dapim[i + 1].sections;
    if (a.length === 0 || b.length === 0) continue;
    const last = a.reduce((x, y) => (y.startSegIdx > x.startSegIdx ? y : x));
    const first = b.reduce((x, y) => (y.startSegIdx < x.startSegIdx ? y : x));
    edges.push({ from: coordForSeg(dapim[i].ref, last.startSegIdx), to: coordForSeg(dapim[i + 1].ref, first.startSegIdx), kind: 'continues' });
  }

  return stitchSugyot(coords, edges);
}

/** The sugya unit that contains a given (daf, seg) coordinate, or null. */
export function sugyaContaining(units: readonly SugyaUnit[], at: AnchorCoord): SugyaUnit | null {
  for (const u of units) {
    if (u.span.some((c) => c.tractate === at.tractate && c.page === at.page && c.seg === at.seg)) return u;
  }
  return null;
}
