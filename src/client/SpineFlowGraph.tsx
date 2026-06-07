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
import { For, Show, createMemo, type JSX } from 'solid-js';
import { KIND_COLOR, KIND_DASH, wrapTitle, type FlowConnection } from './ArgumentFlowGraph';

type Kind = FlowConnection['kind'];

export interface SpineViewDaf {
  page: string;
  nextPage: string | null;
  sections: { index: number; title: string; rabbis: string[] }[];
  flow: FlowConnection[];
  cross: { fromSection: number; toSection: number; relation: string; note?: string }[];
}

const NODE_W = 330, NODE_H = 44, RABBI_H = 18, ROW_GAP = 10;
const DAF_HEADER_H = 26, DAF_GAP = 14;
const TOP_PAD = 12, LEFT_PAD = 46;
const LANE_BASE = 14, LANE_STEP = 12, CORNER_R = 16;
const LINE_H = 15, TITLE_CHARS = 44, TITLE_LINES = 2;
const HILITE = '#b8860b';

interface Edge { from: string; to: string; kind: Kind; cross: boolean; note?: string; fromSec: number; toSec: number; fromPage: string; toPage: string }

const norm = (s: string) => s.trim().toLowerCase();

function assignLanesY(spans: { lo: number; hi: number }[]): number[] {
  const order = spans.map((s, i) => ({ i, lo: s.lo, hi: s.hi })).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const laneHi: number[] = [];
  const lanes = new Array<number>(spans.length).fill(0);
  for (const { i, lo, hi } of order) {
    let lane = laneHi.findIndex((h) => h < lo);
    if (lane === -1) { lane = laneHi.length; laneHi.push(hi); }
    else laneHi[lane] = hi;
    lanes[i] = lane;
  }
  return lanes;
}

