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
