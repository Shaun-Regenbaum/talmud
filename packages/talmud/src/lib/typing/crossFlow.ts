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
    `Two consecutive dapim of Talmud (${fromDaf.tractate} ${fromDaf.page} → ${toDaf.page}). Map how the FIRST daf's argument sections relate to the SECOND daf's — ONLY clear, specific relationships across the page boundary.`,
    '',
    `FIRST daf (${fromDaf.page}) sections:`,
    list(from),
    '',
    `SECOND daf (${toDaf.page}) sections:`,
    list(to),
    '',
    'Relations — pick the MOST precise one (the right word is usually already in how you would describe the link):',
    '  continues   — the SAME sugya thread runs directly forward to its next step. NOT for a new question, an objection, or a competing view.',
    '  resolves    — one section directly ANSWERS a question or difficulty posed in the other.',
    '  depends-on  — one section PRESUPPOSES / builds on a ruling established in the other.',
    '  contrasts   — an OPPOSING position, competing formulation, objection, or a baraita that challenges the other. If your reason uses words like "challenges", "objects", "contradicts", "alternative formulation", or "difficulty from" — it is contrasts (or depends-on), NEVER continues.',
    '  parallels   — an INDEPENDENT but structurally analogous discussion (same dispute shape / question-answer form / mirrored list). NOT a generic shared theme.',
    '  generalizes — abstracts a general RULE from a specific case, or applies a general rule to a case. NOT mere restatement or elaboration (that is continues).',
    '',
    'Hard rules:',
    '1. AT MOST ONE `continues` edge per FIRST-daf section — choose the SINGLE strongest end→start carry-forward. Never fan one section out to several consecutive targets.',
    '2. Emit FEW edges. Most daf boundaries have 0–2 real cross-daf links; a long list from one section is wrong.',
    '3. Self-check before writing `continues`: if your own reason describes opposition / objection / challenge, relabel to contrasts or depends-on.',
    '4. Every edge MUST name a concrete shared anchor in `note` — the specific ruling, question, figure, or verse tying source to target. If the only link is a broad theme, emit NO edge.',
    '5. Do not assume continuity just because the dapim are adjacent: confirm the source section actually concerns the claimed subject. Distinct figures with similar names (e.g. Rav Yehuda the amora vs Rabbi Yehuda the tanna; the several Rav Kahanas) are NOT the same — never link on a confused identity.',
    '',
    'Output edges { fromSection (index in FIRST), toSection (index in SECOND), relation, note }. PRECISION over recall: a wrong link is worse than no link.',
  ].join('\n');
}

/** Validate + clamp the raw LLM verdict into in-range, well-typed edges. Drops
 *  any edge whose indices fall outside the real section lists or whose relation
 *  isn't recognised, and dedupes identical edges.
 *
 *  Deterministic anti-fan-out guards (the audit's top finding — one source
 *  section emitting many 'continues' edges into consecutive next-daf sections
 *  when only one is the real continuation):
 *   - at most ONE 'continues' edge per source section (keep the first), and
 *   - at most MAX_PER_SOURCE edges total per source section.
 *  These cap the model even when the prompt's "few edges" instruction is ignored. */
const MAX_PER_SOURCE = 2;
export function parseCrossFlowEdges(raw: unknown, fromCount: number, toCount: number): CrossFlowEdge[] {
  const arr = (raw && typeof raw === 'object' ? (raw as { edges?: unknown }).edges : null);
  if (!Array.isArray(arr)) return [];
  const out: CrossFlowEdge[] = [];
  const seen = new Set<string>();
  const continuesFrom = new Set<number>();        // source sections that already have a 'continues'
  const totalFrom = new Map<number, number>();    // edges kept per source section
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
    if (relation === 'continues' && continuesFrom.has(fromSection)) continue; // ≤1 continues per source
    if ((totalFrom.get(fromSection) ?? 0) >= MAX_PER_SOURCE) continue;        // cap fan-out per source
    seen.add(dedup);
    if (relation === 'continues') continuesFrom.add(fromSection);
    totalFrom.set(fromSection, (totalFrom.get(fromSection) ?? 0) + 1);
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
