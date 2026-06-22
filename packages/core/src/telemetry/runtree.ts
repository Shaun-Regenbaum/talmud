/**
 * @corpus/core/telemetry — run-tree derivation, pure + tested.
 *
 * The inspector's DAG is DERIVED, not hand-built: walk the producer registry's
 * declared `dependencies` (via depGraph.forwardSubgraph) from a root, then drape
 * each node with its cached telemetry. `isExpandable` falls out of the same
 * walk — a piece is expandable iff its dependency subgraph reaches another
 * PRODUCER (sources alone aren't a graph worth opening). So whether tanach's
 * pieces expand isn't a per-app flag; it's a property of tanach's registry.
 */

import { forwardSubgraph, producerNodesFrom, type RawDependency } from '../registry/depGraph.ts';
import type { Authority, RunTree, RunTreeTotals, Staleness, TreeNode } from './types.ts';

/** A registry definition, as far as the run-tree cares. */
export interface ProducerDef {
  id: string;
  label?: string;
  dependencies?: ReadonlyArray<RawDependency>;
  /** mark vs enrichment (drives the node's producer badge). */
  producerKind?: 'mark' | 'enrichment';
}

/** Cached telemetry for one producer node (absent for source leaves + cold
 *  producers). */
export interface RunTelemetry {
  cached?: boolean;
  model?: string | null;
  cold_ms?: number | null;
  cost?: number | null;
  tokens?: number | null;
  instances?: { total: number; cached: number };
  authority?: Authority | null;
  staleness?: Staleness | null;
  createdAt?: string | null;
  recipeHash?: string | null;
}

/** True iff `rootId`'s dependency subgraph reaches another PRODUCER (not just
 *  source inputs) — i.e. there's a real DAG to expand into. Pure. */
export function isExpandable(defs: ReadonlyArray<ProducerDef>, rootId: string): boolean {
  const producerIds = new Set(defs.map((d) => d.id));
  const graph = forwardSubgraph(producerNodesFrom(defs), rootId);
  return graph.edges.some(([, child]) => producerIds.has(child));
}

/** Build the run-tree for `rootId`: its forward dependency subgraph (producers
 *  + source leaves) with each producer node's cached telemetry attached. Pure
 *  over (registry, telemetry). */
export function buildRunTree(
  defs: ReadonlyArray<ProducerDef>,
  telemetry: Readonly<Record<string, RunTelemetry>>,
  rootId: string,
  meta: { tractate: string; page: string; lang: string },
): RunTree {
  const defById = new Map(defs.map((d) => [d.id, d]));
  const graph = forwardSubgraph(producerNodesFrom(defs), rootId);
  const nodes: Record<string, TreeNode> = {};
  const totals: RunTreeTotals = { count: 0, llm: 0, source: 0, cached: 0, cold_ms: 0, cost: 0 };

  for (const id of graph.nodes) {
    const def = defById.get(id);
    const isSource = !def; // not a registry producer => a source-input leaf
    const t: RunTelemetry = telemetry[id] ?? {};
    const node: TreeNode = {
      id,
      label: def?.label ?? id,
      kind: isSource ? 'source' : 'llm',
      producer: def?.producerKind,
      model: t.model ?? undefined,
      cached: !!t.cached,
      cold_ms: t.cold_ms ?? null,
      cost: t.cost ?? null,
      tokens: t.tokens ?? null,
      instances: t.instances,
      authority: t.authority ?? null,
      staleness: t.staleness ?? null,
      createdAt: t.createdAt ?? null,
      recipeHash: t.recipeHash ?? null,
    };
    nodes[id] = node;
    totals.count += 1;
    if (isSource) totals.source += 1;
    else totals.llm += 1;
    if (node.cached) totals.cached += 1;
    if (node.cold_ms) totals.cold_ms += node.cold_ms;
    if (node.cost) totals.cost += node.cost;
  }

  return {
    root: rootId,
    tractate: meta.tractate,
    page: meta.page,
    lang: meta.lang,
    nodes,
    edges: graph.edges,
    totals,
  };
}
