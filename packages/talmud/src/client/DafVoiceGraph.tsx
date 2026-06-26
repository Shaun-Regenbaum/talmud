/**
 * The daf-wide VOICE graph: every named rabbi (and collective voice) on the daf
 * as a node, their argumentative relations (opposes / supports / responds-to /
 * cites / resolves) as directed edges, stitched across all the daf's sections by
 * `buildDafVoiceGraph`. Nodes sit in a vertical column (daf order, top to
 * bottom); connectors route through a right-side lane so they never cross node
 * boxes and only ever run horizontally or vertically (orthogonal — no
 * diagonals), exactly like the argument FLOW graph, so the two read as one
 * visual language at different zooms.
 *
 * Nodes are coloured by the speaker's generation (the same red→blue spectrum as
 * the inline rabbi marks); a collective voice (Stam, Sages) gets a neutral
 * stripe. Click a node to focus it — its relations stay lit, the rest fade.
 */
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import type { DafVoiceEdge, DafVoiceNode, VoiceRelationKind } from '../lib/typing/dafVoices';
import {
  assignLanes,
  type FlowConnection,
  KIND_COLOR,
  KIND_DASH,
  stmtRelKind,
  wrapTitle,
} from './ArgumentFlowGraph';
import { colorForGeneration, GENERATION_BY_ID } from './generations';
import { lang, t } from './i18n';

interface Props {
  nodes: DafVoiceNode[];
  edges: DafVoiceEdge[];
}

const NODE_W = 256;
const NODE_H = 50;
const ROW_GAP = 12;
const TOP_PAD = 12;
const LEFT_PAD = 12;
const LANE_BASE = 12;
const LANE_STEP = 12;
const CORNER_R = 16;
const STRIPE_W = 6;
const COLLECTIVE_INK = '#b8b2a4';
// `supports` (raya / proof) has no section-flow kin, so it keeps its own
// evidential hue — matching ArgumentFlowGraph's STMT_SUPPORTS_COLOR.
const SUPPORTS_COLOR = '#0891b2';

const REL_ORDER: VoiceRelationKind[] = ['opposes', 'responds-to', 'resolves', 'cites', 'supports'];

/** Relation colour: `supports` is special (own hue); the rest borrow the
 *  section-flow palette through the same `stmtRelKind` mapping the per-section
 *  statement spine uses. */
function relColor(kind: VoiceRelationKind): string {
  return kind === 'supports' ? SUPPORTS_COLOR : KIND_COLOR[stmtRelKind(kind)];
}
function relDash(kind: VoiceRelationKind): string | undefined {
  return kind === 'supports' ? undefined : KIND_DASH[stmtRelKind(kind)];
}

