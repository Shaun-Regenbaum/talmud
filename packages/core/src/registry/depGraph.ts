/**
 * Producer dependency graph — the reverse-dependency index for content-hash
 * freshness (roadmap step 6). Producers (marks + enrichments) declare what they
 * are built from via `dependencies`; this inverts that graph so we can answer:
 *
 *   "If producer / source X changes, what must re-warm?"
 *
 * Today that cascade is reasoned about by hand (e.g. bumping `argument.background`
 * means also bumping `argument.synthesis`, which lists it as a dependency).
 * `transitiveDependents` computes it instead, so a version bump or a recomputed
 * input can enumerate exactly the downstream producers to invalidate.
 *
 * Pure + framework-agnostic: the worker passes the registry defs in.
 */

/** A producer reduced to its id + the ids it depends on (other producers and/or
 *  source inputs like 'gemara'). Source inputs appear as leaf ids with no node
 *  of their own — they're still keys in the reverse index, so "gemara changed"
 *  is answerable too. */
export interface ProducerNode {
  id: string;
  dependsOn: string[];
}

/** A raw dependency as declared on a mark/enrichment definition:
 *  a source-input string ('gemara', 'commentaries', …) or a producer reference
 *  ({ enrichment: id } / { mark: id }). */
export type RawDependency = string | { enrichment: string } | { mark: string } | Record<string, unknown>;

/** The id a dependency points at: the string itself for a source input, or the
 *  referenced producer id for `{ enrichment }` / `{ mark }`. Null for an
 *  unrecognised shape. */
export function dependencyId(dep: RawDependency): string | null {
  if (typeof dep === 'string') return dep;
  if (dep && typeof dep === 'object') {
    const o = dep as Record<string, unknown>;
    if (typeof o.enrichment === 'string') return o.enrichment;
    if (typeof o.mark === 'string') return o.mark;
  }
  return null;
}

/** Reduce registry definitions to producer nodes (id + dependency ids). */
export function producerNodesFrom(
  defs: ReadonlyArray<{ id: string; dependencies?: ReadonlyArray<RawDependency> }>,
): ProducerNode[] {
  return defs.map((d) => ({
    id: d.id,
    dependsOn: (d.dependencies ?? []).map(dependencyId).filter((x): x is string => x !== null),
  }));
}

/** The forward dependency subgraph reachable from a root producer: the set of
 *  node ids (producers AND source-input leaves) and the consumer→dependency
 *  edges between them. A node reached through several parents appears ONCE in
 *  `nodes` with one edge per parent — so the DAG's sharing (e.g. `gemara`
 *  depended on by many) is preserved as fan-in, not duplicated. Edges are emitted
 *  parent→child in discovery order; cycle-safe via the visited set. Pure. */
export interface ForwardGraph {
  nodes: string[];
  edges: Array<[string, string]>;
}
export function forwardSubgraph(
  nodes: ReadonlyArray<ProducerNode>,
  rootId: string,
): ForwardGraph {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const edges: Array<[string, string]> = [];
  // DFS; sources (ids absent from byId) are visited as childless leaves so they
  // land in `nodes` but contribute no edges of their own.
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    for (const dep of node.dependsOn) {
      edges.push([id, dep]);
      if (!seen.has(dep)) stack.push(dep);
    }
  }
  return { nodes: [...seen], edges };
}

/** Invert the forward graph: map each id (producer OR source input) to the SET
 *  of producer ids that depend on it DIRECTLY. */
export function reverseDependencyIndex(nodes: ReadonlyArray<ProducerNode>): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      let set = rev.get(dep);
      if (!set) { set = new Set(); rev.set(dep, set); }
      set.add(node.id);
    }
  }
  return rev;
}

/** Every producer that depends on `id`, directly or transitively — the full
 *  re-warm set when `id` changes. Cycle-safe (terminates). In a well-formed DAG
 *  `id` is not among its own dependents; a dependency cycle would include it. */
export function transitiveDependents(rev: Map<string, Set<string>>, id: string): Set<string> {
  const out = new Set<string>();
  const queue: string[] = [...(rev.get(id) ?? [])];
  while (queue.length) {
    const cur = queue.shift()!;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const next of rev.get(cur) ?? []) if (!out.has(next)) queue.push(next);
  }
  return out;
}

/** A structural problem in the producer graph. */
export interface GraphIssue {
  kind: 'dangling-dependency' | 'cycle';
  /** The producer the issue is attributed to (the depender for 'dangling', a
   *  node on the cycle for 'cycle'). */
  id: string;
  detail: string;
}

/**
 * Validate the producer graph for two classes of registry bug the reverse-dep
 * cascade can't tolerate:
 *   - DANGLING: a dependency id that is neither another producer nor a known
 *     source input (a typo'd `{ enrichment: 'argument.synthsis' }`, or a renamed
 *     producer a dependent didn't follow). Such a dep silently never resolves.
 *   - CYCLE: producer A (transitively) depends on itself, which would make the
 *     re-warm cascade and prompt-resolution loop. The runtime guards against
 *     looping, but a cycle in the registry is always a mistake.
 * Returns [] for a healthy graph. Pure — run it over the live registry in CI so
 * a bad edit fails before it ships.
 */
export function validateProducerGraph(
  nodes: ReadonlyArray<ProducerNode>,
  sources: ReadonlySet<string>,
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const ids = new Set(nodes.map((n) => n.id));

  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!ids.has(dep) && !sources.has(dep)) {
        issues.push({ kind: 'dangling-dependency', id: node.id, detail: dep });
      }
    }
  }

  // Cycle detection over producer→producer edges (source leaves can't cycle).
  const adj = new Map(nodes.map((n) => [n.id, n.dependsOn.filter((d) => ids.has(d))]));
  const state = new Map<string, 1 | 2>(); // 1 = on the current DFS stack, 2 = done
  const visit = (id: string, stack: string[]): void => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const s = state.get(next);
      if (s === 1) {
        const from = stack.indexOf(next);
        issues.push({ kind: 'cycle', id: next, detail: [...stack.slice(from), next].join(' -> ') });
      } else if (s === undefined) {
        visit(next, stack);
      }
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const node of nodes) if (state.get(node.id) === undefined) visit(node.id, []);

  return issues;
}
