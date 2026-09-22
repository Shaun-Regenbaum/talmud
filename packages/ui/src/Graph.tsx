import type { JSX } from 'solid-js';

export const GRAPH = {
  border: 'var(--line)',
  surface: 'var(--surface)',
  selected: 'var(--surface-sunk)',
  accent: 'var(--accent)',
  radius: 10,
};

/** Route a connector through a lane beside the cards. Works in either direction. */
export function roundedConnector(
  right: number,
  lane: number,
  from: number,
  to: number,
  radius = 14,
): string {
  const direction = to >= from ? 1 : -1;
  const r = Math.min(radius, Math.max(0, lane - right), Math.abs(to - from) / 2);
  return [
    `M ${right} ${from}`,
    `L ${lane - r} ${from}`,
    `Q ${lane} ${from} ${lane} ${from + direction * r}`,
    `L ${lane} ${to - direction * r}`,
    `Q ${lane} ${to} ${lane - r} ${to}`,
    `L ${right} ${to}`,
  ].join(' ');
}

export function assignLanes(edges: Array<{ from: number; to: number }>): number[] {
  const order = edges
    .map((c, i) => ({ i, lo: Math.min(c.from, c.to), hi: Math.max(c.from, c.to) }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const laneHi: number[] = [];
  const lanes = new Array<number>(edges.length).fill(0);
  for (const { i, lo, hi } of order) {
    let lane = laneHi.findIndex((h) => h < lo);
    if (lane === -1) {
      lane = laneHi.length;
      laneHi.push(hi);
    } else laneHi[lane] = hi;
    lanes[i] = lane;
  }
  return lanes;
}

/** SVG and HTML cards use the same surface, selection border and corner radius. */
export function graphCardStyle(selected: boolean): JSX.CSSProperties {
  return {
    background: selected ? GRAPH.selected : GRAPH.surface,
    border: `${selected ? 1.75 : 1}px solid ${selected ? GRAPH.accent : GRAPH.border}`,
    'border-radius': `${GRAPH.radius}px`,
    'box-shadow': '0 1px 2px rgb(58 51 32 / 8%)',
  };
}
export function GraphCard(props: {
  x: number;
  y: number;
  width: number;
  height: number;
  selected?: boolean;
}): JSX.Element {
  return (
    <rect
      x={props.x}
      y={props.y}
      width={props.width}
      height={props.height}
      rx={GRAPH.radius}
      ry={GRAPH.radius}
      fill={props.selected ? GRAPH.selected : GRAPH.surface}
      stroke={props.selected ? GRAPH.accent : GRAPH.border}
      stroke-width={props.selected ? 1.75 : 1}
    />
  );
}
export function GraphEdge(props: JSX.PathSVGAttributes<SVGPathElement>): JSX.Element {
  return (
    <path
      fill="none"
      stroke="var(--line)"
      stroke-width={1.5}
      stroke-linecap="round"
      stroke-linejoin="round"
      {...props}
    />
  );
}
