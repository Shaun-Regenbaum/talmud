/**
 * Pure model for the #howitworks build graph. Turns the live registry
 * (GET /api/marks + GET /api/enrichments) into a layered dependency DAG:
 * source inputs -> marks (producers that DISCOVER anchors) -> enrichments
 * (producers that INHERIT/AGGREGATE over a mark's instances). This is the
 * static "registry DAG" from docs/framework.md (the same shape depGraph.ts
 * walks) rendered for a reader.
 *
 * No Solid, no fetch, no DOM — so it unit-tests cleanly
 * (tests/how-it-works-graph.test.ts). Layout (x/y, edges) lives in the
 * HowItWorksGraph component; this module only decides what connects to what
 * and how deep each node sits.
 */

/** A dependency entry as the API returns it (the legacy `dependencies`
 *  grammar). A bare string is a source input; an object names another
 *  producer. */
export type RawDep = string | { mark: string } | { enrichment: string; fanOut?: boolean };

/** The fields we read off GET /api/marks (a MarkDefinition). Kept local +
 *  loose so the client never imports worker types. */
export interface RawMark {
  id: string;
  label?: string;
  description?: string;
  category?: string;
  anchor?: string;
  render?: { kind?: string } | null;
  extractor?: {
    kind?: string;
    model?: string;
    thinking_off?: boolean;
    reasoning_effort?: string;
  } | null;
  dependencies?: RawDep[];
  status?: string;
  experimental?: boolean;
  cache_version?: string;
}

/** The fields we read off GET /api/enrichments (the flattened enrichment
 *  shape the worker emits — `mark` is the target mark). */
export interface RawEnrichment {
  id: string;
  label?: string;
  description?: string;
  mark?: string;
  mode?: string;
  scope?: string;
  dependencies?: RawDep[];
  model?: string;
  thinking_off?: boolean;
  reasoning_effort?: string;
  output_schema?: unknown;
  system_prompt?: string;
  user_prompt_template?: string;
  cache_version?: string;
}

export type NodeKind = 'source' | 'mark' | 'enrichment';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Mark family for grouping/coloring: a mark colors by its own id, an
   *  enrichment by its target mark, a source by 'source'. */
  family: string;
  /** Dependency depth: sources 0, marks 1, enrichments 2+. Set by assignLayers. */
  layer: number;
  mark?: RawMark;
  enrichment?: RawEnrichment;
}

export interface GraphEdge {
  /** Dependency node id (the input). */
  from: string;
  /** Producer node id (the thing built from it). */
  to: string;
  /** Kind of the `from` endpoint — used to color the connector. */
  kind: NodeKind;
  /** True when the edge is the enrichment->its-target-mark relation rather
   *  than a declared `dependencies` entry (drawn more softly). */
  target?: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  byId: Map<string, GraphNode>;
}

/** Normalize one dependency entry to the node it points at, or null if the
 *  shape is unrecognized. */
export function depRef(dep: RawDep): { id: string; kind: NodeKind } | null {
  if (typeof dep === 'string') {
    const id = dep.trim();
    return id ? { id, kind: 'source' } : null;
  }
  if (dep && typeof dep === 'object') {
    if ('mark' in dep && typeof dep.mark === 'string') return { id: dep.mark, kind: 'mark' };
    if ('enrichment' in dep && typeof dep.enrichment === 'string')
      return { id: dep.enrichment, kind: 'enrichment' };
  }
  return null;
}

/** All resolvable dependency refs for a producer (dedup-free; caller dedups). */
export function parseDeps(deps: RawDep[] | undefined): { id: string; kind: NodeKind }[] {
  if (!Array.isArray(deps)) return [];
  const out: { id: string; kind: NodeKind }[] = [];
  for (const d of deps) {
    const ref = depRef(d);
    if (ref) out.push(ref);
  }
  return out;
}

const niceLabel = (id: string, label?: string): string => (label?.trim() ? label.trim() : id);

/** Build the node/edge graph from the live registry. Source nodes are
 *  synthesized from the union of all string dependencies, so the graph shows
 *  exactly the inputs the registry actually declares. */
