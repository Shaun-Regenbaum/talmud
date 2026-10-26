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
export interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
  ids: string[];
  /** A small cluster drawn as a short row, with every name written under its dot. */
  compact: boolean;
}
export interface OverviewLayout {
  positions: Map<string, Point>;
  width: number;
  height: number;
  /** One rectangle per cluster, largest first. */
  boxes: LayoutBox[];
}

const PAD = 34;
const GAP = 22;
const COMPACT_MAX = 3;
const TILE_STEP = 92;
const TILE_HEIGHT = 84;
const TILE_DOT_Y = 26;
const MIN_APART = 20;

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

/** Pulls linked names together and pushes all names apart, inside a disc. Same input, same picture. */
function spring(ids: string[], edges: LayoutEdge[], side: number): Map<string, Point> {
  const pos = new Map<string, Point>();
  const centre = side / 2;
  const radius = side / 2 - PAD;
  ids.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / ids.length;
    pos.set(id, {
      x: centre + Math.cos(angle) * radius * 0.6,
      y: centre + Math.sin(angle) * radius * 0.6,
    });
  });
  const k = Math.sqrt((Math.PI * radius * radius) / ids.length) * 0.9;
  let heat = radius / 5;
  for (let step = 0; step < 260; step++) {
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
        // Names that end up closer than a dot's width are pushed apart hard.
        const push = ((k * k) / dist) * (dist < MIN_APART ? 4 : 1);
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
      // A weak pull to the middle keeps loosely linked names from drifting to the rim.
      m.x += (centre - p.x) * 0.3;
      m.y += (centre - p.y) * 0.3;
      const size = Math.max(Math.hypot(m.x, m.y), 0.01);
      const move_ = Math.min(size, heat);
      p.x += (m.x / size) * move_;
      p.y += (m.y / size) * move_;
      const fromCentre = Math.hypot(p.x - centre, p.y - centre);
      if (fromCentre > radius) {
        p.x = centre + ((p.x - centre) / fromCentre) * radius;
        p.y = centre + ((p.y - centre) / fromCentre) * radius;
      }
    }
    heat *= 0.972;
  }
  return pos;
}

/** One to three names in a short row, the best-connected one in the middle. */
function row(ids: string[], edges: LayoutEdge[]): { w: number; points: Map<string, Point> } {
  const degree = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  const sorted = [...ids].sort(
    (x, y) => (degree.get(x) ?? 0) - (degree.get(y) ?? 0) || x.localeCompare(y),
  );
  const order = sorted.length === 3 ? [sorted[0], sorted[2], sorted[1]] : sorted;
  const w = Math.max(TILE_STEP * 1.3, order.length * TILE_STEP);
  const points = new Map<string, Point>();
  for (const [i, id] of order.entries()) {
    points.set(id, { x: w / 2 + (i - (order.length - 1) / 2) * TILE_STEP * 0.9, y: TILE_DOT_Y });
  }
  return { w, points };
}

export function layoutOverview(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  width: number,
): OverviewLayout {
  const ids = new Set(nodes.map((n) => n.id));
  const usable = edges.filter((e) => ids.has(e.a) && ids.has(e.b));
  const positions = new Map<string, Point>();
  const boxes: LayoutBox[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const group of clusters(nodes, usable)) {
    const inside = usable.filter((e) => group.includes(e.a) && group.includes(e.b));
    const compact = group.length <= COMPACT_MAX;
    const tile = compact ? row(group, inside) : null;
    const w = tile
      ? tile.w
      : Math.min(width, Math.max(150, Math.ceil(Math.sqrt(group.length) * 88)));
    const h = tile ? TILE_HEIGHT : w;
    if (x > 0 && x + w > width) {
      x = 0;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    const local = tile ? tile.points : spring(group, inside, w);
    for (const [id, p] of local) positions.set(id, { x: x + p.x, y: y + p.y });
    boxes.push({ x, y, w, h, ids: group, compact });
    x += w + GAP;
    rowHeight = Math.max(rowHeight, h);
  }
  return { positions, width, height: y + rowHeight, boxes };
}

export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  text: string;
  /** Higher is placed first. */
  priority: number;
}

const CHAR_WIDTH = 6;
const LABEL_HEIGHT = 13;

/** Picks the labels that fit. A label that would sit on one already placed is left to the tooltip. */
export function placeLabels(candidates: LabelCandidate[]): Set<string> {
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  const keep = new Set<string>();
  const ordered = [...candidates].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
  for (const c of ordered) {
    const half = (c.text.length * CHAR_WIDTH) / 2 + 3;
    const box = { l: c.x - half, r: c.x + half, t: c.y - LABEL_HEIGHT, b: c.y + 2 };
    const clash = placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t);
    if (clash) continue;
    placed.push(box);
    keep.add(c.id);
  }
  return keep;
}
