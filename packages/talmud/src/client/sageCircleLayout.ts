/** Places the sages round a circle, with sages who work with each other side by side. */
import { genOrder } from './sageArcLayout';

export interface CircleNode {
  id: string;
  generation: string | null;
  /** Links that are switched on. */
  degree: number;
}
export interface CircleLayout {
  positions: Map<string, { x: number; y: number; angle: number }>;
  /** The group each sage is in, numbered from 0 (the biggest group). */
  group: Map<string, number>;
  groups: number;
}

/**
 * Splits a graph into groups of names that link mostly to each other (greedy modularity, the
 * first step of the Louvain method, repeated on the merged groups). Same input, same answer.
 */
export function groupsOf(count: number, links: [number, number][]): number[] {
  // Each pair of names counts once, so a pair that is linked many ways does not pull harder.
  const seen = new Set<string>();
  let weights: Map<number, number>[] = Array.from({ length: count }, () => new Map());
  for (const [a, b] of links) {
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    weights[a].set(b, 1);
    weights[b].set(a, 1);
  }
  let member = Array.from({ length: count }, (_, i) => i);
  for (let level = 0; level < 6; level++) {
    const n = weights.length;
    const strength = weights.map((w) => [...w.values()].reduce((s, v) => s + v, 0));
    const total = strength.reduce((s, v) => s + v, 0);
    if (total === 0) break;
    const home = Array.from({ length: n }, (_, i) => i);
    const sum = [...strength];
    let moved = true;
    for (let pass = 0; moved && pass < 30; pass++) {
      moved = false;
      for (let i = 0; i < n; i++) {
        const into = new Map<number, number>();
        for (const [j, w] of weights[i]) {
          if (j !== i) into.set(home[j], (into.get(home[j]) ?? 0) + w);
        }
        const old = home[i];
        sum[old] -= strength[i];
        let best = old;
        let gain = (into.get(old) ?? 0) - (sum[old] * strength[i]) / total;
        for (const [c, w] of [...into].sort((x, y) => x[0] - y[0])) {
          const g = w - (sum[c] * strength[i]) / total;
          if (g > gain + 1e-12) {
            gain = g;
            best = c;
          }
        }
        sum[best] += strength[i];
        if (best !== old) {
          home[i] = best;
          moved = true;
        }
      }
    }
    const ids = [...new Set(home)].sort((a, b) => a - b);
    if (ids.length === n) break;
    const rank = new Map(ids.map((c, k) => [c, k]));
    member = member.map((m) => rank.get(home[m]) as number);
    const next: Map<number, number>[] = ids.map(() => new Map());
    for (let i = 0; i < n; i++) {
      for (const [j, w] of weights[i]) {
        const a = rank.get(home[i]) as number;
        const b = rank.get(home[j]) as number;
        // A link inside a group stays as a loop, so the group keeps the weight of its own links.
        next[a].set(b, (next[a].get(b) ?? 0) + w);
      }
    }
    weights = next;
  }
  // Number the groups from the biggest.
  const size = new Map<number, number>();
  for (const m of member) size.set(m, (size.get(m) ?? 0) + 1);
  const order = [...size].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c);
  const label = new Map(order.map((c, k) => [c, k]));
  return member.map((m) => label.get(m) as number);
}

/** Orders the groups round the circle so that groups with many links between them are neighbours. */
function groupOrder(groups: number, between: Map<string, number>): number[] {
  const weight = (a: number, b: number) => between.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0;
  const placed = [0];
  const left = new Set(Array.from({ length: groups - 1 }, (_, i) => i + 1));
  while (left.size) {
    const last = placed[placed.length - 1];
    let best = -1;
    let bestW = -1;
    for (const g of [...left].sort((a, b) => a - b)) {
      const w = weight(last, g) + (placed.length > 1 ? weight(placed[0], g) * 0.2 : 0);
      if (w > bestW) {
        bestW = w;
        best = g;
      }
    }
    placed.push(best);
    left.delete(best);
  }
  return placed;
}

export function layoutCircle(
  nodes: CircleNode[],
  links: [string, string][],
  radius: number,
): CircleLayout {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const pairs = links.flatMap(([a, b]) => {
    const x = index.get(a);
    const y = index.get(b);
    return x === undefined || y === undefined ? [] : [[x, y] as [number, number]];
  });
  const member = groupsOf(nodes.length, pairs);
  const groups = member.length ? Math.max(...member) + 1 : 0;
  const between = new Map<string, number>();
  for (const [x, y] of pairs) {
    const a = member[x];
    const b = member[y];
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    between.set(key, (between.get(key) ?? 0) + 1);
  }
  const order = groups ? groupOrder(groups, between) : [];
  const rank = new Map(order.map((g, k) => [g, k]));
  const sorted = nodes
    .map((n, i) => ({ n, g: member[i] }))
    .sort(
      (a, b) =>
        (rank.get(a.g) as number) - (rank.get(b.g) as number) ||
        genOrder(a.n.generation) - genOrder(b.n.generation) ||
        b.n.degree - a.n.degree ||
        a.n.id.localeCompare(b.n.id),
    );
  const positions: CircleLayout['positions'] = new Map();
  const group = new Map<string, number>();
  sorted.forEach(({ n, g }, i) => {
    // Start at the top and go clockwise.
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(sorted.length, 1);
    positions.set(n.id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle), angle });
    group.set(n.id, g);
  });
  return { positions, group, groups };
}

/** A curve that bends toward the middle, so links that go the same way bunch together. */
export function bundledPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  pull = 0.25,
): string {
  const cx = ((a.x + b.x) / 2) * pull;
  const cy = ((a.y + b.y) / 2) * pull;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}
