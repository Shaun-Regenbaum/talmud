/**
 * runTreeShared — the build-provenance DAG primitives shared by the Inspect dock
 * (RunTreeDock) and the embeddable alignment view (RunTreeDag): the run-tree
 * types, the vertical lane layout (computeLayout / edgePath / assignLanes), the
 * node icon, and the small formatters. One source of truth so the two surfaces
 * can never drift in their graph maths or visuals.
 */
import { type JSX, Match, Switch } from 'solid-js';

export interface TreeNode {
  id: string;
  label: string;
  kind: 'source' | 'llm' | 'computed';
  producer?: 'mark' | 'enrichment';
  model?: string;
  cached: boolean;
  cold_ms: number | null;
  cost: number | null;
  tokens: number | null;
}
export interface RunTree {
  root: string;
  tractate: string;
  page: string;
  lang: string;
  nodes: Record<string, TreeNode>;
  edges: Array<[string, string]>;
  totals: {
    count: number;
    llm: number;
    source: number;
    cached: number;
    cold_ms: number;
    cost: number;
  };
}
export interface RunResult {
  content?: string;
  model?: string;
  usage?: { total_tokens?: number; cost?: number } | null;
  elapsed_ms?: number;
  cache_hit?: boolean;
  resolved?: { system_prompt: string; user_prompt: string };
}

export const fmtMs = (ms: number | null | undefined): string =>
  ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
export const fmtCost = (c: number | null | undefined): string =>
  typeof c === 'number' ? `$${c.toFixed(4)}` : '$0';
export const prettifyId = (id: string): string =>
  id
    .split(/[.-]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
/** A non-ambiguous node name: a sub-enrichment (id has a '.') shows the
 *  prettified id so a bare "Synthesis" reads as "Rabbi Synthesis" / etc. */
export const displayLabel = (id: string, label: string): string =>
  id.includes('.') ? prettifyId(id) : label;

// app graph tokens (from ArgumentFlowGraph / ArgumentVoiceMap)
export const CARD_STROKE = '#e4e0d4',
  ACTIVE_STROKE = '#8a2a2b';
export const CANVAS = '#fdfcf9',
  CANVAS_BORDER = '#ece9df';
export const BADGE_LLM = '#1d4ed8',
  BADGE_PRO = '#7c3aed',
  BADGE_SRC = '#475569';
// vertical layout — node per row, connectors in a right-side lane gutter
export const NODE_W = 290,
  NODE_H = 54,
  ROW_GAP = 12,
  TOP_PAD = 12,
  LEFT_PAD = 12;
export const ROW_H = NODE_H + ROW_GAP;
export const LANE_BASE = 14,
  LANE_STEP = 12,
  CORNER_R = 14;

/** Interval-graph lane assignment so connectors sharing vertical extent never
 *  sit in the same lane (ported from ArgumentFlowGraph). */
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
export interface LaidEdge {
  fromRow: number;
  toRow: number;
  lane: number;
  fromId: string;
  toId: string;
}
export interface Layout {
  order: string[];
  rowOf: Map<string, number>;
  edges: LaidEdge[];
  laneCount: number;
  width: number;
  height: number;
}

export function computeLayout(tree: RunTree, expanded: Set<string>): Layout {
  const childrenOf = (id: string) => tree.edges.filter((e) => e[0] === id).map((e) => e[1]);
  const root = tree.root;
  const vis = new Set<string>([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...vis])
      if (expanded.has(id))
        for (const c of childrenOf(id))
          if (!vis.has(c)) {
            vis.add(c);
            changed = true;
          }
  }
  const visEdges = tree.edges.filter(([a, b]) => vis.has(a) && vis.has(b) && expanded.has(a));
  const depth: Record<string, number> = { [root]: 0 };
  for (let k = 0; k < vis.size + 2; k++)
    for (const [a, b] of visEdges)
      if (depth[a] != null) depth[b] = Math.max(depth[b] ?? 0, depth[a] + 1);
  const seenOrder: string[] = [];
  const q = [root];
  const mark = new Set([root]);
  while (q.length) {
    const id = q.shift()!;
    seenOrder.push(id);
    for (const c of childrenOf(id))
      if (vis.has(c) && !mark.has(c)) {
        mark.add(c);
        q.push(c);
      }
  }
  const order = [...vis].sort(
    (a, b) => (depth[a] ?? 0) - (depth[b] ?? 0) || seenOrder.indexOf(a) - seenOrder.indexOf(b),
  );
  const rowOf = new Map(order.map((id, i) => [id, i]));
  const laid = visEdges.map(([a, b]) => ({ from: rowOf.get(a)!, to: rowOf.get(b)! }));
  const lanes = assignLanes(laid);
  const laneCount = lanes.length ? Math.max(...lanes) + 1 : 0;
  const edges: LaidEdge[] = visEdges.map(([a, b], i) => ({
    fromRow: rowOf.get(a)!,
    toRow: rowOf.get(b)!,
    lane: lanes[i],
    fromId: a,
    toId: b,
  }));
  const gutter = LANE_BASE + Math.max(1, laneCount) * LANE_STEP + 10;
  return {
    order,
    rowOf,
    edges,
    laneCount,
    width: LEFT_PAD + NODE_W + gutter,
    height: TOP_PAD * 2 + order.length * NODE_H + (order.length - 1) * ROW_GAP,
  };
}

