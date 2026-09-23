/** Shared connector geometry. Layouts reserve bends instead of shrinking them. */
export const CONNECTOR = { radius: 12, straight: 16, gap: 2, lane: 10 } as const;
export const CONNECTOR_CLEARANCE = CONNECTOR.radius + CONNECTOR.straight + CONNECTOR.gap;
export interface Point {
  x: number;
  y: number;
}
export interface Box extends Point {
  width: number;
  height: number;
}
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** Touching intervals use different lanes, including reversed edges. */
export function assignLanes(ranges: readonly { lo: number; hi: number }[]): number[] {
  const order = ranges
    .map((r, i) => ({ i, lo: Math.min(r.lo, r.hi), hi: Math.max(r.lo, r.hi) }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.i - b.i);
  const ends: number[] = [],
    lanes = Array<number>(ranges.length).fill(0);
  for (const { i, lo, hi } of order) {
    let lane = ends.findIndex((end) => end < lo);
    if (lane < 0) lane = ends.length;
    ends[lane] = hi;
    lanes[i] = lane;
  }
  return lanes;
}

export function bounds(points: readonly Point[]): Box {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}

/** Orthogonal vertices must leave room for a full radius at both ends of a leg. */
export function roundedPath(points: readonly Point[], radius = CONNECTOR.radius): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const dx1 = Math.sign(b.x - a.x),
      dy1 = Math.sign(b.y - a.y);
    const dx2 = Math.sign(c.x - b.x),
      dy2 = Math.sign(c.y - b.y);
    const turn = dx1 * dy2 - dy1 * dx2;
    if (!turn) {
      d += ` L ${b.x} ${b.y}`;
      continue;
    }
    d += ` L ${b.x - dx1 * radius} ${b.y - dy1 * radius}`;
    d += ` A ${radius} ${radius} 0 0 ${turn > 0 ? 1 : 0} ${b.x + dx2 * radius} ${b.y + dy2 * radius}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** Route outside both endpoints. The returned bounds include any close-endpoint detour. */
export function routeConnector(
  from: Point,
  to: Point,
  side: Side = 'right',
  lane = 0,
  outside?: number,
) {
  const horizontal = side === 'left' || side === 'right';
  const sign = side === 'left' || side === 'top' ? -1 : 1;
  const canonical = (p: Point): Point =>
    horizontal ? { x: sign * p.x, y: p.y } : { x: sign * p.y, y: p.x };
  const restore = (p: Point): Point =>
    horizontal ? { x: sign * p.x, y: p.y } : { x: p.y, y: sign * p.x };
  const a = canonical(from),
    b = canonical(to);
  const rail =
    Math.max(a.x, b.x, outside === undefined ? -Infinity : sign * outside) +
    CONNECTOR_CLEARANCE +
    Math.max(0, lane) * CONNECTOR.lane;
  const end = { x: b.x + CONNECTOR.gap, y: b.y };
  const r = CONNECTOR.radius;
  // Nearby ports need an extra pair of turns. A tiny U would silently lose the
  // minimum radius, or overshoot the endpoints and double back through a card.
  const vertices =
    Math.abs(b.y - a.y) < 2 * r
      ? [
          a,
          { x: rail, y: a.y },
          { x: rail, y: Math.min(a.y, b.y) - 2 * r - CONNECTOR.straight },
          { x: rail + 2 * r, y: Math.min(a.y, b.y) - 2 * r - CONNECTOR.straight },
          { x: rail + 2 * r, y: b.y },
          end,
        ]
      : [a, { x: rail, y: a.y }, { x: rail, y: b.y }, end];
  const points = vertices.map(restore);
  return { path: roundedPath(points), bounds: bounds(points), points };
}
