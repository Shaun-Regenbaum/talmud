/** Places every linked sage in a column for their period, earliest on the left. */
import { genOrder } from './sageArcLayout';

export interface TimelineNode {
  id: string;
  generation: string | null;
  /** Links that are switched on. The most linked people go to the top of their column. */
  degree: number;
}
export interface TimelineBand {
  gen: string | null;
  x: number;
  w: number;
  count: number;
}
export interface TimelineLayout {
  positions: Map<string, { x: number; y: number }>;
  bands: TimelineBand[];
  width: number;
  height: number;
}

export const HEADER = 38;
const ROWS = 44;
const CELL = 11;
const PAD_X = 12;
const MIN_BAND = 44;
const GAP = 6;

export function layoutTimeline(nodes: TimelineNode[]): TimelineLayout {
  const groups = new Map<string | null, TimelineNode[]>();
  for (const n of nodes) {
    const key = n.generation ?? null;
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }
  const order = [...groups.keys()].sort(
    (a, b) => genOrder(a) - genOrder(b) || String(a).localeCompare(String(b)),
  );
  const positions = new Map<string, { x: number; y: number }>();
  const bands: TimelineBand[] = [];
  let x = 0;
  let tallest = 0;
  for (const gen of order) {
    const members = (groups.get(gen) as TimelineNode[]).sort(
      (p, q) => q.degree - p.degree || p.id.localeCompare(q.id),
    );
    const cols = Math.ceil(members.length / ROWS);
    const w = Math.max(MIN_BAND, cols * CELL + PAD_X * 2);
    const inner = cols * CELL;
    for (const [i, n] of members.entries()) {
      positions.set(n.id, {
        x: x + (w - inner) / 2 + Math.floor(i / ROWS) * CELL + CELL / 2,
        y: HEADER + (i % ROWS) * CELL + CELL / 2,
      });
    }
    tallest = Math.max(tallest, Math.min(members.length, ROWS));
    bands.push({ gen, x, w, count: members.length });
    x += w + GAP;
  }
  return { positions, bands, width: Math.max(x - GAP, 0), height: HEADER + tallest * CELL + 8 };
}
