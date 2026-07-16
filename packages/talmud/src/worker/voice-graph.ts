/**
 * Shas-wide rabbi voice graph — the aggregation of every cached per-section
 * argument.voices graph into one learned rabbi-to-rabbi network.
 *
 * Each cached argument.voices result is a section-local dispute graph whose
 * speakers are RAW LLM names. This module grounds those names to registry
 * slugs (groundRabbiNames — the same resolver the reader uses) and folds the
 * section edges into a single accumulated graph:
 *
 *   node  = a registry rabbi (slug), with how often / where they speak
 *   edge  = (from, to, kind) with weight = distinct section sightings and a
 *           capped sample of dafs as provenance
 *
 * Precision discipline: an edge is kept only when BOTH endpoints ground to a
 * slug; sightings where both endpoints resolved with basis 'unique' (name
 * unambiguous in the registry) are additionally counted in `strict`. The
 * strict tier is the evidence base later used to disambiguate homonyms — it
 * must not itself depend on homonym guesses, or errors would self-reinforce.
 *
 * The fold is pure (no env, no KV): the incremental walk that feeds it lives
 * in warm-cron.ts, the read endpoints in index.ts.
 */

import { resolveVoiceGroup } from '../client/voiceGroups';
import { type ArgumentVoicesData, deriveVoiceEdges } from '../lib/typing/voices';
import { curatedEdgeCount, type GroundedRabbi, groundRabbiNames } from './rabbi-graph';

/** The finite voice-edge relation set (ArgumentEdge['kind']). Anything else in
 *  a cached value is treated as corrupt and skipped. */
const VALID_KINDS = new Set(['opposes', 'supports', 'responds-to', 'cites', 'resolves']);

/** Max sample dafs kept per edge / per node — provenance, not exhaustive. */
const EDGE_DAF_CAP = 12;
const NODE_DAF_CAP = 25;

export interface VoiceEdgeAgg {
  from: string; // slug
  to: string; // slug
  kind: string; // opposes | supports | responds-to | cites | resolves
  /** Distinct section sightings (each cached section counted once per pass). */
  weight: number;
  /** Sightings where both endpoints resolved with basis 'unique'. */
  strict: number;
  dafs: string[]; // sample, capped at EDGE_DAF_CAP, "Tractate Page"
}

export interface VoiceNodeAgg {
  name: string; // registry canonical
  generation: string | null;
  /** Distinct section sightings where this rabbi speaks. */
  sections: number;
  dafs: string[]; // sample, capped at NODE_DAF_CAP
  /** Stamped at finalize: curated hierarchy edge count (teachers+students+
   *  colleagues). 0 = this node was edge-less before the voice graph. */
  curatedEdges?: number;
}

export interface VoiceGraphStaging {
  version: 1;
  startedAt: number;
  scannedKeys: number;
  sections: number;
  voicesSeen: number;
  voicesResolved: number;
  edgesSeen: number;
  edgesKept: number;
  dafsSeen: Record<string, 1>;
  nodes: Record<string, VoiceNodeAgg>;
  edges: Record<string, VoiceEdgeAgg>;
}

export interface VoiceGraphBlob extends Omit<VoiceGraphStaging, 'dafsSeen'> {
  builtAt: number;
  dapim: number;
  /** Analyzed dapim per tractate (display-name keys) — the denominator for
   *  the sage-page coverage strip. Present from the first rebuild after this
   *  field shipped; consumers must tolerate absence. */
  dapimByTractate?: Record<string, number>;
  /** Nodes that gained voice edges while having ZERO curated hierarchy edges —
   *  the "filled blanks". */
  newlyConnected: number;
}

export function emptyVoiceGraphStaging(startedAt: number): VoiceGraphStaging {
  return {
    version: 1,
    startedAt,
    scannedKeys: 0,
    sections: 0,
    voicesSeen: 0,
    voicesResolved: 0,
    edgesSeen: 0,
    edgesKept: 0,
    dafsSeen: {},
    nodes: {},
    edges: {},
  };
}

/** A daf's rabbi-mark cast, as grounding context. */
export interface CastItem {
  name: string;
  nameHe?: string;
  generation?: string;
}

/**
 * Ground a section's voices against the daf cast. Collectives (Stam, the
 * Sages, Beit Hillel…) are institutional voices, not people — skipped. The
 * daf cast supplies both the relational context and, by exact-name match,
 * the generation hint (mirroring how the #voices page colors nodes).
 * Returns a map keyed by the RAW voice name.
 */
export function groundVoices(
  voices: readonly { name?: unknown; nameHe?: unknown }[],
  cast: readonly CastItem[],
): Map<string, GroundedRabbi> {
  const genByName = new Map<string, string>();
  for (const c of cast) if (c.generation) genByName.set(c.name.trim().toLowerCase(), c.generation);
  const items: { name: string; nameHe?: string; generation?: string }[] = [];
  for (const v of voices) {
    const name = typeof v.name === 'string' ? v.name.trim() : '';
    if (!name || resolveVoiceGroup(name)) continue;
    items.push({
      name,
      nameHe: typeof v.nameHe === 'string' && v.nameHe ? v.nameHe : undefined,
      generation: genByName.get(name.toLowerCase()),
    });
  }
  const grounded = groundRabbiNames(
    items,
    cast.map((c) => c.name),
  );
  const out = new Map<string, GroundedRabbi>();
  grounded.forEach((g, i) => {
    out.set(items[i].name, g);
  });
  return out;
}

function pushCapped(arr: string[], v: string, cap: number): void {
  if (arr.length < cap && !arr.includes(v)) arr.push(v);
}