export default function DafVoiceGraph(props: Props): JSX.Element {
  const [focus, setFocus] = createSignal<string | null>(null);
  const toggleFocus = (name: string) => setFocus((f) => (f === name ? null : name));

  // name -> row index (column position), in daf order.
  const rowOf = createMemo(() => new Map(props.nodes.map((n, i) => [n.name, i])));
  const nodeY = (i: number) => TOP_PAD + i * (NODE_H + ROW_GAP);
  const rowMidY = (i: number) => nodeY(i) + NODE_H / 2;

  // Edges reduced to row endpoints (drop any whose endpoint isn't a node — the
  // builder already guarantees this, but stay defensive).
  const layoutEdges = createMemo(() => {
    const rm = rowOf();
    return props.edges
      .map((e) => ({ e, from: rm.get(e.from), to: rm.get(e.to) }))
      .filter(
        (x): x is { e: DafVoiceEdge; from: number; to: number } =>
          x.from !== undefined && x.to !== undefined && x.from !== x.to,
      );
  });

  // Lane assignment reuses the flow graph's interval-graph colouring: edges with
  // overlapping vertical extent never share a lane (no drawing on top of each other).
  const lanes = createMemo(() =>
    assignLanes(
      layoutEdges().map((x) => ({ from: x.from, to: x.to, kind: 'continues' }) as FlowConnection),
    ),
  );
  const laneCount = createMemo(() => {
    const ls = lanes();
    return ls.length ? Math.max(...ls) + 1 : 0;
  });
  const laneX = (lane: number) => LEFT_PAD + NODE_W + LANE_BASE + lane * LANE_STEP;
  const gutter = () => LANE_BASE + Math.max(1, laneCount()) * LANE_STEP + 10;
  const width = () => LEFT_PAD + NODE_W + gutter();
  const height = () =>
    props.nodes.length ? TOP_PAD + props.nodes.length * (NODE_H + ROW_GAP) - ROW_GAP + TOP_PAD : 0;

  // Names lit when a node is focused: the node itself + every voice it relates to.
  const litNames = createMemo(() => {
    const f = focus();
    if (!f) return null;
    const lit = new Set<string>([f]);
    for (const e of props.edges) {
      if (e.from === f) lit.add(e.to);
      if (e.to === f) lit.add(e.from);
    }
    return lit;
  });
  const nodeDim = (name: string) => {
    const lit = litNames();
    return lit ? (lit.has(name) ? 1 : 0.3) : 1;
  };
  const edgeOpacity = (e: DafVoiceEdge) => {
    const f = focus();
    if (!f) return 0.82;
    return e.from === f || e.to === f ? 0.95 : 0.1;
  };

  const edgePath = (y1: number, y2: number, x: number): string => {
    const rightX = LEFT_PAD + NODE_W;
    const dir = y2 >= y1 ? 1 : -1;
    const r = Math.min(CORNER_R, x - rightX, Math.abs(y2 - y1) / 2 || CORNER_R);
    return [
      `M ${rightX} ${y1}`,
      `L ${x - r} ${y1}`,
      `Q ${x} ${y1} ${x} ${y1 + dir * r}`,
      `L ${x} ${y2 - dir * r}`,
      `Q ${x} ${y2} ${x - r} ${y2}`,
      `L ${rightX} ${y2}`,
    ].join(' ');
  };

  const relsPresent = createMemo(() => {
    const seen = new Set<VoiceRelationKind>();
    for (const e of props.edges) seen.add(e.kind);
    return REL_ORDER.filter((k) => seen.has(k));
  });

  const displayName = (n: DafVoiceNode) => (lang() === 'he' && n.nameHe ? n.nameHe : n.name);
  const genLabel = (n: DafVoiceNode): string => {
    if (n.collective) return t('dafvoices.collective');
    if (!n.generation) return '';
    return GENERATION_BY_ID[n.generation as keyof typeof GENERATION_BY_ID]?.label ?? '';
  };

  return (
    <Show when={props.nodes.length > 0}>
      <div
        style={{
          width: '100%',
          'min-width': 0,
          'max-height': '70vh',
          'overflow-x': 'auto',
          'overflow-y': 'auto',
          direction: 'ltr',
          border: '1px solid #ece9df',
          'border-radius': '8px',
          background: '#fdfcf9',
          padding: '0.35rem 0.2rem',
        }}
      >
        <svg
          role="img"
          aria-label="Daf voice graph"
          width={width()}
          height={height()}
          viewBox={`0 0 ${width()} ${height()}`}
          style={{ display: 'block' }}
        >
          <defs>
            <For each={[...REL_ORDER]}>
              {(kind) => (
                <marker
                  id={`voice-arrow-${kind}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M 0 0 L 6 3 L 0 6 z" fill={relColor(kind)} />
                </marker>
              )}
            </For>
            <filter id="voice-card-shadow" x="-10%" y="-20%" width="120%" height="150%">
              <feDropShadow
                dx="0"
                dy="1"
                stdDeviation="1.4"
                flood-color="#3a3320"
                flood-opacity="0.12"
              />
            </filter>
          </defs>

          {/* Connectors (behind nodes). */}
          <For each={layoutEdges()}>
            {(x, i) => {
              const c = x.e;
              const y1 = rowMidY(x.from);
              const y2 = rowMidY(x.to);
              const lane = lanes()[i()];
              return (
                <path
                  d={edgePath(y1, y2, laneX(lane))}
                  fill="none"
                  stroke={relColor(c.kind)}
                  stroke-width={1.5}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-opacity={edgeOpacity(c)}
                  stroke-dasharray={relDash(c.kind)}
                  marker-end={`url(#voice-arrow-${c.kind})`}
                >
                  <title>{`${c.from} — ${t(`dafvoices.rel.${c.kind}`)} → ${c.to}${c.note ? ` (${c.note})` : ''}${c.sections.length > 1 ? ` ·  ${c.sections.length}` : ''}`}</title>
                </path>
              );
            }}
          </For>

          {/* Nodes: rounded card + generation stripe + name + generation/role line. */}
          <For each={props.nodes}>
            {(n, i) => {
              const stripe = n.collective ? COLLECTIVE_INK : colorForGeneration(n.generation);
              const lines = () => wrapTitle(displayName(n), 24, 2);
              const focused = () => focus() === n.name;
              const pick = () => toggleFocus(n.name);
              const top = nodeY(i());
              const cx = LEFT_PAD + STRIPE_W + 11;
              const titleX = LEFT_PAD + STRIPE_W + 11;
              const sub = () => {
                const g = genLabel(n);
                const secs = n.sections.length;
                const secTxt = secs > 1 ? `·  ${secs} ${t('dafvoices.sections')}` : '';
                return [g, secTxt].filter(Boolean).join('  ');
              };
              return (
                // biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram
                <g
                  role="button"
                  tabindex={0}
                  style={{ cursor: 'pointer', opacity: nodeDim(n.name) }}
                  onClick={pick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      pick();
                    }
                  }}
                >
                  <title>{`${n.name}${n.generation && !n.collective ? ` — ${genLabel(n)}` : ''} · ${n.sections.length} section${n.sections.length > 1 ? 's' : ''}`}</title>
                  {/* Stripe under a left-inset white body (the SVG analog of border-left). */}
                  <rect
                    x={LEFT_PAD}
                    y={top}
                    width={NODE_W}
                    height={NODE_H}
                    rx={9}
                    ry={9}
                    fill={stripe}
                  />
                  <rect
                    x={LEFT_PAD + STRIPE_W}
                    y={top}
                    width={NODE_W - STRIPE_W}
                    height={NODE_H}
                    rx={9}
                    ry={9}
                    fill={focused() ? '#fdf2f2' : '#ffffff'}
                  />
                  <rect
                    x={LEFT_PAD}
                    y={top}
                    width={NODE_W}
                    height={NODE_H}
                    rx={9}
                    ry={9}
                    fill="none"
                    stroke={focused() ? '#8a2a2b' : '#e4e0d4'}
                    stroke-width={focused() ? 1.75 : 1}
                    filter="url(#voice-card-shadow)"
                  />
                  <For each={lines()}>
                    {(line, li) => (
                      <text
                        x={titleX}
                        y={top + 17 + li() * 15}
                        text-anchor={lang() === 'he' ? 'end' : 'start'}
                        dominant-baseline="central"
                        font-size="13"
                        font-weight="600"
                        font-family="system-ui, -apple-system, sans-serif"
                        fill="#2a2520"
                        font-style={n.collective ? 'italic' : 'normal'}
                        direction={lang() === 'he' ? 'rtl' : 'ltr'}
                      >
                        {line}
                      </text>
                    )}
                  </For>
                  <Show when={sub()}>
                    <text
                      x={cx}
                      y={top + NODE_H - 11}
                      text-anchor={lang() === 'he' ? 'end' : 'start'}
                      dominant-baseline="central"
                      font-size="9.5"
                      font-weight="600"
                      letter-spacing="0.03em"
                      font-family="system-ui, sans-serif"
                      fill={n.collective ? '#8a857c' : stripe}
                      fill-opacity={0.85}
                      direction={lang() === 'he' ? 'rtl' : 'ltr'}
                    >
                      {sub()}
                    </text>
                  </Show>
                </g>
              );
            }}
          </For>
        </svg>
      </div>

      {/* Legend: relation kinds present. */}
      <Show when={relsPresent().length > 0}>
        <div
          style={{
            display: 'flex',
            'flex-wrap': 'wrap',
            gap: '0.35rem 0.45rem',
            'margin-top': '0.55rem',
          }}
        >
          <For each={relsPresent()}>
            {(kind) => (
              <span
                style={{
                  display: 'inline-flex',
                  'align-items': 'center',
                  gap: '0.35rem',
                  padding: '0.12rem 0.5rem',
                  background: '#faf8f3',
                  border: '1px solid #ece7db',
                  'border-radius': '999px',
                  'font-size': '0.66rem',
                  color: '#6b6661',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '16px',
                    height: 0,
                    'border-top': `2px ${relDash(kind) ? 'dashed' : 'solid'} ${relColor(kind)}`,
                  }}
                />
                {t(`dafvoices.rel.${kind}`)}
              </span>
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}
