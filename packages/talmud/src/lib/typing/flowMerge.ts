/**
 * @fileoverview Merge deterministic statement-derived section edges UNDER the
 * AI flow: the AI flow is authoritative for any unordered section pair it
 * already covers; extra (derived) edges only fill its silence. Shared by the
 * reader's Overview maps and the #argument page so both views agree on which
 * section connections exist. Pure + DOM-free.
 */

export interface FlowEdgeLike {
  from: number;
  to: number;
}

/**
 * AI edges pass through untouched (order preserved); an extra edge is appended
 * only when NO edge — AI or already-appended extra — covers its unordered
 * {from, to} pair. Generic so callers keep their edge shape (kind, note, …).
 */
export function mergeFlows<T extends FlowEdgeLike>(ai: T[], extra: T[]): T[] {
  const pairKey = (e: FlowEdgeLike) => `${Math.min(e.from, e.to)}|${Math.max(e.from, e.to)}`;
  const covered = new Set(ai.map(pairKey));
  const merged = [...ai];
  for (const e of extra) {
    const key = pairKey(e);
    if (covered.has(key)) continue;
    covered.add(key);
    merged.push(e);
  }
  return merged;
}
