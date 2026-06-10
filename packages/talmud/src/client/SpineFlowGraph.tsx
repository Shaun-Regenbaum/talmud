/**
 * SpineFlowGraph — the whole tractate's argument flow as ONE continuous SVG.
 *
 * Each daf's argument sections are boxes (numbered within their daf); within-daf
 * flow edges AND cross-daf edges (section on daf N → section on daf N+1) are
 * drawn as real orthogonal connectors in the SAME coordinate space, so a
 * relationship that crosses the page break is an actual arrow from one box to
 * the next daf's box. Routed through a right-side lane (interval-coloured).
 *
 * Each box also carries its named rabbis (from the per-section voices). Clicking
 * a rabbi traces them: every box across the tractate where that rabbi speaks is
 * highlighted. Reuses the daf reader's flow palette + title wrapping.
 * Hidden #spine page only.
 */
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { type FlowConnection, KIND_COLOR, KIND_DASH, wrapTitle } from './ArgumentFlowGraph';

type Kind = FlowConnection['kind'];

export interface SectionRabbi {
  slug: string;
  name: string;
}
export interface SpineViewDaf {
  page: string;
  nextPage: string | null;
  sections: { index: number; title: string; rabbis: SectionRabbi[] }[];
  flow: FlowConnection[];
  cross: { fromSection: number; toSection: number; relation: string; note?: string }[];
  /** deterministic daf-continuity bridge: does the sugya carry into the next daf? */
  continues?: boolean;
}

const NODE_W = 330,
  NODE_H = 44,
  RABBI_H = 18,
  ROW_GAP = 10;
const DAF_HEADER_H = 26,
  DAF_GAP = 14;
const TOP_PAD = 12,
  LEFT_PAD = 46;
const LANE_BASE = 14,
  LANE_STEP = 12,
  CORNER_R = 16;
const LINE_H = 15,
  TITLE_CHARS = 44,
  TITLE_LINES = 2;
const HILITE = '#b8860b';
// Overview mode: one compact node per daf so the WHOLE tractate fits a screen.
const OV_NODE_H = 22,
  OV_NODE_W = 132,
  OV_GAP = 6,
  OV_TOP = 12,
  OV_LEFT = 10;

interface Edge {
  from: string;
  to: string;
  kind: Kind;
  cross: boolean;
  note?: string;
  fromSec: number;
  toSec: number;
  fromPage: string;
  toPage: string;
}

