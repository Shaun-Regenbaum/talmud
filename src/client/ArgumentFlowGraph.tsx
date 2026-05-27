/**
 * Whole-daf argument FLOW graph. Each argument section is a node (in daf
 * order, top to bottom); the daf-level `argument-overview.flow` enrichment
 * supplies the connections between them (continues / resolves / depends-on /
 * parallels / contrasts / generalizes / cites). Connectors route through a
 * right-side lane so they never cross node boxes, and only ever run
 * horizontally or vertically (orthogonal — no diagonals).
 *
 * Clicking a node calls `onSelect(index)` so the parent can expand that
 * section's voice map (the drill-in).
 */
import { For, Show, type JSX } from 'solid-js';
import { lang } from './i18n';

export interface FlowConnection {
  from: number;
  to: number;
  kind: 'continues' | 'resolves' | 'depends-on' | 'parallels' | 'contrasts' | 'generalizes' | 'cites';
  note?: string;
}

export interface FlowNode {
  /** 0-based section index (matches connection from/to). */
  index: number;
  title: string;
}

interface Props {
  nodes: FlowNode[];
  connections: FlowConnection[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
}

const NODE_W = 300;
const NODE_H = 46;
const ROW_GAP = 30;
const LANE_STEP = 16;     // x offset per concurrent connector lane
const TOP_PAD = 8;
const LEFT_PAD = 8;
const NAME_MAX = 46;

const KIND_COLOR: Record<FlowConnection['kind'], string> = {
  continues: '#666',
  resolves: '#15803d',
  'depends-on': '#1d4ed8',
  parallels: '#7c3aed',
  contrasts: '#b91c1c',
  generalizes: '#92400e',
  cites: '#475569',
};
const KIND_DASH: Partial<Record<FlowConnection['kind'], string>> = {
  contrasts: '5 3',
  parallels: '2 3',
};

function clip(s: string): string {
  const t = s.trim();
  return t.length <= NAME_MAX ? t : t.slice(0, NAME_MAX - 1) + '…';
}

/** Keep only connections whose endpoints are valid section indices and which
 *  aren't self-loops. Guards against the LLM emitting an out-of-range or
 *  self-referential index — those would otherwise mis-route or be dropped
 *  silently by the renderer. Pure + exported for tests. */
export function filterFlowConnections(connections: FlowConnection[], nodeCount: number): FlowConnection[] {
  return connections.filter(
    (c) => c.from !== c.to
      && Number.isInteger(c.from) && c.from >= 0 && c.from < nodeCount
      && Number.isInteger(c.to) && c.to >= 0 && c.to < nodeCount,
  );
}

/** Assign each connection a routing lane (0-based) so connectors that share
 *  vertical extent never sit in the same lane — interval-graph coloring, which
 *  keeps parallel runs from drawing on top of each other (the old `i % 4`
 *  cycling collided whenever >4 edges, or fewer edges overlapped in range).
 *  Returns a lane per connection in input order. Pure + exported for tests. */
export function assignLanes(connections: FlowConnection[]): number[] {
  const order = connections
    .map((c, i) => ({ i, lo: Math.min(c.from, c.to), hi: Math.max(c.from, c.to) }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const laneHi: number[] = []; // highest row index currently occupying each lane
  const lanes = new Array<number>(connections.length).fill(0);
  for (const { i, lo, hi } of order) {
    let lane = laneHi.findIndex((h) => h < lo); // a lane whose last run ended above us
    if (lane === -1) { lane = laneHi.length; laneHi.push(hi); }
    else laneHi[lane] = hi;
    lanes[i] = lane;
  }
  return lanes;
}

export default function ArgumentFlowGraph(props: Props): JSX.Element {
  const nodeY = (i: number) => TOP_PAD + i * (NODE_H + ROW_GAP);
  const rowMidY = (i: number) => nodeY(i) + NODE_H / 2;
  const height = () => TOP_PAD * 2 + props.nodes.length * NODE_H + (props.nodes.length - 1) * ROW_GAP;

  const edges = () => filterFlowConnections(props.connections, props.nodes.length);
  const lanes = () => assignLanes(edges());
  const laneCount = () => { const ls = lanes(); return ls.length ? Math.max(...ls) + 1 : 0; };
  // Gutter only as wide as the lanes actually used (min one step of breathing room).
  const gutter = () => Math.max(LANE_STEP, laneCount() * LANE_STEP) + 16;
  const width = () => LEFT_PAD + NODE_W + gutter();

  const laneX = (lane: number) => LEFT_PAD + NODE_W + 12 + lane * LANE_STEP;

  // Distinct kinds present, for the legend (color/dash carry the meaning now —
  // inline labels piled up and were unreadable, mirroring ArgumentVoiceMap).
  const kindsPresent = (): FlowConnection['kind'][] => {
    const seen = new Set<FlowConnection['kind']>();
    for (const e of edges()) seen.add(e.kind);
    return (Object.keys(KIND_COLOR) as FlowConnection['kind'][]).filter((k) => seen.has(k));
  };

  // Orthogonal connector hugging the right gutter: out of the source's right
  // edge, into its lane, vertical to the target's row, back into the target.
  const edgePath = (c: FlowConnection, lane: number): string => {
    const x = laneX(lane);
    const y1 = rowMidY(c.from);
    const y2 = rowMidY(c.to);
    const rightX = LEFT_PAD + NODE_W;
    return `M ${rightX} ${y1} L ${x} ${y1} L ${x} ${y2} L ${rightX} ${y2}`;
  };

  return (
    <Show when={props.nodes.length > 0}>
      <div style={{
        width: '100%', 'min-width': 0, 'max-height': '520px',
        'overflow-x': 'auto', 'overflow-y': 'auto', direction: 'ltr',
        border: '1px solid #f0eee6', 'border-radius': '4px', background: '#fff',
        'margin-top': '0.6rem',
      }}>
        <svg width={width()} height={height()} viewBox={`0 0 ${width()} ${height()}`} style={{ display: 'block' }}>
          <defs>
            <For each={Object.entries(KIND_COLOR)}>{([kind, color]) => (
              <marker id={`flow-arrow-${kind}`} markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill={color} />
              </marker>
            )}</For>
          </defs>

          {/* Connectors (behind nodes). Hover the path for the kind + note. */}
          <For each={edges()}>{(c, i) => {
            const color = KIND_COLOR[c.kind];
            return (
              <path
                d={edgePath(c, lanes()[i()])}
                fill="none"
                stroke={color}
                stroke-width={1.5}
                stroke-dasharray={KIND_DASH[c.kind]}
                marker-end={`url(#flow-arrow-${c.kind})`}
              >
                <title>{`§${c.from + 1} ${c.kind} §${c.to + 1}${c.note ? ` — ${c.note}` : ''}`}</title>
              </path>
            );
          }}</For>

          {/* Nodes */}
          <For each={props.nodes}>{(n) => {
            const active = () => props.activeIndex === n.index;
            return (
              <g style={{ cursor: 'pointer' }} onClick={() => props.onSelect(n.index)}>
                <title>{`${n.index + 1}. ${n.title} — click for voices`}</title>
                <rect
                  x={LEFT_PAD} y={nodeY(n.index)} width={NODE_W} height={NODE_H} rx={6} ry={6}
                  fill={active() ? '#fdf2f2' : '#fff'}
                  stroke={active() ? '#8a2a2b' : '#d9d6cc'}
                  stroke-width={active() ? 2 : 1.5}
                />
                <text
                  x={LEFT_PAD + 12} y={nodeY(n.index) + NODE_H / 2 + 1}
                  text-anchor="start" dominant-baseline="middle"
                  font-size="11" font-weight="600"
                  font-family="system-ui, -apple-system, sans-serif"
                  fill="#222"
                  direction={lang() === 'he' ? 'rtl' : 'ltr'}
                >{`${n.index + 1}. ${clip(n.title)}`}</text>
              </g>
            );
          }}</For>
        </svg>
      </div>

      {/* Legend: color + dash → connection kind (only the kinds in use). */}
      <Show when={kindsPresent().length > 0}>
        <div style={{
          display: 'flex', 'flex-wrap': 'wrap', gap: '0.4rem 0.85rem',
          'margin-top': '0.5rem', 'font-size': '0.64rem', color: '#888',
        }}>
          <For each={kindsPresent()}>{(kind) => (
            <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.3rem' }}>
              <span style={{
                display: 'inline-block', width: '16px', height: 0,
                'border-top': `1.5px ${KIND_DASH[kind] ? 'dashed' : 'solid'} ${KIND_COLOR[kind]}`,
              }} />
              {kind}
            </span>
          )}</For>
        </div>
      </Show>
    </Show>
  );
}
