/**
 * @fileoverview Deterministic repair of the argument.voices edge graph.
 *
 * The LLM is unreliable about edge DIRECTION (the review found 26 inverted
 * `responds-to` edges) and emits edges pointing at voices that aren't in the
 * node list (18 of them) and the occasional self-loop. But direction is
 * derivable in code, so we don't have to trust the model: the `voices` array is
 * emitted in appearance order, and an argument flows forward — the voice DOING
 * something (`from`: responding, opposing, resolving, citing) always appears at
 * or after the voice it acts on (`to`). So:
 *
 *   - an edge whose `from` appears BEFORE its `to` is inverted → flip it;
 *   - an edge referencing a non-existent voice is unrenderable → drop it;
 *   - a self-loop is meaningless → drop it.
 *
 * Pure + DOM-free. Used both as a post-LLM transform check (fixes new writes) and
 * at the client render path (fixes already-cached graphs without a re-warm).
 */

interface Voice {
  name?: unknown;
}
interface VoiceEdge {
  from?: unknown;
  to?: unknown;
  kind?: unknown;
  [k: string]: unknown;
}
interface VoicesGraph {
  voices?: unknown;
  edges?: unknown;
  [k: string]: unknown;
}

/** Repair the edge directions + drop malformed edges. Mutates + returns the
 *  graph (matches the other transform passes' contract). Non-graph input and a
 *  missing edges array pass through untouched. */
export function deriveVoiceEdges(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const g = parsed as VoicesGraph;
  if (!Array.isArray(g.edges)) return parsed;

  // name -> appearance index (first occurrence wins).
  const order = new Map<string, number>();
  if (Array.isArray(g.voices)) {
    g.voices.forEach((v, i) => {
      const name = (v as Voice)?.name;
      if (typeof name === 'string' && name && !order.has(name)) order.set(name, i);
    });
  }

  const out: VoiceEdge[] = [];
  for (const e of g.edges as VoiceEdge[]) {
    const from = typeof e?.from === 'string' ? e.from : '';
    const to = typeof e?.to === 'string' ? e.to : '';
    if (!order.has(from) || !order.has(to)) continue; // phantom-voice edge → drop
    if (from === to) continue; // self-loop → drop
    const fi = order.get(from)!,
      ti = order.get(to)!;
    // The actor (from) reacts to the target (to), so it must be the later voice.
    out.push(fi < ti ? { ...e, from: to, to: from } : e);
  }
  g.edges = out;
  return g;
}