/**
 * Fold one cached section's voices into the staging graph. `parsed` is the
 * RunResult.parsed of an argument.voices entry; `grounded` comes from
 * groundVoices; `dafLabel` is the display form "Tractate Page".
 */
export function foldSection(
  g: VoiceGraphStaging,
  parsed: unknown,
  grounded: Map<string, GroundedRabbi>,
  dafLabel: string,
): void {
  const data = deriveVoiceEdges(parsed) as Partial<ArgumentVoicesData> | null;
  const voices = Array.isArray(data?.voices) ? data.voices : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  g.sections++;
  g.dafsSeen[dafLabel] = 1;

  // Per-section dedup: a duplicated voice row / duplicated (from,to,kind) row
  // inside ONE cached section must not inflate counts — "weight" means
  // distinct section sightings.
  const seenSlugs = new Set<string>();
  const seenEdges = new Set<string>();

  for (const v of voices) {
    const name = typeof v?.name === 'string' ? v.name.trim() : '';
    if (!name || resolveVoiceGroup(name)) continue;
    g.voicesSeen++;
    const gr = grounded.get(name);
    if (!gr?.slug || !gr.canonical) continue;
    if (seenSlugs.has(gr.slug)) continue;
    seenSlugs.add(gr.slug);
    g.voicesResolved++;
    let node = g.nodes[gr.slug];
    if (!node) {
      node = { name: gr.canonical, generation: gr.generation ?? null, sections: 0, dafs: [] };
      g.nodes[gr.slug] = node;
    }
    node.sections++;
    pushCapped(node.dafs, dafLabel, NODE_DAF_CAP);
  }

  for (const e of edges) {
    const from = typeof e?.from === 'string' ? e.from.trim() : '';
    const to = typeof e?.to === 'string' ? e.to.trim() : '';
    const kind = typeof e?.kind === 'string' ? e.kind : '';
    if (!from || !to || !VALID_KINDS.has(kind)) continue;
    g.edgesSeen++;
    const gf = grounded.get(from);
    const gt = grounded.get(to);
    if (!gf?.slug || !gt?.slug || gf.slug === gt.slug) continue;
    const key = `${gf.slug}|${gt.slug}|${kind}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    g.edgesKept++;
    let agg = g.edges[key];
    if (!agg) {
      agg = { from: gf.slug, to: gt.slug, kind, weight: 0, strict: 0, dafs: [] };
      g.edges[key] = agg;
    }
    agg.weight++;
    if (gf.genSource === 'unique' && gt.genSource === 'unique') agg.strict++;
    pushCapped(agg.dafs, dafLabel, EDGE_DAF_CAP);
  }
}

/** Promote a completed staging accumulation to the served blob: stamp curated
 *  edge counts + the newly-connected count, collapse dafsSeen to a number. */
export function finalizeVoiceGraph(staging: VoiceGraphStaging, builtAt: number): VoiceGraphBlob {
  const { dafsSeen, ...rest } = staging;
  const connected = new Set<string>();
  for (const e of Object.values(staging.edges)) {
    connected.add(e.from);
    connected.add(e.to);
  }
  let newlyConnected = 0;
  for (const [slug, node] of Object.entries(staging.nodes)) {
    node.curatedEdges = curatedEdgeCount(slug);
    if (node.curatedEdges === 0 && connected.has(slug)) newlyConnected++;
  }
  const dapimByTractate: Record<string, number> = {};
  for (const label of Object.keys(dafsSeen)) {
    const i = label.lastIndexOf(' ');
    if (i <= 0) continue;
    const tractate = label.slice(0, i);
    dapimByTractate[tractate] = (dapimByTractate[tractate] ?? 0) + 1;
  }
  return {
    ...rest,
    builtAt,
    dapim: Object.keys(dafsSeen).length,
    dapimByTractate,
    newlyConnected,
  };
}

/** Build the resolver's learned adjacency from a voice-graph blob: symmetric
 *  slug -> neighbor-set over STRICT-tier edges only (both endpoints resolved
 *  'unique'), thresholded at minStrict distinct section sightings. Weight
 *  (which includes relational/generation-grounded sightings) is deliberately
 *  NOT used — see the module header on circularity. */
export function buildLearnedAdjacency(
  edges: Record<string, Pick<VoiceEdgeAgg, 'from' | 'to' | 'strict'>>,
  minStrict = 2,
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    let set = adj.get(a);
    if (!set) {
      set = new Set();
      adj.set(a, set);
    }
    set.add(b);
  };
  for (const e of Object.values(edges)) {
    if (!e || e.strict < minStrict) continue;
    add(e.from, e.to);
    add(e.to, e.from);
  }
  return adj;
}

export interface EgoEdge extends VoiceEdgeAgg {
  /** The other endpoint, with display info resolved from the blob nodes. */
  other: { slug: string; name: string; generation: string | null };
  direction: 'out' | 'in';
}

/** One rabbi's slice of the learned graph, edges sorted by weight desc. */
export function egoSlice(
  blob: VoiceGraphBlob,
  slug: string,
): { node: VoiceNodeAgg; edges: EgoEdge[] } | null {
  const node = blob.nodes[slug];
  if (!node) return null;
  const edges: EgoEdge[] = [];
  for (const e of Object.values(blob.edges)) {
    if (e.from !== slug && e.to !== slug) continue;
    const direction: 'out' | 'in' = e.from === slug ? 'out' : 'in';
    const otherSlug = direction === 'out' ? e.to : e.from;
    const other = blob.nodes[otherSlug];
    edges.push({
      ...e,
      direction,
      other: {
        slug: otherSlug,
        name: other?.name ?? otherSlug,
        generation: other?.generation ?? null,
      },
    });
  }
  edges.sort((a, b) => b.weight - a.weight || b.strict - a.strict);
  return { node, edges };
}