export function buildGraph(marks: RawMark[], enrichments: RawEnrichment[]): Graph {
  const byId = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seenEdge = new Set<string>();

  const ensureSource = (id: string): void => {
    if (!byId.has(id)) byId.set(id, { id, kind: 'source', label: id, family: 'source', layer: 0 });
  };
  const addEdge = (from: string, to: string, kind: NodeKind, target = false): void => {
    const key = `${from}->${to}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    edges.push({ from, to, kind, target });
  };

  for (const m of marks) {
    byId.set(m.id, {
      id: m.id,
      kind: 'mark',
      label: niceLabel(m.id, m.label),
      family: m.id,
      layer: 1,
      mark: m,
    });
  }
  for (const e of enrichments) {
    byId.set(e.id, {
      id: e.id,
      kind: 'enrichment',
      label: niceLabel(e.id, e.label),
      family: e.mark || 'other',
      layer: 2,
      enrichment: e,
    });
  }

  // Declared dependency edges (sources + producer-to-producer).
  const wireDeps = (producerId: string, deps: RawDep[] | undefined): void => {
    for (const ref of parseDeps(deps)) {
      if (ref.kind === 'source') ensureSource(ref.id);
      // Only wire producer deps that actually exist in the registry; a source
      // always exists (we just made it).
      if (ref.kind !== 'source' && !byId.has(ref.id)) continue;
      addEdge(ref.id, producerId, ref.kind);
    }
  };
  for (const m of marks) wireDeps(m.id, m.dependencies);
  for (const e of enrichments) wireDeps(e.id, e.dependencies);

  // Every enrichment is anchored to a target mark even when the mark isn't in
  // its declared deps (global enrichments take their instance implicitly).
  // Draw that as a soft edge so the graph is connected and groups read.
  for (const e of enrichments) {
    if (e.mark && byId.has(e.mark)) addEdge(e.mark, e.id, 'mark', true);
  }

  return { nodes: [...byId.values()], edges, byId };
}

/** Longest-path dependency depth per node: sources sit at 0, and every other
 *  node sits one column past its deepest input (a node with only source deps
 *  lands at 1). Because each node is strictly deeper than everything it
 *  depends on, EVERY edge runs left-to-right — no intra-column connectors — so
 *  the columns read sources -> marks -> enrichments -> synthesis by depth.
 *  Cycle-safe (the registry is acyclic — validateProducerGraph guards it — but
 *  we never loop regardless). Mutates node.layer and returns the graph. */
export function assignLayers(graph: Graph): Graph {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const layerOf = (id: string): number => {
    const node = graph.byId.get(id);
    if (!node) return 0;
    if (node.kind === 'source') return 0;
    if (memo.has(id)) return memo.get(id) as number;
    if (visiting.has(id)) return 1;
    visiting.add(id);
    let layer = 1;
    for (const e of graph.edges) {
      if (e.to === id) layer = Math.max(layer, layerOf(e.from) + 1);
    }
    visiting.delete(id);
    memo.set(id, layer);
    return layer;
  };
  for (const n of graph.nodes) n.layer = layerOf(n.id);
  return graph;
}

/** Everything `id` is (transitively) built from — its upstream inputs. */
export function ancestorsOf(graph: Graph, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const e of graph.edges) {
      if (e.to === cur && !out.has(e.from)) {
        out.add(e.from);
        stack.push(e.from);
      }
    }
  }
  return out;
}

/** Everything (transitively) built from `id` — its downstream consumers. */
export function descendantsOf(graph: Graph, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const e of graph.edges) {
      if (e.from === cur && !out.has(e.to)) {
        out.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return out;
}

/** The full connected chain through a node (inputs + consumers + itself) —
 *  what to keep lit when the node is hovered/selected. */
export function connectedClosure(graph: Graph, id: string): Set<string> {
  const out = ancestorsOf(graph, id);
  for (const d of descendantsOf(graph, id)) out.add(d);
  out.add(id);
  return out;
}