function assignLanesY(spans: { lo: number; hi: number }[]): number[] {
  const order = spans
    .map((s, i) => ({ i, lo: s.lo, hi: s.hi }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const laneHi: number[] = [];
  const lanes = new Array<number>(spans.length).fill(0);
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

export default function SpineFlowGraph(props: {
  dapim: SpineViewDaf[];
  highlight?: string | null;
  onRabbi?: (name: string) => void;
  mode?: 'detail' | 'overview';
  onPickDaf?: (page: string) => void;
}): JSX.Element {
  const model = createMemo(() => {
    const nodeY = new Map<string, number>();
    const nodeH = new Map<string, number>();
    const nodeTitle = new Map<string, string>();
    const nodeNum = new Map<string, number>();
    const nodeRabbis = new Map<string, SectionRabbi[]>();
    const dafHeaders: { page: string; y: number }[] = [];
    let y = TOP_PAD;
    for (const d of props.dapim) {
      dafHeaders.push({ page: d.page, y });
      y += DAF_HEADER_H;
      d.sections.forEach((s, pos) => {
        const key = `${d.page}#${s.index}`;
        const h = NODE_H + (s.rabbis.length ? RABBI_H : 0);
        nodeY.set(key, y);
        nodeH.set(key, h);
        nodeTitle.set(key, s.title);
        nodeNum.set(key, pos + 1);
        nodeRabbis.set(key, s.rabbis);
        y += h + ROW_GAP;
      });
      y += DAF_GAP;
    }
    const height = y;

    const edges: Edge[] = [];
    for (const d of props.dapim) {
      for (const c of d.flow) {
        const from = `${d.page}#${c.from}`,
          to = `${d.page}#${c.to}`;
        if (c.from !== c.to && nodeY.has(from) && nodeY.has(to))
          edges.push({
            from,
            to,
            kind: c.kind,
            cross: false,
            note: c.note,
            fromSec: c.from,
            toSec: c.to,
            fromPage: d.page,
            toPage: d.page,
          });
      }
      if (d.nextPage)
        for (const e of d.cross) {
          const from = `${d.page}#${e.fromSection}`,
            to = `${d.nextPage}#${e.toSection}`;
          if (nodeY.has(from) && nodeY.has(to))
            edges.push({
              from,
              to,
              kind: e.relation as Kind,
              cross: true,
              note: e.note,
              fromSec: e.fromSection,
              toSec: e.toSection,
              fromPage: d.page,
              toPage: d.nextPage,
            });
        }
      // Deterministic continuity backbone: when the sugya carries into the next
      // daf but the AI cross-flow found no section-level edge, connect this daf's
      // last section to the next daf's first (so continuing dapim always link;
      // perek boundaries / new topics correctly stay unconnected).
      if (d.continues && d.nextPage && d.cross.length === 0 && d.sections.length) {
        const last = d.sections[d.sections.length - 1].index;
        const from = `${d.page}#${last}`,
          to = `${d.nextPage}#0`;
        if (nodeY.has(from) && nodeY.has(to))
          edges.push({
            from,
            to,
            kind: 'continues',
            cross: true,
            note: 'sugya continues into the next daf',
            fromSec: last,
            toSec: 0,
            fromPage: d.page,
            toPage: d.nextPage,
          });
      }
    }

    const mid = (key: string) => (nodeY.get(key) ?? 0) + (nodeH.get(key) ?? NODE_H) / 2;
    const lanes = assignLanesY(
      edges.map((e) => ({
        lo: Math.min(mid(e.from), mid(e.to)),
        hi: Math.max(mid(e.from), mid(e.to)),
      })),
    );
    const laneCount = lanes.length ? Math.max(...lanes) + 1 : 0;
    const width = LEFT_PAD + NODE_W + LANE_BASE + Math.max(1, laneCount) * LANE_STEP + 12;
    return {
      nodeY,
      nodeH,
      nodeTitle,
      nodeNum,
      nodeRabbis,
      dafHeaders,
      height,
      edges,
      lanes,
      width,
      mid,
    };
  });

  // Overview model: one compact node per daf (page label + section-count), with
  // daf→nextDaf edges (one per cross-relation present, else the continuity
  // backbone). The whole tractate's shape on one screen.
  const overviewModel = createMemo(() => {
    const nodeY = new Map<string, number>();
    const meta = new Map<string, { sections: number; hasCross: boolean }>();
    let y = OV_TOP;
    for (const d of props.dapim) {
      nodeY.set(d.page, y);
      meta.set(d.page, { sections: d.sections.length, hasCross: d.cross.length > 0 });
      y += OV_NODE_H + OV_GAP;
    }
    const height = y + 4;
    const pageSet = new Set(props.dapim.map((d) => d.page));
    const edges: { from: string; to: string; kind: Kind }[] = [];
    for (const d of props.dapim) {
      if (!d.nextPage || !pageSet.has(d.nextPage)) continue;
      const kinds = new Set<Kind>();
      for (const e of d.cross) kinds.add(e.relation as Kind);
      if (kinds.size === 0 && d.continues) kinds.add('continues');
      for (const k of kinds) edges.push({ from: d.page, to: d.nextPage, kind: k });
    }
    const mid = (p: string) => (nodeY.get(p) ?? 0) + OV_NODE_H / 2;
    const lanes = assignLanesY(
      edges.map((e) => ({
        lo: Math.min(mid(e.from), mid(e.to)),
        hi: Math.max(mid(e.from), mid(e.to)),
      })),
    );
    const laneCount = lanes.length ? Math.max(...lanes) + 1 : 0;
    const width = OV_LEFT + OV_NODE_W + LANE_BASE + Math.max(1, laneCount) * LANE_STEP + 12;
    return { nodeY, meta, edges, lanes, mid, height, width };
  });

  // Orthogonal connector through a right-side lane gutter. rX = node right edge.
  const orthPath = (y1: number, y2: number, lane: number, rX: number): string => {
    const x = rX + LANE_BASE + lane * LANE_STEP;
    const dir = y2 >= y1 ? 1 : -1;
    const r = Math.min(CORNER_R, x - rX, Math.abs(y2 - y1) / 2 || CORNER_R);
    return [
      `M ${rX} ${y1}`,
      `L ${x - r} ${y1}`,
      `Q ${x} ${y1} ${x} ${y1 + dir * r}`,
      `L ${x} ${y2 - dir * r}`,
      `Q ${x} ${y2} ${x - r} ${y2}`,
      `L ${rX} ${y2}`,
    ].join(' ');
  };
  const edgePath = (y1: number, y2: number, lane: number): string =>
    orthPath(y1, y2, lane, LEFT_PAD + NODE_W);

  // Zoom lets you shrink the whole rendered map to read its shape, then scale
  // back in. The container keeps its own scrollbars for panning; ctrl/cmd+wheel
  // zooms. "fit" scales the map to the container height.
  const [zoom, setZoom] = createSignal(1);
  const clampZoom = (z: number) => Math.max(0.12, Math.min(2, z));
  let boxRef: HTMLDivElement | undefined;
  const activeHeight = () => (props.mode === 'overview' ? overviewModel().height : model().height);
  const fit = () => {
    const h = (boxRef?.clientHeight || 600) - 12;
    setZoom(clampZoom(h / activeHeight()));
  };
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.12 : 0.89)));
    }
  };
  const zbtn: JSX.CSSProperties = {
    font: 'inherit',
    'font-size': '0.78rem',
    padding: '0.1rem 0.5rem',
    border: '1px solid var(--line)',
    'border-radius': '6px',
    background: '#fff',
    cursor: 'pointer',
    color: 'var(--fg)',
  };

  return (
    <Show when={props.dapim.length > 0}>
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '0.35rem',
          'margin-top': '0.4rem',
          'font-size': '0.78rem',
          color: 'var(--muted)',
        }}
      >
        <button
          type="button"
          style={zbtn}
          title="zoom out"
          onClick={() => setZoom((z) => clampZoom(z * 0.85))}
        >
          &minus;
        </button>
        <span style={{ 'min-width': '3ch', 'text-align': 'center' }}>
          {Math.round(zoom() * 100)}%
        </span>
        <button
          type="button"
          style={zbtn}
          title="zoom in"
          onClick={() => setZoom((z) => clampZoom(z * 1.18))}
        >
          +
        </button>
        <button type="button" style={zbtn} onClick={() => setZoom(1)}>
          1:1
        </button>
        <button type="button" style={zbtn} onClick={fit}>
          fit height
        </button>
        <span style={{ 'margin-left': '0.3rem' }}>ctrl/&#8984;+scroll to zoom</span>
      </div>
      <div
        ref={boxRef}
        onWheel={onWheel}
        style={{
          'max-height': '78vh',
          'overflow-y': 'auto',
          'overflow-x': 'auto',
          border: '1px solid #ece9df',
          'border-radius': '8px',
          background: '#fdfcf9',
          'margin-top': '0.4rem',
          padding: '0.3rem',
        }}
      >
        <Show
          when={props.mode === 'overview'}
          fallback={(() => {
            const m = model();
            const hl = () => props.highlight ?? null; // a rabbi slug
            return (
              <svg
                role="img"
                aria-label="Cross-daf flow graph for this spine"
                width={m.width * zoom()}
                height={m.height * zoom()}
                viewBox={`0 0 ${m.width} ${m.height}`}
                style={{ display: 'block' }}
              >
                <defs>
                  <For each={Object.entries(KIND_COLOR)}>
                    {([kind, color]) => (
                      <marker
                        id={`spine-arrow-${kind}`}
                        markerWidth="8"
                        markerHeight="8"
                        refX="6"
                        refY="3"
                        orient="auto"
                      >
                        <path d="M 0 0 L 6 3 L 0 6 z" fill={color} />
                      </marker>
                    )}
                  </For>
                  <filter id="spine-card-shadow" x="-10%" y="-20%" width="120%" height="150%">
                    <feDropShadow
                      dx="0"
                      dy="1"
                      stdDeviation="1.2"
                      flood-color="#3a3320"
                      flood-opacity="0.12"
                    />
                  </filter>
                </defs>

                <For each={m.dafHeaders}>
                  {(h) => (
                    <>
                      <line
                        x1={0}
                        y1={h.y + DAF_HEADER_H - 6}
                        x2={m.width}
                        y2={h.y + DAF_HEADER_H - 6}
                        stroke="#efece2"
                        stroke-width={1}
                      />
                      <text
                        x={6}
                        y={h.y + 15}
                        font-size="13"
                        font-weight="700"
                        font-family="system-ui, -apple-system, sans-serif"
                        fill="#8a2a2b"
                      >
                        {h.page}
                      </text>
                    </>
                  )}
                </For>

                <For each={m.edges}>
                  {(e, i) => (
                    <path
                      d={edgePath(m.mid(e.from), m.mid(e.to), m.lanes[i()])}
                      fill="none"
                      stroke={KIND_COLOR[e.kind] ?? '#888'}
                      stroke-width={e.cross ? 2.25 : 1.5}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-opacity={e.cross ? 0.95 : 0.8}
                      stroke-dasharray={KIND_DASH[e.kind]}
                      marker-end={`url(#spine-arrow-${e.kind})`}
                    >
                      <title>{`${e.fromPage} §${e.fromSec + 1} ${e.kind}${e.cross ? ` ${e.toPage}` : ''} §${e.toSec + 1}${e.note ? ` — ${e.note}` : ''}`}</title>
                    </path>
                  )}
                </For>

                <For each={[...m.nodeY.keys()]}>
                  {(key) => {
                    const yTop = m.nodeY.get(key)!;
                    const h = m.nodeH.get(key)!;
                    const rabbis = m.nodeRabbis.get(key) ?? [];
                    const cyTitle = yTop + NODE_H / 2;
                    const lines = wrapTitle(m.nodeTitle.get(key) ?? '', TITLE_CHARS, TITLE_LINES);
                    const num = m.nodeNum.get(key) ?? 0;
                    const lit = () => hl() !== null && rabbis.some((r) => r.slug === hl());
                    // lay rabbi chips left-to-right with approx text width
                    let cx = LEFT_PAD + 10;
                    const chips = rabbis
                      .map((r) => {
                        const x = cx;
                        cx += r.name.length * 5.4 + 12;
                        return { name: r.name, slug: r.slug, x };
                      })
                      .filter((c) => c.x < LEFT_PAD + NODE_W - 16);
                    return (
                      <g>
                        <title>{`${num}. ${m.nodeTitle.get(key) ?? ''}`}</title>
                        <rect
                          x={LEFT_PAD}
                          y={yTop}
                          width={NODE_W}
                          height={h}
                          rx={10}
                          ry={10}
                          fill={lit() ? '#fffaf0' : '#ffffff'}
                          stroke={lit() ? HILITE : '#e4e0d4'}
                          stroke-width={lit() ? 2 : 1}
                          filter="url(#spine-card-shadow)"
                        />
                        <circle
                          cx={LEFT_PAD + 18}
                          cy={cyTitle}
                          r={11}
                          fill="#f2eee4"
                          stroke="#e4e0d4"
                          stroke-width={1}
                        />
                        <text
                          x={LEFT_PAD + 18}
                          y={cyTitle}
                          text-anchor="middle"
                          dominant-baseline="central"
                          font-size="11"
                          font-weight="700"
                          font-family="system-ui, sans-serif"
                          fill="#8a2a2b"
                        >
                          {num}
                        </text>
                        <For each={lines}>
                          {(line, li) => (
                            <text
                              x={LEFT_PAD + 38}
                              y={cyTitle + (li() - (lines.length - 1) / 2) * LINE_H}
                              text-anchor="start"
                              dominant-baseline="central"
                              font-size="12"
                              font-weight="600"
                              font-family="system-ui, sans-serif"
                              fill="#2a2723"
                            >
                              {line}
                            </text>
                          )}
                        </For>
                        <Show when={rabbis.length}>
                          <For each={chips}>
                            {(c) => {
                              const on = () => hl() === c.slug;
                              return (
                                <text
                                  x={c.x}
                                  y={yTop + h - 8}
                                  font-size="9.5"
                                  font-weight={on() ? 700 : 500}
                                  font-family="system-ui, sans-serif"
                                  fill={on() ? HILITE : '#8a7a55'}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => props.onRabbi?.(c.slug)}
                                >
                                  <title>{`trace ${c.name} across the tractate`}</title>
                                  {c.name}
                                </text>
                              );
                            }}
                          </For>
                        </Show>
                      </g>
                    );
                  }}
                </For>
              </svg>
            );
          })()}
        >
          {(() => {
            const o = overviewModel();
            return (
              <svg
                role="img"
                aria-label="Spine flow overview"
                width={o.width * zoom()}
                height={o.height * zoom()}
                viewBox={`0 0 ${o.width} ${o.height}`}
                style={{ display: 'block' }}
              >
                <defs>
                  <For each={Object.entries(KIND_COLOR)}>
                    {([kind, color]) => (
                      <marker
                        id={`ov-arrow-${kind}`}
                        markerWidth="8"
                        markerHeight="8"
                        refX="6"
                        refY="3"
                        orient="auto"
                      >
                        <path d="M 0 0 L 6 3 L 0 6 z" fill={color} />
                      </marker>
                    )}
                  </For>
                </defs>
                <For each={o.edges}>
                  {(e, i) => (
                    <path
                      d={orthPath(o.mid(e.from), o.mid(e.to), o.lanes[i()], OV_LEFT + OV_NODE_W)}
                      fill="none"
                      stroke={KIND_COLOR[e.kind] ?? '#888'}
                      stroke-width={1.5}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-opacity={0.85}
                      stroke-dasharray={KIND_DASH[e.kind]}
                      marker-end={`url(#ov-arrow-${e.kind})`}
                    >
                      <title>{`${e.from} ${e.kind} ${e.to}`}</title>
                    </path>
                  )}
                </For>
                <For each={[...o.nodeY.keys()]}>
                  {(page) => {
                    const yTop = o.nodeY.get(page)!;
                    const meta = o.meta.get(page)!;
                    return (
                      <g
                        style={{ cursor: props.onPickDaf ? 'pointer' : 'default' }}
                        onClick={() => props.onPickDaf?.(page)}
                      >
                        <title>{`${page} — ${meta.sections} sections${meta.hasCross ? ' · cross-daf links' : ''}`}</title>
                        <rect
                          x={OV_LEFT}
                          y={yTop}
                          width={OV_NODE_W}
                          height={OV_NODE_H}
                          rx={6}
                          ry={6}
                          fill={meta.hasCross ? '#fdf2f2' : '#ffffff'}
                          stroke={meta.hasCross ? '#d8a3a3' : '#e4e0d4'}
                          stroke-width={1}
                        />
                        <text
                          x={OV_LEFT + 8}
                          y={yTop + OV_NODE_H / 2}
                          dominant-baseline="central"
                          font-size="11"
                          font-weight="700"
                          font-family="system-ui, sans-serif"
                          fill="#8a2a2b"
                        >
                          {page}
                        </text>
                        <For each={Array.from({ length: Math.min(meta.sections, 8) })}>
                          {(_item, di) => (
                            <rect
                              x={OV_LEFT + 44 + di() * 6}
                              y={yTop + OV_NODE_H / 2 - 3}
                              width={4}
                              height={6}
                              rx={1}
                              fill="#9a948a"
                            />
                          )}
                        </For>
                      </g>
                    );
                  }}
                </For>
              </svg>
            );
          })()}
        </Show>
      </div>
    </Show>
  );
}