export default function SpineFlowGraph(props: { dapim: SpineViewDaf[]; highlight?: string | null; onRabbi?: (name: string) => void }): JSX.Element {
  const model = createMemo(() => {
    const nodeY = new Map<string, number>();
    const nodeH = new Map<string, number>();
    const nodeTitle = new Map<string, string>();
    const nodeNum = new Map<string, number>();
    const nodeRabbis = new Map<string, string[]>();
    const dafHeaders: { page: string; y: number }[] = [];
    let y = TOP_PAD;
    for (const d of props.dapim) {
      dafHeaders.push({ page: d.page, y });
      y += DAF_HEADER_H;
      d.sections.forEach((s, pos) => {
        const key = `${d.page}#${s.index}`;
        const h = NODE_H + (s.rabbis.length ? RABBI_H : 0);
        nodeY.set(key, y); nodeH.set(key, h);
        nodeTitle.set(key, s.title); nodeNum.set(key, pos + 1);
        nodeRabbis.set(key, s.rabbis);
        y += h + ROW_GAP;
      });
      y += DAF_GAP;
    }
    const height = y;

    const edges: Edge[] = [];
    for (const d of props.dapim) {
      for (const c of d.flow) {
        const from = `${d.page}#${c.from}`, to = `${d.page}#${c.to}`;
        if (c.from !== c.to && nodeY.has(from) && nodeY.has(to)) edges.push({ from, to, kind: c.kind, cross: false, note: c.note, fromSec: c.from, toSec: c.to, fromPage: d.page, toPage: d.page });
      }
      if (d.nextPage) for (const e of d.cross) {
        const from = `${d.page}#${e.fromSection}`, to = `${d.nextPage}#${e.toSection}`;
        if (nodeY.has(from) && nodeY.has(to)) edges.push({ from, to, kind: e.relation as Kind, cross: true, note: e.note, fromSec: e.fromSection, toSec: e.toSection, fromPage: d.page, toPage: d.nextPage });
      }
    }

    const mid = (key: string) => (nodeY.get(key) ?? 0) + (nodeH.get(key) ?? NODE_H) / 2;
    const lanes = assignLanesY(edges.map((e) => ({ lo: Math.min(mid(e.from), mid(e.to)), hi: Math.max(mid(e.from), mid(e.to)) })));
    const laneCount = lanes.length ? Math.max(...lanes) + 1 : 0;
    const width = LEFT_PAD + NODE_W + LANE_BASE + Math.max(1, laneCount) * LANE_STEP + 12;
    return { nodeY, nodeH, nodeTitle, nodeNum, nodeRabbis, dafHeaders, height, edges, lanes, width, mid };
  });

  const rightX = LEFT_PAD + NODE_W;
  const laneX = (lane: number) => rightX + LANE_BASE + lane * LANE_STEP;
  const edgePath = (y1: number, y2: number, lane: number): string => {
    const x = laneX(lane);
    const dir = y2 >= y1 ? 1 : -1;
    const r = Math.min(CORNER_R, x - rightX, Math.abs(y2 - y1) / 2 || CORNER_R);
    return [`M ${rightX} ${y1}`, `L ${x - r} ${y1}`, `Q ${x} ${y1} ${x} ${y1 + dir * r}`, `L ${x} ${y2 - dir * r}`, `Q ${x} ${y2} ${x - r} ${y2}`, `L ${rightX} ${y2}`].join(' ');
  };

  return (
    <Show when={props.dapim.length > 0}>
      <div style={{ 'max-height': '78vh', 'overflow-y': 'auto', 'overflow-x': 'auto', border: '1px solid #ece9df', 'border-radius': '8px', background: '#fdfcf9', 'margin-top': '0.6rem', padding: '0.3rem' }}>
        {(() => {
          const m = model();
          const hl = () => (props.highlight ? norm(props.highlight) : null);
          return (
            <svg width={m.width} height={m.height} viewBox={`0 0 ${m.width} ${m.height}`} style={{ display: 'block' }}>
              <defs>
                <For each={Object.entries(KIND_COLOR)}>{([kind, color]) => (
                  <marker id={`spine-arrow-${kind}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M 0 0 L 6 3 L 0 6 z" fill={color} />
                  </marker>
                )}</For>
                <filter id="spine-card-shadow" x="-10%" y="-20%" width="120%" height="150%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#3a3320" flood-opacity="0.12" />
                </filter>
              </defs>

              <For each={m.dafHeaders}>{(h) => (
                <>
                  <line x1={0} y1={h.y + DAF_HEADER_H - 6} x2={m.width} y2={h.y + DAF_HEADER_H - 6} stroke="#efece2" stroke-width={1} />
                  <text x={6} y={h.y + 15} font-size="13" font-weight="700" font-family="'SF Mono', Menlo, monospace" fill="#8a2a2b">{h.page}</text>
                </>
              )}</For>

              <For each={m.edges}>{(e, i) => (
                <path
                  d={edgePath(m.mid(e.from), m.mid(e.to), m.lanes[i()])}
                  fill="none" stroke={KIND_COLOR[e.kind] ?? '#888'}
                  stroke-width={e.cross ? 2.25 : 1.5} stroke-linecap="round" stroke-linejoin="round"
                  stroke-opacity={e.cross ? 0.95 : 0.8} stroke-dasharray={KIND_DASH[e.kind]}
                  marker-end={`url(#spine-arrow-${e.kind})`}
                >
                  <title>{`${e.fromPage} §${e.fromSec + 1} ${e.kind}${e.cross ? ` ${e.toPage}` : ''} §${e.toSec + 1}${e.note ? ` — ${e.note}` : ''}`}</title>
                </path>
              )}</For>

              <For each={[...m.nodeY.keys()]}>{(key) => {
                const yTop = m.nodeY.get(key)!;
                const h = m.nodeH.get(key)!;
                const rabbis = m.nodeRabbis.get(key) ?? [];
                const cyTitle = yTop + NODE_H / 2;
                const lines = wrapTitle(m.nodeTitle.get(key) ?? '', TITLE_CHARS, TITLE_LINES);
                const num = m.nodeNum.get(key) ?? 0;
                const lit = () => hl() !== null && rabbis.some((r) => norm(r) === hl());
                // lay rabbi chips left-to-right with approx text width
                let cx = LEFT_PAD + 10;
                const chips = rabbis.map((r) => { const x = cx; cx += r.length * 5.4 + 12; return { name: r, x }; })
                  .filter((c) => c.x < LEFT_PAD + NODE_W - 16);
                return (
                  <g>
                    <title>{`${num}. ${m.nodeTitle.get(key) ?? ''}`}</title>
                    <rect x={LEFT_PAD} y={yTop} width={NODE_W} height={h} rx={10} ry={10}
                      fill={lit() ? '#fffaf0' : '#ffffff'} stroke={lit() ? HILITE : '#e4e0d4'} stroke-width={lit() ? 2 : 1} filter="url(#spine-card-shadow)" />
                    <circle cx={LEFT_PAD + 18} cy={cyTitle} r={11} fill="#f2eee4" stroke="#e4e0d4" stroke-width={1} />
                    <text x={LEFT_PAD + 18} y={cyTitle} text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="700" font-family="system-ui, sans-serif" fill="#8a2a2b">{num}</text>
                    <For each={lines}>{(line, li) => (
                      <text x={LEFT_PAD + 38} y={cyTitle + (li() - (lines.length - 1) / 2) * LINE_H} text-anchor="start" dominant-baseline="central" font-size="12" font-weight="600" font-family="system-ui, sans-serif" fill="#2a2723">{line}</text>
                    )}</For>
                    <Show when={rabbis.length}>
                      <For each={chips}>{(c) => {
                        const on = () => hl() === norm(c.name);
                        return (
                          <text x={c.x} y={yTop + h - 8} font-size="9.5" font-weight={on() ? 700 : 500}
                            font-family="system-ui, sans-serif" fill={on() ? HILITE : '#8a7a55'}
                            style={{ cursor: 'pointer' }} onClick={() => props.onRabbi?.(c.name)}>
                            <title>{`trace ${c.name} across the tractate`}</title>{c.name}
                          </text>
                        );
                      }}</For>
                    </Show>
                  </g>
                );
              }}</For>
            </svg>
          );
        })()}
      </div>
    </Show>
  );
}
