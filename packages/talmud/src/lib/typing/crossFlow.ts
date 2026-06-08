/**
 * @fileoverview Cross-daf argument flow — the section-level successor to the
 * boolean bridge. Where `bridge.ts` answers "does the sugya continue across the
 * page break?" (one bit), cross-flow answers "WHICH section of daf N relates to
 * WHICH section of daf N+1, and HOW" — typed edges (continues / resolves /
 * depends-on / parallels / contrasts / generalizes) projected onto global
 * coordinates so they join the tractate spine graph (spineLinks.ts).
 *
 * Forward window of 1: each daf is responsible for its edges INTO the next daf,
 * so unioning across the tractate yields the whole forward cross-daf graph with
 * no double counting. Longer-range parallels are a later, retrieval-shaped layer.
 *
 * PRECISION over recall: a wrong cross-daf edge is worse than none (the reader/
 * LLM treats it as fact), so the prompt is place-or-omit and parse drops any
 * edge whose indices fall outside the real section lists.
 *
 * Pure + DOM-free. The worker (computeCrossFlow) runs the prompt through runLLM
 * and caches; everything here is unit-testable string/array assembly.
 */

import { coordForSeg, type AnchorCoord, type DafRef } from '@corpus/core/context/coord';
import type { DafLink } from '../context/dafLinks';

export type CrossFlowRelation = 'continues' | 'resolves' | 'depends-on' | 'parallels' | 'contrasts' | 'generalizes';
const CROSS_FLOW_RELATIONS: readonly CrossFlowRelation[] = ['continues', 'resolves', 'depends-on', 'parallels', 'contrasts', 'generalizes'];

export interface CrossFlowSection { title?: string; summary?: string }

export interface CrossFlowEdge {
  /** 0-based index into the FROM-daf's ordered sections. */
  fromSection: number;
  /** 0-based index into the TO-daf's ordered sections. */
  toSection: number;
  relation: CrossFlowRelation;
  note?: string;
}

export interface CrossFlow {
  from: DafRef;
  to: DafRef | null;
  edges: CrossFlowEdge[];
  via: 'llm' | 'edge-of-tractate' | 'no-data';
}

/** The LLM prompt relating one daf's sections to the next daf's. Pure string
 *  assembly so it's testable; the worker runs it through runLLM. */
export function buildCrossFlowPrompt(
  fromDaf: DafRef,
  toDaf: DafRef,
  from: readonly CrossFlowSection[],
  to: readonly CrossFlowSection[],
): string {
  const list = (secs: readonly CrossFlowSection[]): string =>
    secs.map((s, i) => `  [${i}] ${s.title ?? '(untitled)'} — ${s.summary ?? ''}`).join('\n');
  return [
    `Two consecutive dapim of Talmud (${fromDaf.tractate} ${fromDaf.page} → ${toDaf.page}). Identify how the argument sections of the FIRST daf relate to sections of the SECOND, ONLY where there is a clear, specific relationship across the page boundary.`,
    '',
    `FIRST daf (${fromDaf.page}) sections:`,
    list(from),
    '',
    `SECOND daf (${toDaf.page}) sections:`,
    list(to),
    '',
    'Relations:',
    '  continues   — the same sugya thread carries directly forward',
    '  resolves    — a section answers a question/difficulty raised in the other',
    '  depends-on  — presupposes a result established in the other',
    '  parallels   — an independent but structurally analogous discussion',
    '  contrasts   — an opposing position, case, or outcome',
    '  generalizes — states the general rule of a specific case (or vice versa)',
    '',
    'Output edges { fromSection (index in FIRST), toSection (index in SECOND), relation, note }.',
    'PRECISION over recall: emit an edge ONLY when the relationship is specific and defensible from the summaries. Most section pairs have NO edge — return few edges, or none. Never connect sections merely for sharing a tractate or a broad theme.',
  ].join('\n');
}

/** Validate + clamp the raw LLM verdict into in-range, well-typed edges. Drops
 *  any edge whose indices fall outside the real section lists or whose relation
 *  isn't recognised, and dedupes identical edges. */
export function parseCrossFlowEdges(raw: unknown, fromCount: number, toCount: number): CrossFlowEdge[] {
  const arr = (raw && typeof raw === 'object' ? (raw as { edges?: unknown }).edges : null);
  if (!Array.isArray(arr)) return [];
  const out: CrossFlowEdge[] = [];
  const seen = new Set<string>();
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const fromSection = o.fromSection;
    const toSection = o.toSection;
    const relation = o.relation;
    if (typeof fromSection !== 'number' || typeof toSection !== 'number') continue;
    if (fromSection < 0 || fromSection >= fromCount || toSection < 0 || toSection >= toCount) continue;
    if (typeof relation !== 'string' || !CROSS_FLOW_RELATIONS.includes(relation as CrossFlowRelation)) continue;
    const dedup = `${fromSection} ${toSection} ${relation}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    out.push({
      fromSection,
      toSection,
      relation: relation as CrossFlowRelation,
      note: typeof o.note === 'string' ? o.note : undefined,
    });
  }
  return out;
}

/** Project cross-flow edges onto global coordinates as DafLinks (source on the
 *  from-daf, target on the to-daf). `fromStartSegs` / `toStartSegs` are each
 *  daf's section startSegIdx in the SAME order the indices refer to. */
export function crossFlowToLinks(
  fromDaf: DafRef,
  toDaf: DafRef,
  edges: readonly CrossFlowEdge[],
  fromStartSegs: readonly number[],
  toStartSegs: readonly number[],
): DafLink[] {
  const out: DafLink[] = [];
  for (const e of edges) {
    if (e.fromSection >= fromStartSegs.length || e.toSection >= toStartSegs.length) continue;
    const source: AnchorCoord = coordForSeg(fromDaf, fromStartSegs[e.fromSection]);
    const target: AnchorCoord = coordForSeg(toDaf, toStartSegs[e.toSection]);
    out.push({ via: 'cross-flow', source, relation: e.relation, targets: [target], note: e.note });
  }
  return out;
}
