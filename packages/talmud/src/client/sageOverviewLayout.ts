/** Places the sage network on a page. Each cluster of connected names gets its own box. */

export interface LayoutNode {
  id: string;
}
export interface LayoutEdge {
  a: string;
  b: string;
}
export interface Point {
  x: number;
  y: number;
}
export interface OverviewLayout {
  positions: Map<string, Point>;
  width: number;
  height: number;
  /** One rectangle per cluster, largest first. */
  boxes: { x: number; y: number; w: number; h: number; ids: string[] }[];
}

const PAD = 30;
const GAP = 22;

function clusters(nodes: LayoutNode[], edges: LayoutEdge[]): string[][] {
  const adjacent = new Map<string, string[]>();
  for (const n of nodes) adjacent.set(n.id, []);
  for (const e of edges) {
    adjacent.get(e.a)?.push(e.b);
    adjacent.get(e.b)?.push(e.a);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of [...nodes].sort((x, y) => x.id.localeCompare(y.id))) {
    if (seen.has(n.id)) continue;
    const group: string[] = [];
    const queue = [n.id];
    seen.add(n.id);
    while (queue.length) {
      const id = queue.shift() as string;
      group.push(id);
      for (const next of (adjacent.get(id) ?? []).sort()) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    out.push(group);
  }
  return out.sort((x, y) => y.length - x.length || x[0].localeCompare(y[0]));
}

/** Pulls linked names together and pushes all names apart. Same input, same picture. */
function spring(ids: string[], edges: LayoutEdge[], side: number): Map<string, Point> {
  const pos = new Map<string, Point>();
  const centre = side / 2;
  ids.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / ids.length;
    pos.set(id, {
      x: centre + Math.cos(angle) * side * 0.3,
      y: centre + Math.sin(angle) * side * 0.3,
    });
  });
  if (ids.length === 1) {
    pos.set(ids[0], { x: centre, y: centre });
    return pos;
  }
  const inner = side - PAD * 2;
  const k = Math.sqrt((inner * inner) / ids.length) * 0.85;
  let heat = inner / 6;
  for (let step = 0; step < 220; step++) {
    const move = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const p = pos.get(ids[i]) as Point;
        const q = pos.get(ids[j]) as Point;
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = (i % 2 ? 1 : -1) * 0.01;
          dy = 0.01;
          dist = 0.015;
        }
        const push = (k * k) / dist;
        const a = move.get(ids[i]) as Point;
        const b = move.get(ids[j]) as Point;
        a.x += (dx / dist) * push;
        a.y += (dy / dist) * push;
        b.x -= (dx / dist) * push;
        b.y -= (dy / dist) * push;
      }
    }
    for (const e of edges) {
      const p = pos.get(e.a);
      const q = pos.get(e.b);
      if (!p || !q) continue;
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      const pull = (dist * dist) / k;
      const a = move.get(e.a) as Point;
      const b = move.get(e.b) as Point;
      a.x -= (dx / dist) * pull;
      a.y -= (dy / dist) * pull;
      b.x += (dx / dist) * pull;
      b.y += (dy / dist) * pull;
    }
    for (const id of ids) {
      const m = move.get(id) as Point;
      const p = pos.get(id) as Point;
      // A weak pull to the middle keeps loosely linked names from piling up on the box edge.
      m.x += (centre - p.x) * 0.35;
      m.y += (centre - p.y) * 0.35;
      const size = Math.max(Math.hypot(m.x, m.y), 0.01);
      const step_ = Math.min(size, heat);
      p.x = Math.min(side - PAD, Math.max(PAD, p.x + (m.x / size) * step_));
      p.y = Math.min(side - PAD, Math.max(PAD, p.y + (m.y / size) * step_));
    }
    heat *= 0.97;
  }
  return pos;
}

export function layoutOverview(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  width: number,
): OverviewLayout {
  const ids = new Set(nodes.map((n) => n.id));
  const usable = edges.filter((e) => ids.has(e.a) && ids.has(e.b));
  const positions = new Map<string, Point>();
  const boxes: OverviewLayout['boxes'] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const group of clusters(nodes, usable)) {
    const side = Math.min(width, Math.max(96, Math.ceil(Math.sqrt(group.length) * 70)));
    if (x > 0 && x + side > width) {
      x = 0;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    const local = spring(
      group,
      usable.filter((e) => group.includes(e.a) && group.includes(e.b)),
      side,
    );
    for (const [id, p] of local) positions.set(id, { x: x + p.x, y: y + p.y });
    boxes.push({ x, y, w: side, h: side, ids: group });
    x += side + GAP;
    rowHeight = Math.max(rowHeight, side);
  }
  return { positions, width, height: y + rowHeight, boxes };
}
