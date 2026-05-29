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

const NODE_W = 310;
const NODE_H = 54;
const ROW_GAP = 28;
const LANE_BASE = 26;     // first lane's bow-out from the card's right edge
const LANE_STEP = 18;     // extra bow per concurrent connector lane
const TOP_PAD = 10;
const LEFT_PAD = 10;

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

const LINE_H = 15;        // px between wrapped title lines
const TITLE_CHARS = 40;   // approx chars per line at NODE_W / 12px system font
const TITLE_LINES = 2;    // wrap to at most this many lines, then ellipsize

/** Greedy word-wrap to at most `maxLines` lines of ~`maxChars` each, ellipsizing
 *  any overflow on the final line. SVG can't measure text without the DOM, so we
 *  budget by character count — good enough for section titles, and keeps the
 *  whole node in (Solid-safe) SVG rather than foreignObject. */
function wrapTitle(s: string, maxChars: number, maxLines: number): string[] {
  const words = s.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const cand = cur ? `${cur} ${words[i]}` : words[i];
    if (cand.length <= maxChars || !cur) {
      cur = cand;
    } else {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines - 1) { i++; break; }
    }
  }
  let rest = cur;
  for (; i < words.length; i++) rest += ` ${words[i]}`;
  if (rest.length <= maxChars) {
    if (rest) lines.push(rest);
  } else {
    lines.push(rest.slice(0, maxChars - 1).trimEnd() + '…');
  }
  return lines.length ? lines : [''];
}

