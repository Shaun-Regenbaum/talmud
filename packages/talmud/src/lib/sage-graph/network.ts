/** Every sage link we hold, in one graph. Each link keeps the layer it came from. */
import { canonicalSlug } from '../rabbi/identity';

/** How a link is known.
 * - checked: read from the text and checked by the study (the 200 connections).
 * - curated: teacher, student or colleague, taken from Sefaria's rabbi graph.
 * - learned: argues with, answers or cites, found by reading many dapim with AI. */
export type NetworkLayer = 'checked' | 'curated' | 'learned';

export interface NetworkNode {
  id: string;
  name: string;
  nameHe: string | null;
  generation: string | null;
  layers: NetworkLayer[];
}

/** [from index, to index, layer, kind, weight]. Indexes point into `nodes`. */
export type NetworkEdge = [number, number, NetworkLayer, string, number];

export interface SageNetwork {
  revision: string;
  voiceBuiltAt: number | null;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  stats: {
    registryPeople: number;
    registryNoEra: number;
    edgesByLayer: Record<NetworkLayer, number>;
    /** Checked names that are not matched to a person yet, so they cannot be placed. */
    checkedUnplaced: number;
    /** Links to a name that is not in the registry. */
    dropped: number;
  };
}

export interface HierarchyNode {
  canonical?: string;
  canonicalHe?: string | null;
  generation?: string | null;
  teachers?: string[];
  students?: string[];
  colleagues?: string[];
}

export interface NetworkInput {
  revision: string;
  hierarchy: Record<string, HierarchyNode>;
  voice: {
    builtAt: number;
    nodes: Record<string, { name?: string; generation?: string | null }>;
    edges: Record<string, { from?: string; to?: string; kind?: string; weight?: number }>;
  } | null;
  checkedNodes: { id: string; label: string; labelHe: string | null; generation: string | null }[];
  checkedEdges: { a: string; b: string; mode: string }[];
  /** The registry also holds topics such as Torah or Tallit, and the learned graph hears Elijah and
   * God speak. A name counts as a sage only if this says so or it has a known period. */
  isPerson?: (id: string, node: HierarchyNode) => boolean;
}

const known = (generation: string | null | undefined) =>
  generation && generation !== 'unknown' ? generation : null;

export function buildSageNetwork(input: NetworkInput): SageNetwork {
  const people = new Map<string, NetworkNode>();
  const registry = new Set<string>();
  const isSage = (rawId: string, h: HierarchyNode) =>
    !input.isPerson || known(h.generation) !== null || input.isPerson(rawId, h);
  for (const [rawId, h] of Object.entries(input.hierarchy)) {
    if (!isSage(rawId, h)) continue;
    const id = canonicalSlug(rawId);
    registry.add(id);
    if (people.has(id)) continue;
    people.set(id, {
      id,
      name: h.canonical ?? id,
      nameHe: h.canonicalHe ?? null,
      generation: known(h.generation),
      layers: [],
    });
  }
  const learn = (id: string, name?: string, generation?: string | null) => {
    const person = people.get(id);
    if (!person) return;
    if (!person.generation) person.generation = known(generation);
    if (name && person.name === id) person.name = name;
  };
  for (const [rawId, n] of Object.entries(input.voice?.nodes ?? {})) {
    learn(canonicalSlug(rawId), n.name, n.generation);
  }
  let dropped = 0;
  let checkedUnplaced = 0;
  for (const n of input.checkedNodes) {
    const id = canonicalSlug(n.id);
    if (n.id.startsWith('local:')) {
      checkedUnplaced++;
      continue;
    }
    if (!people.has(id)) {
      // A checked person the old registry never had still belongs on the page.
      people.set(id, {
        id,
        name: n.label,
        nameHe: n.labelHe,
        generation: known(n.generation),
        layers: [],
      });
    } else {
      learn(id, n.label, n.generation);
    }
  }

  const seen = new Set<string>();
  const raw: { a: string; b: string; layer: NetworkLayer; kind: string; weight: number }[] = [];
  const add = (a: string, b: string, layer: NetworkLayer, kind: string, weight = 1) => {
    const from = canonicalSlug(a);
    const to = canonicalSlug(b);
    if (from === to) return;
    if (!people.has(from) || !people.has(to)) {
      dropped++;
      return;
    }
    // Symmetric kinds are stored once, whichever way round they were read.
    const [x, y] = kind === 'colleague' && from > to ? [to, from] : [from, to];
    const key = `${layer}|${kind}|${x}|${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    raw.push({ a: x, b: y, layer, kind, weight });
  };
  for (const [rawId, h] of Object.entries(input.hierarchy)) {
    if (!isSage(rawId, h)) continue;
    for (const s of h.students ?? []) add(rawId, s, 'curated', 'teacher');
    for (const t of h.teachers ?? []) add(t, rawId, 'curated', 'teacher');
    for (const c of h.colleagues ?? []) add(rawId, c, 'curated', 'colleague');
  }
  for (const e of Object.values(input.voice?.edges ?? {})) {
    if (e.from && e.to && e.kind) add(e.from, e.to, 'learned', e.kind, e.weight ?? 1);
  }
  for (const e of input.checkedEdges) {
    if (e.a.startsWith('local:') || e.b.startsWith('local:')) continue;
    add(e.a, e.b, 'checked', e.mode);
  }

  // Only people with at least one link are drawn. Their order is fixed so the answer is stable.
  const linked = new Set(raw.flatMap((e) => [e.a, e.b]));
  const nodes = [...people.values()]
    .filter((p) => linked.has(p.id))
    .sort((x, y) => x.id.localeCompare(y.id));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const edgesByLayer: Record<NetworkLayer, number> = { checked: 0, curated: 0, learned: 0 };
  const edges: NetworkEdge[] = raw
    .sort(
      (p, q) =>
        p.layer.localeCompare(q.layer) ||
        p.a.localeCompare(q.a) ||
        p.b.localeCompare(q.b) ||
        p.kind.localeCompare(q.kind),
    )
    .map((e) => {
      edgesByLayer[e.layer]++;
      for (const id of [e.a, e.b]) {
        const layers = nodes[index.get(id) as number].layers;
        if (!layers.includes(e.layer)) layers.push(e.layer);
      }
      return [index.get(e.a) as number, index.get(e.b) as number, e.layer, e.kind, e.weight];
    });
  return {
    revision: input.revision,
    voiceBuiltAt: input.voice?.builtAt ?? null,
    nodes,
    edges,
    stats: {
      registryPeople: registry.size,
      registryNoEra: [...registry].filter((id) => !people.get(id)?.generation).length,
      edgesByLayer,
      checkedUnplaced,
      dropped,
    },
  };
}
