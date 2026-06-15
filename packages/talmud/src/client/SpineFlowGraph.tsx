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
/** A cross-text parallel that leaves the visible tractate (another tractate, or
 *  the Yerushalmi) — rendered as a click-to-expand "exit marker" on its section
 *  box rather than an in-graph arrow to an off-screen node. */
export interface ExitMark {
  ref: string;
  relation: string;
  corpus: 'yeru' | 'bavli' | 'here';
  tractate: string;
  page: string;
}
export interface SpineViewDaf {
  page: string;
  nextPage: string | null;
  sections: { index: number; title: string; rabbis: SectionRabbi[]; exits?: ExitMark[] }[];
  flow: FlowConnection[];
  cross: { fromSection: number; toSection: number; relation: string; note?: string }[];
  /** deterministic daf-continuity bridge: does the sugya carry into the next daf? */
  continues?: boolean;
  /** has this daf's cross-daf link been computed yet? false = still cold (the
   *  warmer/sweep hasn't connected this boundary). Drawn as a dashed "not yet
   *  connected" divider so gaps in the map are visible, not silent. */
  crossComputed?: boolean;
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
// Exit markers: the click-to-expand band of cross-text parallels under a box.
const EXIT_H = 21,
  EXIT_TOP = 5,
  EXIT_INDENT = 26,
  BADGE_W = 30,
  BADGE_H = 15;
const PARALLEL = KIND_COLOR.parallels ?? '#7c3aed';
const HILITE = '#b8860b';

/** In-app reader URL for an exit's target — the same `?tractate=&page=` contract
 *  the daf reader + overview cross-references use (hash cleared). */
function dafHref(ex: { tractate: string; page: string }): string {
  const u = new URL(window.location.href);
  u.searchParams.set('tractate', ex.tractate);
  u.searchParams.set('page', ex.page);
  u.hash = '';
  return u.pathname + u.search;
}
/** Whether an exit opens in our reader (a Bavli daf). The Yerushalmi (corpus
 *  'yeru') has no reader page here, so its chip is informative but not clickable
 *  — consistent with the overview, which leaves non-Bavli refs non-clickable. */
const navigableExit = (ex: ExitMark): boolean => ex.corpus !== 'yeru';
const corpusTag = (c: ExitMark['corpus']): string =>
  c === 'yeru' ? 'ירושלמי' : c === 'bavli' ? 'Bavli' : 'this tractate';
const corpusFill = (c: ExitMark['corpus']): string =>
  c === 'yeru' ? '#0e7490' : c === 'bavli' ? '#ece9e1' : '#f3f1ea';
const corpusInk = (c: ExitMark['corpus']): string => (c === 'yeru' ? '#ffffff' : '#57534e');
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
  /** Click handler for a cross-text exit chip. Defaults to opening the target daf
   *  in our reader (`?tractate=&page=`); a non-Bavli target (Yerushalmi) is
   *  non-navigable. */
  onPickExit?: (ex: ExitMark) => void;
}): JSX.Element {
  const pickExit = (ex: ExitMark) => {
    if (props.onPickExit) {
      props.onPickExit(ex);
      return;
    }
    if (navigableExit(ex)) window.location.href = dafHref(ex);
  };
  // Which section boxes have their cross-text exits expanded. Collapsed is the
  // default — a box shows only a small "⤳ N" badge until clicked.
  const [openExits, setOpenExits] = createSignal(new Set<string>());
  const toggleExits = (key: string) =>
    setOpenExits((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const model = createMemo(() => {
    const nodeY = new Map<string, number>();
    const nodeH = new Map<string, number>();
    const nodeTitle = new Map<string, string>();
    const nodeNum = new Map<string, number>();
    const nodeRabbis = new Map<string, SectionRabbi[]>();
    const nodeExits = new Map<string, ExitMark[]>();
    const nodeBand = new Map<string, number>(); // reserved height for an open exits band
    const dafHeaders: { page: string; y: number; pending: boolean }[] = [];
    let y = TOP_PAD;
    for (const d of props.dapim) {
      // pending = this daf has a next daf but its cross-daf link is still cold
      // (not computed). Genuinely-no-link boundaries (computed, 0 edges) are NOT
      // pending — crossComputed distinguishes them.
      dafHeaders.push({ page: d.page, y, pending: !!d.nextPage && d.crossComputed === false });
      y += DAF_HEADER_H;
      d.sections.forEach((s, pos) => {
        const key = `${d.page}#${s.index}`;
        const h = NODE_H + (s.rabbis.length ? RABBI_H : 0);
        nodeY.set(key, y);
        nodeH.set(key, h);
        nodeTitle.set(key, s.title);
        nodeNum.set(key, pos + 1);
        nodeRabbis.set(key, s.rabbis);
        const exits = s.exits ?? [];
        nodeExits.set(key, exits);
        // Reflow: an expanded box reserves a vertical band for its chips, so they
        // never overlap the next box (reading openExits() makes this reactive).
        const band = exits.length && openExits().has(key) ? EXIT_TOP + exits.length * EXIT_H : 0;
        nodeBand.set(key, band);
        y += h + band + ROW_GAP;
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
      nodeExits,
      nodeBand,
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
                        stroke={h.pending ? '#d8d2c4' : '#efece2'}
                        stroke-width={1}
                        stroke-dasharray={h.pending ? '4 3' : undefined}
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
                      <Show when={h.pending}>
                        <text
                          x={m.width - 6}
                          y={h.y + 15}
                          text-anchor="end"
                          font-size="10.5"
                          font-style="italic"
                          font-family="system-ui, -apple-system, sans-serif"
                          fill="#b0a894"
                        >
                          cross-daf link not computed yet
                        </text>
                      </Show>
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
                    // Lay rabbi chips left-to-right, keeping each WITHIN the box.
                    // (The old filter only checked the START x, so a long name —
                    // "Rabbi Elazar b. Azaryah" — overflowed the right edge.) Stop
                    // at the first that won't fit and show "+N"; truncate a lone
                    // over-long first name.
                    const RABBI_RIGHT = LEFT_PAD + NODE_W - 12;
                    let cx = LEFT_PAD + 10;
                    const chips: { name: string; full: string; slug: string; x: number }[] = [];
                    let hiddenRabbis = 0;
                    for (const r of rabbis) {
                      const w = r.name.length * 5.4;
                      if (chips.length > 0 && cx + w > RABBI_RIGHT) {
                        hiddenRabbis = rabbis.length - chips.length;
                        break;
                      }
                      let name = r.name;
                      if (cx + w > RABBI_RIGHT) {
                        const max = Math.max(4, Math.floor((RABBI_RIGHT - cx) / 5.4) - 1);
                        name = `${r.name.slice(0, max)}…`;
                      }
                      chips.push({ name, full: r.name, slug: r.slug, x: cx });
                      cx += name.length * 5.4 + 12;
                    }
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
                              const trace = () => props.onRabbi?.(c.slug);
                              return (
                                // biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram
                                <text
                                  x={c.x}
                                  y={yTop + h - 8}
                                  font-size="9.5"
                                  font-weight={on() ? 700 : 500}
                                  font-family="system-ui, sans-serif"
                                  fill={on() ? HILITE : '#8a7a55'}
                                  style={{ cursor: 'pointer' }}
                                  role="button"
                                  tabindex={0}
                                  onClick={trace}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      trace();
                                    }
                                  }}
                                >
                                  <title>{`trace ${c.full} across the tractate`}</title>
                                  {c.name}
                                </text>
                              );
                            }}
                          </For>
                          <Show when={hiddenRabbis > 0}>
                            <text
                              x={cx}
                              y={yTop + h - 8}
                              font-size="9.5"
                              font-weight={500}
                              font-family="system-ui, sans-serif"
                              fill="#b0a894"
                            >
                              {`+${hiddenRabbis}`}
                            </text>
                          </Show>
                        </Show>
                        {/* cross-text exits: collapsed ⤳N badge → click to expand a chip per parallel */}
                        <Show when={(m.nodeExits.get(key) ?? []).length}>
                          {(() => {
                            const exits = m.nodeExits.get(key) ?? [];
                            const isOpen = () => openExits().has(key);
                            const bx = LEFT_PAD + NODE_W - BADGE_W - 7;
                            const by = yTop + 6;
                            return (
                              <>
                                {/* biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram */}
                                <g
                                  role="button"
                                  tabindex={0}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => toggleExits(key)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggleExits(key);
                                    }
                                  }}
                                >
                                  <title>{`${exits.length} parallel${exits.length > 1 ? 's' : ''} elsewhere — click to ${isOpen() ? 'hide' : 'show'}`}</title>
                                  <rect
                                    x={bx}
                                    y={by}
                                    width={BADGE_W}
                                    height={BADGE_H}
                                    rx={7}
                                    ry={7}
                                    fill={isOpen() ? PARALLEL : '#ffffff'}
                                    stroke={PARALLEL}
                                    stroke-width={1.5}
                                  />
                                  <text
                                    x={bx + BADGE_W / 2}
                                    y={by + BADGE_H / 2 + 0.5}
                                    text-anchor="middle"
                                    dominant-baseline="central"
                                    font-size="10"
                                    font-weight="700"
                                    font-family="system-ui, sans-serif"
                                    fill={isOpen() ? '#ffffff' : PARALLEL}
                                  >
                                    {`⤳ ${exits.length}`}
                                  </text>
                                </g>
                                <Show when={isOpen()}>
                                  <For each={exits}>
                                    {(ex, j) => {
                                      const top = yTop + h + EXIT_TOP + j() * EXIT_H;
                                      const ch = EXIT_H - 3;
                                      const cy = top + ch / 2;
                                      const chipX = LEFT_PAD + EXIT_INDENT;
                                      const chipW = NODE_W - EXIT_INDENT - 6;
                                      const tag = corpusTag(ex.corpus);
                                      const tagW = tag.length * 5.4 + 12;
                                      const refMax = Math.max(
                                        8,
                                        Math.floor((chipW - tagW - 32) / 5.4),
                                      );
                                      const refText =
                                        ex.ref.length > refMax
                                          ? `${ex.ref.slice(0, refMax - 1)}…`
                                          : ex.ref;
                                      const nav = navigableExit(ex);
                                      const inner = (
                                        <>
                                          <title>{`${ex.relation} — ${ex.ref}${nav ? ' (open in reader)' : ' (Yerushalmi — see the daf’s Yerushalmi card)'}`}</title>
                                          <rect
                                            x={chipX}
                                            y={top}
                                            width={chipW}
                                            height={ch}
                                            rx={6}
                                            ry={6}
                                            fill="#ffffff"
                                            stroke="#e4e0d4"
                                            stroke-width={1}
                                          />
                                          <rect
                                            x={chipX}
                                            y={top}
                                            width={3}
                                            height={ch}
                                            fill={PARALLEL}
                                          />
                                          <text
                                            x={chipX + 11}
                                            y={cy}
                                            dominant-baseline="central"
                                            font-size="10"
                                            fill="#9a948a"
                                          >
                                            ↗
                                          </text>
                                          <text
                                            x={chipX + 22}
                                            y={cy}
                                            dominant-baseline="central"
                                            font-size="10.5"
                                            font-weight="500"
                                            font-family="system-ui, sans-serif"
                                            fill="#2a2723"
                                          >
                                            {refText}
                                          </text>
                                          <rect
                                            x={chipX + chipW - tagW - 5}
                                            y={top + 2.5}
                                            width={tagW}
                                            height={ch - 5}
                                            rx={5}
                                            ry={5}
                                            fill={corpusFill(ex.corpus)}
                                          />
                                          <text
                                            x={chipX + chipW - tagW / 2 - 5}
                                            y={cy}
                                            text-anchor="middle"
                                            dominant-baseline="central"
                                            font-size="8.5"
                                            font-weight="650"
                                            font-family="system-ui, sans-serif"
                                            fill={corpusInk(ex.corpus)}
                                          >
                                            {tag}
                                          </text>
                                        </>
                                      );
                                      // Bavli → clickable (opens in our reader); Yerushalmi → informative only.
                                      if (!nav) return <g>{inner}</g>;
                                      return (
                                        // biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram
                                        <g
                                          role="button"
                                          tabindex={0}
                                          style={{ cursor: 'pointer' }}
                                          onClick={() => pickExit(ex)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault();
                                              pickExit(ex);
                                            }
                                          }}
                                        >
                                          {inner}
                                        </g>
                                      );
                                    }}
                                  </For>
                                </Show>
                              </>
                            );
                          })()}
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
                    const pick = () => props.onPickDaf?.(page);
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram
                      <g
                        role="button"
                        tabindex={0}
                        style={{ cursor: props.onPickDaf ? 'pointer' : 'default' }}
                        onClick={pick}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            pick();
                          }
                        }}
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