export default function ArgumentFlowGraph(props: Props): JSX.Element {
  const nodeY = (i: number) => TOP_PAD + i * (NODE_H + ROW_GAP);
  const rowMidY = (i: number) => nodeY(i) + NODE_H / 2;
  const height = () => TOP_PAD * 2 + props.nodes.length * NODE_H + (props.nodes.length - 1) * ROW_GAP;

  const edges = () => filterFlowConnections(props.connections, props.nodes.length);
  const lanes = () => assignLanes(edges());
  const laneCount = () => { const ls = lanes(); return ls.length ? Math.max(...ls) + 1 : 0; };
  // Gutter wide enough for the deepest lane's bow plus the arrowhead. The cubic
  // only bulges to ~3/4 of the control offset, so this leaves a little air.
  const gutter = () => LANE_BASE + Math.max(1, laneCount()) * LANE_STEP + 8;
  const width = () => LEFT_PAD + NODE_W + gutter();

  // How far this lane's curve bows out past the card's right edge.
  const laneX = (lane: number) => LEFT_PAD + NODE_W + LANE_BASE + lane * LANE_STEP;

  // Distinct kinds present, for the legend (color/dash carry the meaning now —
  // inline labels piled up and were unreadable, mirroring ArgumentVoiceMap).
  const kindsPresent = (): FlowConnection['kind'][] => {
    const seen = new Set<FlowConnection['kind']>();
    for (const e of edges()) seen.add(e.kind);
    return (Object.keys(KIND_COLOR) as FlowConnection['kind'][]).filter((k) => seen.has(k));
  };

  // Soft side curve through the right gutter: a single cubic that leaves the
  // source's right edge horizontally, bows out to the lane depth, and returns
  // horizontally into the target's right edge (so the arrowhead points cleanly
  // left into the card). Both control points share the lane's x, which gives
  // the calm asymmetric arc; lanes keep concurrent curves from overlapping.
  const edgePath = (c: FlowConnection, lane: number): string => {
    const x = laneX(lane);
    const y1 = rowMidY(c.from);
    const y2 = rowMidY(c.to);
    const rightX = LEFT_PAD + NODE_W;
    return `M ${rightX} ${y1} C ${x} ${y1}, ${x} ${y2}, ${rightX} ${y2}`;
  };

  const badgeCX = LEFT_PAD + 18;
  const titleX = LEFT_PAD + 38;

  return (
    <Show when={props.nodes.length > 0}>
      <div style={{
        width: '100%', 'min-width': 0, 'max-height': '520px',
        'overflow-x': 'auto', 'overflow-y': 'auto', direction: 'ltr',
        border: '1px solid #ece9df', 'border-radius': '8px', background: '#fdfcf9',
        'margin-top': '0.6rem', padding: '0.35rem 0.2rem',
      }}>
        <svg width={width()} height={height()} viewBox={`0 0 ${width()} ${height()}`} style={{ display: 'block' }}>
          <defs>
            <For each={Object.entries(KIND_COLOR)}>{([kind, color]) => (
              <marker id={`flow-arrow-${kind}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill={color} />
              </marker>
            )}</For>
            <filter id="flow-card-shadow" x="-10%" y="-20%" width="120%" height="150%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.4" flood-color="#3a3320" flood-opacity="0.12" />
            </filter>
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
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-opacity={0.8}
                stroke-dasharray={KIND_DASH[c.kind]}
                marker-end={`url(#flow-arrow-${c.kind})`}
              >
                <title>{`§${c.from + 1} ${c.kind} §${c.to + 1}${c.note ? ` — ${c.note}` : ''}`}</title>
              </path>
            );
          }}</For>

          {/* Nodes: rounded card + number badge + word-wrapped title. */}
          <For each={props.nodes}>{(n) => {
            const active = () => props.activeIndex === n.index;
            const cy = () => nodeY(n.index) + NODE_H / 2;
            const lines = () => wrapTitle(n.title, TITLE_CHARS, TITLE_LINES);
            return (
              <g style={{ cursor: 'pointer' }} onClick={() => props.onSelect(n.index)}>
                <title>{`${n.index + 1}. ${n.title} — click for voices`}</title>
                <rect
                  x={LEFT_PAD} y={nodeY(n.index)} width={NODE_W} height={NODE_H} rx={10} ry={10}
                  fill={active() ? '#fdf2f2' : '#ffffff'}
                  stroke={active() ? '#8a2a2b' : '#e4e0d4'}
                  stroke-width={active() ? 1.75 : 1}
                  filter="url(#flow-card-shadow)"
                />
                <circle
                  cx={badgeCX} cy={cy()} r={11}
                  fill={active() ? '#8a2a2b' : '#f2eee4'}
                  stroke={active() ? '#8a2a2b' : '#e4e0d4'} stroke-width={1}
                />
                <text
                  x={badgeCX} y={cy()} text-anchor="middle" dominant-baseline="central"
                  font-size="11" font-weight="700"
                  font-family="system-ui, -apple-system, sans-serif"
                  fill={active() ? '#ffffff' : '#8a2a2b'}
                >{n.index + 1}</text>
                <For each={lines()}>{(line, li) => (
                  <text
                    x={titleX}
                    y={cy() + (li() - (lines().length - 1) / 2) * LINE_H}
                    text-anchor="start" dominant-baseline="central"
                    font-size="12" font-weight="600"
                    font-family="system-ui, -apple-system, sans-serif"
                    fill="#2a2723"
                    direction={lang() === 'he' ? 'rtl' : 'ltr'}
                  >{line}</text>
                )}</For>
              </g>
            );
          }}</For>
        </svg>
      </div>

      {/* Legend: color + dash → connection kind (only the kinds in use). */}
      <Show when={kindsPresent().length > 0}>
        <div style={{
          display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem 0.45rem',
          'margin-top': '0.55rem',
        }}>
          <For each={kindsPresent()}>{(kind) => (
            <span style={{
              display: 'inline-flex', 'align-items': 'center', gap: '0.35rem',
              padding: '0.12rem 0.5rem', background: '#faf8f3',
              border: '1px solid #ece7db', 'border-radius': '999px',
              'font-size': '0.66rem', color: '#6b6661',
            }}>
              <span style={{
                display: 'inline-block', width: '16px', height: 0,
                'border-top': `2px ${KIND_DASH[kind] ? 'dashed' : 'solid'} ${KIND_COLOR[kind]}`,
              }} />
              {kind}
            </span>
          )}</For>
        </div>
      </Show>
    </Show>
  );
}