/** Orthogonal connector through the right gutter (ported from ArgumentFlowGraph). */
export function edgePath(fromRow: number, toRow: number, lane: number): string {
  const rightX = LEFT_PAD + NODE_W;
  const laneX = LEFT_PAD + NODE_W + LANE_BASE + lane * LANE_STEP;
  const y1 = TOP_PAD + fromRow * ROW_H + NODE_H / 2;
  const y2 = TOP_PAD + toRow * ROW_H + NODE_H / 2;
  const dir = y2 >= y1 ? 1 : -1;
  const r = Math.min(CORNER_R, laneX - rightX, Math.abs(y2 - y1) / 2 || CORNER_R);
  return [
    `M ${rightX} ${y1}`,
    `L ${laneX - r} ${y1}`,
    `Q ${laneX} ${y1} ${laneX} ${y1 + dir * r}`,
    `L ${laneX} ${y2 - dir * r}`,
    `Q ${laneX} ${y2} ${laneX - r} ${y2}`,
    `L ${rightX} ${y2}`,
  ].join(' ');
}

export type IconVariant = 'source' | 'mark' | 'enrichment';
/** source = database cylinder, mark = stacked layers, enrichment/generation =
 *  sparkle. Inline 18px SVG. */
export function NodeIcon(props: { variant: IconVariant; color: string }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="-9 -9 18 18"
      style={{ display: 'block', 'flex-shrink': 0 }}
    >
      <Switch>
        <Match when={props.variant === 'source'}>
          <ellipse
            cx={0}
            cy={-3.6}
            rx={5.6}
            ry={2.2}
            fill="none"
            stroke={props.color}
            stroke-width={1.4}
          />
          <path
            d="M -5.6 -3.6 V 3.6 A 5.6 2.2 0 0 0 5.6 3.6 V -3.6"
            fill="none"
            stroke={props.color}
            stroke-width={1.4}
          />
          <path
            d="M -5.6 0 A 5.6 2.2 0 0 0 5.6 0"
            fill="none"
            stroke={props.color}
            stroke-width={1.2}
          />
        </Match>
        <Match when={props.variant === 'mark'}>
          <path d="M0 -6.4 L6.6 -2.6 L0 1.2 L-6.6 -2.6 Z" fill={props.color} />
          <path
            d="M-6.6 1.6 L0 5.4 L6.6 1.6"
            fill="none"
            stroke={props.color}
            stroke-width={1.3}
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </Match>
        <Match when={props.variant === 'enrichment'}>
          <path
            d="M0 -6.6 L1.7 -1.7 L6.6 0 L1.7 1.7 L0 6.6 L-1.7 1.7 L-6.6 0 L-1.7 -1.7 Z"
            fill={props.color}
          />
        </Match>
      </Switch>
    </svg>
  );
}
export const variantOf = (n: { kind: string; producer?: string }): IconVariant =>
  n.kind !== 'llm' ? 'source' : n.producer === 'mark' ? 'mark' : 'enrichment';
