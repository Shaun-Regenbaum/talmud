/**
 * RunTreeDock — dev-mode RIGHT SIDE PANEL showing the BUILD PROVENANCE of a piece
 * on the current daf as a click-to-expand dependency DAG, backed by the read-only
 * GET /api/run-tree endpoint.
 *
 * Layout matches the app's argument-flow / voice maps: nodes stacked vertically
 * (root at top, its dependencies below, expanding downward), with connectors
 * routed through a right-side lane — orthogonal, straight runs with rounded
 * turns, lane-assigned so parallel edges never overlap (same edgePath/assignLanes
 * approach as ArgumentFlowGraph). Source nodes carry a database icon (fetched, no
 * cost); LLM nodes a sparkle (model + $). Click a node to open it (lazy-loads its
 * prompt + generation via /api/run); click its ⊕ to reveal its inputs. Shared
 * nodes (e.g. gemara) appear once with fan-in edges.
 *
 * Nodes are HTML cards (rich styling) over an SVG edge layer. The header rolls up
 * the COLD build cost/time, each shared node counted once. Resizable width.
 */

import { createSignal, createMemo, createResource, createEffect, onCleanup, Show, Switch, Match, For, type JSX } from 'solid-js';
import { lang } from './i18n';

interface TreeNode {
  id: string; label: string;
  kind: 'source' | 'llm' | 'computed';
  producer?: 'mark' | 'enrichment';
  model?: string;
  cached: boolean;
  cold_ms: number | null;
  cost: number | null;
  tokens: number | null;
}
interface RunTree {
  root: string; tractate: string; page: string; lang: string;
  nodes: Record<string, TreeNode>;
  edges: Array<[string, string]>;
  totals: { count: number; llm: number; source: number; cached: number; cold_ms: number; cost: number };
}
interface RunResult {
  content?: string;
  model?: string;
  usage?: { total_tokens?: number; cost?: number } | null;
  elapsed_ms?: number;
  cache_hit?: boolean;
  resolved?: { system_prompt: string; user_prompt: string };
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}
function fmtCost(c: number | null | undefined): string {
  return typeof c === 'number' ? `$${c.toFixed(4)}` : '$0';
}

// app graph tokens (from ArgumentFlowGraph / ArgumentVoiceMap)
const CARD_STROKE = '#e4e0d4', ACTIVE_STROKE = '#8a2a2b';
const CANVAS = '#fdfcf9', CANVAS_BORDER = '#ece9df';
const BADGE_LLM = '#1d4ed8', BADGE_PRO = '#7c3aed', BADGE_SRC = '#475569';

// vertical layout — node per row, connectors in a right-side lane gutter
const NODE_W = 290, NODE_H = 54, ROW_GAP = 12, TOP_PAD = 12, LEFT_PAD = 12;
const ROW_H = NODE_H + ROW_GAP;
const LANE_BASE = 14, LANE_STEP = 12, CORNER_R = 14;

/** Interval-graph lane assignment so connectors sharing vertical extent never
 *  sit in the same lane (ported from ArgumentFlowGraph). */
function assignLanes(edges: Array<{ from: number; to: number }>): number[] {
  const order = edges
    .map((c, i) => ({ i, lo: Math.min(c.from, c.to), hi: Math.max(c.from, c.to) }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const laneHi: number[] = [];
  const lanes = new Array<number>(edges.length).fill(0);
  for (const { i, lo, hi } of order) {
    let lane = laneHi.findIndex((h) => h < lo);
    if (lane === -1) { lane = laneHi.length; laneHi.push(hi); }
    else laneHi[lane] = hi;
    lanes[i] = lane;
  }
  return lanes;
}

interface LaidEdge { fromRow: number; toRow: number; lane: number; fromId: string; toId: string; }
interface Layout {
  order: string[];
  rowOf: Map<string, number>;
  edges: LaidEdge[];
  laneCount: number;
  width: number;
  height: number;
}

function computeLayout(tree: RunTree, expanded: Set<string>): Layout {
  const childrenOf = (id: string) => tree.edges.filter((e) => e[0] === id).map((e) => e[1]);
  const root = tree.root;
  // visible = root + transitive children of expanded nodes
  const vis = new Set<string>([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...vis]) if (expanded.has(id)) for (const c of childrenOf(id)) if (!vis.has(c)) { vis.add(c); changed = true; }
  }
  const visEdges = tree.edges.filter(([a, b]) => vis.has(a) && vis.has(b) && expanded.has(a));
  // depth = longest path from root (so a node sits below every parent)
  const depth: Record<string, number> = { [root]: 0 };
  for (let k = 0; k < vis.size + 2; k++) for (const [a, b] of visEdges) if (depth[a] != null) depth[b] = Math.max(depth[b] ?? 0, depth[a] + 1);
  // discovery order (BFS) breaks ties within a depth band
  const seenOrder: string[] = []; const q = [root]; const mark = new Set([root]);
  while (q.length) { const id = q.shift()!; seenOrder.push(id); for (const c of childrenOf(id)) if (vis.has(c) && !mark.has(c)) { mark.add(c); q.push(c); } }
  const order = [...vis].sort((a, b) => (depth[a] ?? 0) - (depth[b] ?? 0) || seenOrder.indexOf(a) - seenOrder.indexOf(b));
  const rowOf = new Map(order.map((id, i) => [id, i]));
  const laid = visEdges.map(([a, b]) => ({ from: rowOf.get(a)!, to: rowOf.get(b)! }));
  const lanes = assignLanes(laid);
  const laneCount = lanes.length ? Math.max(...lanes) + 1 : 0;
  const edges: LaidEdge[] = visEdges.map(([a, b], i) => ({ fromRow: rowOf.get(a)!, toRow: rowOf.get(b)!, lane: lanes[i], fromId: a, toId: b }));
  const gutter = LANE_BASE + Math.max(1, laneCount) * LANE_STEP + 10;
  return {
    order, rowOf, edges, laneCount,
    width: LEFT_PAD + NODE_W + gutter,
    height: TOP_PAD * 2 + order.length * NODE_H + (order.length - 1) * ROW_GAP,
  };
}

/** Orthogonal connector through the right gutter: out of the source's right edge,
 *  a rounded corner into a vertical run at the lane's x, then a rounded corner
 *  back into the target's right edge (ported from ArgumentFlowGraph). */
function edgePath(fromRow: number, toRow: number, lane: number): string {
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

type IconVariant = 'source' | 'mark' | 'enrichment';
/** source = database cylinder, MARK = stacked layers (an extracted annotation
 *  layer), ENRICHMENT/generation = sparkle (an AI synthesis). Inline 18px SVG. */
function NodeIcon(props: { variant: IconVariant; color: string }): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="-9 -9 18 18" style={{ display: 'block', 'flex-shrink': 0 }}>
      <Switch>
        <Match when={props.variant === 'source'}>
          <ellipse cx={0} cy={-3.6} rx={5.6} ry={2.2} fill="none" stroke={props.color} stroke-width={1.4} />
          <path d="M -5.6 -3.6 V 3.6 A 5.6 2.2 0 0 0 5.6 3.6 V -3.6" fill="none" stroke={props.color} stroke-width={1.4} />
          <path d="M -5.6 0 A 5.6 2.2 0 0 0 5.6 0" fill="none" stroke={props.color} stroke-width={1.2} />
        </Match>
        <Match when={props.variant === 'mark'}>
          <path d="M0 -6.4 L6.6 -2.6 L0 1.2 L-6.6 -2.6 Z" fill={props.color} />
          <path d="M-6.6 1.6 L0 5.4 L6.6 1.6" fill="none" stroke={props.color} stroke-width={1.3} stroke-linejoin="round" stroke-linecap="round" />
        </Match>
        <Match when={props.variant === 'enrichment'}>
          <path d="M0 -6.6 L1.7 -1.7 L6.6 0 L1.7 1.7 L0 6.6 L-1.7 1.7 L-6.6 0 L-1.7 -1.7 Z" fill={props.color} />
        </Match>
      </Switch>
    </svg>
  );
}
/** node/run -> icon variant: source (no LLM), mark (extracted layer), or
 *  enrichment (AI generation built ON marks). */
function variantOf(n: { kind: string; producer?: string }): IconVariant {
  return n.kind !== 'llm' ? 'source' : n.producer === 'mark' ? 'mark' : 'enrichment';
}

interface DafRun {
  id: string; label: string; kind: 'llm' | 'computed'; producer: 'mark' | 'enrichment';
  model?: string; cached: boolean; cold_ms: number | null; cost: number | null; tokens: number | null;
}

/** One waterfall row — a piece run with a cold-time bar. Used as the collapsed
 *  header (the selected run) and as each row of the full waterfall list. */
function RunRow(props: { run: DafRun; maxMs: number; active?: boolean; collapsed?: boolean; onClick: () => void }): JSX.Element {
  const r = () => props.run;
  const isLLM = () => r().kind === 'llm';
  const slow = () => (r().cold_ms ?? 0) > 10_000;
  const color = () => isLLM() ? (r().model?.includes('pro') ? BADGE_PRO : BADGE_LLM) : BADGE_SRC;
  const pct = () => Math.max(2, Math.round(((r().cold_ms ?? 0) / props.maxMs) * 100));
  return (
    <div onClick={props.onClick} title={r().id}
      style={{
        display: 'flex', 'align-items': 'center', gap: '0.5rem', padding: '0.3rem 0.6rem', cursor: 'pointer',
        'border-left': `2px solid ${props.active ? ACTIVE_STROKE : 'transparent'}`,
        background: props.active ? '#fdf2f2' : 'transparent',
      }}>
      <NodeIcon variant={variantOf(r())} color={color()} />
      <span style={{ width: '8.5rem', 'flex-shrink': 0, 'font-size': '0.8rem', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{r().label}</span>
      <div style={{ flex: 1, 'min-width': '20px', height: '8px', background: '#efece3', 'border-radius': '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct()}%`, height: '100%', background: !r().cached ? '#d4d4d4' : slow() ? '#fbbf24' : isLLM() ? '#86efac' : '#bae6fd' }} />
      </div>
      <span style={{ width: '2.7rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', 'font-size': '0.72rem', color: slow() ? '#b45309' : '#888', 'flex-shrink': 0 }}>{fmtMs(r().cold_ms)}</span>
      <span style={{ width: '3.7rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', 'font-size': '0.72rem', color: '#047857', 'flex-shrink': 0 }}>{isLLM() ? fmtCost(r().cost) : '—'}</span>
      <span style={{ width: '1.7rem', 'text-align': 'right', 'font-size': '0.6rem', 'flex-shrink': 0 }}>
        <Show when={r().cached} fallback={<span style={{ color: '#b45309' }}>miss</span>}><span style={{ color: '#15803d', background: '#dcfce7', 'border-radius': '3px', padding: '0 0.2rem' }}>hit</span></Show>
      </span>
      <Show when={props.collapsed}><span style={{ color: '#bbb', 'font-size': '0.7rem', 'flex-shrink': 0 }}>▾</span></Show>
    </div>
  );
}

export default function RunTreeDock(props: {
  tractate: string; page: string; open: boolean; onClose: () => void;
  /** Slots for the other dev panels — rendered in their tabs, always mounted
   *  (the marks panel's effects drive the gutter even when the panel is shut). */
  marks?: JSX.Element; checks?: JSX.Element; sections?: JSX.Element;
}): JSX.Element {
  const [tab, setTab] = createSignal<'build' | 'marks' | 'checks' | 'sections'>('build');
  const [view, setView] = createSignal<'waterfall' | 'dag'>('dag');
  const [pieceId, setPieceId] = createSignal('tidbit.essay');
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set(['tidbit.essay']));
  const [selected, setSelected] = createSignal<string | null>('tidbit.essay');
  const [width, setWidth] = createSignal(Math.min(620, Math.round(window.innerWidth * 0.42)));
  const [detailH, setDetailH] = createSignal(Math.round(window.innerHeight * 0.34));

  // Waterfall feed — every top-level run on this daf with cached telemetry.
  const [runs] = createResource(
    () => (props.open ? `${props.tractate}|${props.page}|${lang()}` : null),
    async (): Promise<DafRun[]> => {
      const r = await fetch(`/api/daf-runs/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}?lang=${lang()}`);
      if (!r.ok) return [];
      return ((await r.json()) as { runs: DafRun[] }).runs;
    },
  );
  const maxCold = createMemo(() => Math.max(1, ...(runs() ?? []).map((r) => r.cold_ms ?? 0)));
  const dafTotals = createMemo(() => {
    const rs = runs() ?? [];
    return { count: rs.length, cached: rs.filter((r) => r.cached).length, cost: rs.reduce((s, r) => s + (r.cost ?? 0), 0), cold_ms: rs.reduce((s, r) => s + (r.cold_ms ?? 0), 0) };
  });
  const openPiece = (id: string) => { setPieceId(id); setExpanded(new Set([id])); setSelected(id); setView('dag'); };

  const [tree] = createResource(
    () => (props.open ? `${props.tractate}|${props.page}|${pieceId()}|${lang()}` : null),
    async (): Promise<RunTree | null> => {
      const r = await fetch(`/api/run-tree/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}/${encodeURIComponent(pieceId())}?lang=${lang()}`);
      if (!r.ok) return null;
      return (await r.json()) as RunTree;
    },
  );

  const layout = createMemo<Layout | null>(() => { const t = tree(); return t ? computeLayout(t, expanded()) : null; });
  const nodeOf = (id: string): TreeNode | undefined => tree()?.nodes[id];
  const hasKids = (id: string): boolean => !!tree()?.edges.some((e) => e[0] === id);
  const toggleExpand = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const badgeColor = (n: TreeNode) => n.kind !== 'llm' ? BADGE_SRC : (n.model?.includes('pro') ? BADGE_PRO : BADGE_LLM);

  // The selected node + everything one edge away — for the focus highlight
  // (incident edges drawn bold, the rest faded).
  const connected = createMemo<Set<string>>(() => {
    const sel = selected(); const lay = layout();
    if (!sel || !lay) return new Set();
    const set = new Set<string>([sel]);
    for (const e of lay.edges) { if (e.fromId === sel) set.add(e.toId); if (e.toId === sel) set.add(e.fromId); }
    return set;
  });
  const isIncident = (e: LaidEdge) => e.fromId === selected() || e.toId === selected();

  const [detail] = createResource(
    () => { const id = selected(); const n = id ? nodeOf(id) : null; return n && n.kind !== 'source' && n.producer ? { id, producer: n.producer } : null; },
    async (sel): Promise<RunResult | null> => {
      const body = sel.producer === 'mark'
        ? { mark_id: sel.id, tractate: props.tractate, page: props.page, lang: lang() }
        : { enrichment_id: sel.id, tractate: props.tractate, page: props.page, mark_input: { fields: {} }, lang: lang() };
      const r = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json() as { status?: string; result?: RunResult } | RunResult;
      if (j && typeof j === 'object' && 'status' in j) return j.status === 'ok' ? j.result ?? null : null;
      return j as RunResult;
    },
  );

  const onResizeStart = (ev: MouseEvent) => {
    ev.preventDefault();
    document.body.style.userSelect = 'none';
    const move = (e: MouseEvent) => setWidth(Math.max(380, Math.min(window.innerWidth - 120, window.innerWidth - e.clientX)));
    const up = () => { document.body.style.userSelect = ''; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };
  // Drag the divider between the DAG and the node-detail pane to resize it.
  const onDetailResizeStart = (ev: MouseEvent) => {
    ev.preventDefault();
    document.body.style.userSelect = 'none';
    const move = (e: MouseEvent) => setDetailH(Math.max(110, Math.min(window.innerHeight - 160, window.innerHeight - e.clientY)));
    const up = () => { document.body.style.userSelect = ''; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };

  const nodeY = (id: string) => { const r = layout()!.rowOf.get(id)!; return TOP_PAD + r * ROW_H; };

  // Push the daf left by the panel width when open (mirrors the old left shelf).
  createEffect(() => {
    if (props.open) {
      document.body.style.setProperty('--dev-panel-width', `${width()}px`);
      document.body.classList.add('dev-panel-open');
    } else {
      document.body.classList.remove('dev-panel-open');
      document.body.style.removeProperty('--dev-panel-width');
    }
  });
  onCleanup(() => { document.body.classList.remove('dev-panel-open'); document.body.style.removeProperty('--dev-panel-width'); });

  const TABS: Array<{ id: 'build' | 'marks' | 'checks' | 'sections'; label: string }> = [
    { id: 'build', label: 'Build' }, { id: 'marks', label: 'Marks' }, { id: 'checks', label: 'Checks' }, { id: 'sections', label: 'Sections' },
  ];

  // The aside is ALWAYS rendered (display toggled) so the slotted panels — the
  // marks panel especially — stay mounted and keep driving the gutter even when
  // the dev panel is closed. Only visibility changes with `open`.
  return (
    <aside style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: `${width()}px`,
      background: '#fff', 'border-left': '2px solid #111', 'box-shadow': '-6px 0 24px rgba(0,0,0,0.13)',
      'z-index': 1000, display: props.open ? 'flex' : 'none', 'flex-direction': 'column',
      'font-family': 'system-ui, sans-serif', 'font-size': '13px',
    }}>
      {/* resize handle (left edge) */}
      <div onMouseDown={onResizeStart} title="drag to resize"
        style={{ position: 'absolute', top: 0, left: '-4px', bottom: 0, width: '9px', cursor: 'ew-resize', 'z-index': 1002 }} />

      {/* tab bar */}
      <div style={{ display: 'flex', 'align-items': 'center', gap: '0.15rem', padding: '0.35rem 0.6rem', 'border-bottom': '1px solid #eee', background: '#fafafa', 'flex-shrink': 0 }}>
        <For each={TABS}>{(t) => (
          <button onClick={() => setTab(t.id)} style={{
            font: 'inherit', 'font-size': '0.74rem', cursor: 'pointer', border: 'none', background: tab() === t.id ? '#eef0f2' : 'transparent',
            'border-radius': '5px', padding: '0.25rem 0.55rem', color: tab() === t.id ? '#111' : '#888', 'font-weight': tab() === t.id ? 500 : 400,
          }}>{t.label}</button>
        )}</For>
        <span style={{ 'font-size': '0.7rem', color: '#bbb', 'margin-left': '0.3rem' }}>{props.tractate} {props.page}</span>
        <button onClick={props.onClose} style={{ 'margin-left': 'auto', padding: '2px 10px', cursor: 'pointer', background: '#fff', border: '1px solid #ccc', 'border-radius': '4px', 'font-size': '0.74rem', color: '#555' }}>close</button>
      </div>

      {/* === BUILD tab === */}
      <div style={{ display: tab() === 'build' ? 'flex' : 'none', 'flex-direction': 'column', flex: 1, 'min-height': 0 }}>
        {/* collapsed waterfall row (DAG mode) — click to expand the full waterfall */}
        <Show when={view() === 'dag'}>
          <div style={{ 'border-bottom': '1px solid #eee', 'flex-shrink': 0 }}>
            <RunRow
              run={(runs() ?? []).find((r) => r.id === pieceId()) ?? { id: pieceId(), label: pieceId(), kind: 'llm', producer: 'enrichment', cached: !!tree(), cold_ms: tree()?.totals.cold_ms ?? null, cost: tree()?.totals.cost ?? null, tokens: null }}
              maxMs={maxCold()} collapsed active
              onClick={() => setView('waterfall')}
            />
          </div>
        </Show>

        {/* full waterfall (Activity mode) */}
        <Show when={view() === 'waterfall'}>
          <div style={{ flex: 1, 'min-height': 0, overflow: 'auto' }}>
            <Show when={runs.loading}><div style={{ padding: '0.6rem', color: '#aaa' }}>loading…</div></Show>
            <For each={runs() ?? []}>{(r) => <RunRow run={r} maxMs={maxCold()} active={r.id === pieceId()} onClick={() => openPiece(r.id)} />}</For>
          </div>
        </Show>

        {/* DAG (top, scrollable) */}
        <Show when={view() === 'dag'}>
        <div style={{ flex: 1, 'min-height': 0, overflow: 'auto', background: CANVAS, padding: '0.5rem' }}>
          <Show when={tree.loading}><div style={{ padding: '0.5rem', color: '#aaa' }}>loading…</div></Show>
          <Show when={tree() === null && !tree.loading}><div style={{ padding: '0.5rem', color: '#c00' }}>no graph (unknown piece, or nothing cached)</div></Show>
          <Show when={layout()}>{(lay) => (
            <div style={{ position: 'relative', width: `${lay().width}px`, height: `${lay().height}px`, border: `1px solid ${CANVAS_BORDER}`, 'border-radius': '8px', background: CANVAS }}>
              {/* edge layer */}
              <svg width={lay().width} height={lay().height} style={{ position: 'absolute', inset: 0, 'pointer-events': 'none', overflow: 'visible' }}>
                <defs>
                  <marker id="rt-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#c9b8b0" /></marker>
                  <marker id="rt-arrow-hot" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#8a2a2b" /></marker>
                </defs>
                <For each={lay().edges}>{(e) => {
                  const hot = () => isIncident(e);
                  const faded = () => !!selected() && !hot();
                  return (
                    <path d={edgePath(e.fromRow, e.toRow, e.lane)} fill="none"
                      stroke={hot() ? '#8a2a2b' : '#d3c4ba'} stroke-width={hot() ? 2 : 1.5}
                      stroke-opacity={faded() ? 0.22 : hot() ? 0.85 : 1}
                      stroke-linecap="round" stroke-linejoin="round"
                      marker-end={`url(#${hot() ? 'rt-arrow-hot' : 'rt-arrow'})`} />
                  );
                }}</For>
              </svg>
              {/* node cards */}
              <For each={lay().order}>{(id) => {
                const n = () => nodeOf(id)!;
                const isLLM = () => n().kind === 'llm';
                const sel = () => selected() === id;
                const exp = () => expanded().has(id);
                const slow = () => (n().cold_ms ?? 0) > 10_000;
                const dim = () => !!selected() && !connected().has(id);
                return (
                  <div
                    onClick={() => { setSelected(id); if (hasKids(id)) toggleExpand(id); }}
                    style={{
                      position: 'absolute', left: `${LEFT_PAD}px`, top: `${nodeY(id)}px`, width: `${NODE_W}px`, height: `${NODE_H}px`,
                      display: 'flex', 'align-items': 'center', gap: '0.5rem', padding: '0 0.6rem', cursor: 'pointer', 'box-sizing': 'border-box',
                      background: sel() ? '#fdf2f2' : '#fff',
                      border: `${sel() ? 1.75 : 1}px solid ${sel() ? ACTIVE_STROKE : CARD_STROKE}`,
                      'border-radius': '11px', 'box-shadow': '0 1px 2px rgba(58,51,32,0.08)',
                      opacity: dim() ? 0.42 : 1, transition: 'opacity 0.12s',
                    }}
                  >
                    <NodeIcon variant={variantOf(n())} color={badgeColor(n())} />
                    <div style={{ flex: 1, 'min-width': 0 }}>
                      <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem' }}>
                        <span style={{ 'font-weight': 600, 'font-size': '0.84rem', color: '#2a2723', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{n().label}</span>
                        <span style={{ 'margin-left': 'auto', 'font-size': '0.68rem', 'font-variant-numeric': 'tabular-nums', color: slow() ? '#b45309' : '#9a857c', 'flex-shrink': 0 }}>{fmtMs(n().cold_ms)}</span>
                      </div>
                      <div style={{ 'font-size': '0.66rem', 'font-family': 'ui-monospace, Menlo, monospace', color: isLLM() ? '#9a8fb5' : '#9aa4ad', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
                        {isLLM() ? `${(n().model ?? '').split('/').pop()} · ${fmtCost(n().cost)}` : 'source · $0'}
                      </div>
                    </div>
                    <Show when={hasKids(id)}>
                      <button
                        onClick={(ev) => { ev.stopPropagation(); setSelected(id); toggleExpand(id); }}
                        title={exp() ? 'collapse inputs' : 'expand inputs'}
                        style={{
                          'flex-shrink': 0, width: '18px', height: '18px', 'border-radius': '50%', border: '1px solid #d8c9c0',
                          background: '#fff', color: '#8a7d74', cursor: 'pointer', 'font-size': '0.8rem', 'line-height': 1,
                          display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', padding: 0,
                        }}
                      >{exp() ? '–' : '+'}</button>
                    </Show>
                  </div>
                );
              }}</For>
            </div>
          )}</Show>
        </div>
        </Show>

        {/* node detail (bottom) — DAG mode only; drag its top edge to resize */}
        <Show when={view() === 'dag'}>
        <div style={{ height: `${detailH()}px`, 'flex-shrink': 0, 'border-top': '1px solid #eee', display: 'flex', 'flex-direction': 'column', overflow: 'hidden', position: 'relative' }}>
          <div onMouseDown={onDetailResizeStart} title="drag to resize"
            style={{ position: 'absolute', top: '-3px', left: 0, right: 0, height: '7px', cursor: 'ns-resize', 'z-index': 3 }} />
          <Show when={selected() ? nodeOf(selected()!) : null} fallback={<div style={{ padding: '0.7rem', color: '#bbb' }}>select a node</div>}>{(n) => (
            <>
              <div style={{ padding: '0.45rem 0.7rem', 'border-bottom': '1px solid #f0f0f0', display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'align-items': 'center' }}>
                <span style={{ 'font-weight': 600, 'font-size': '0.84rem', 'margin-right': '0.2rem' }}>{n().label}</span>
                <span style={{ 'font-size': '0.66rem', background: '#f1f1f3', 'border-radius': '4px', padding: '0.05rem 0.4rem', color: '#555', 'font-family': 'ui-monospace, Menlo, monospace' }}>{n().kind === 'source' ? 'source' : (n().model ?? 'llm')}</span>
                <Show when={n().cold_ms != null}><span style={{ 'font-size': '0.66rem', background: '#f1f1f3', 'border-radius': '4px', padding: '0.05rem 0.4rem', color: '#555', 'font-family': 'ui-monospace, Menlo, monospace' }}>gen {fmtMs(n().cold_ms)}</span></Show>
                <Show when={n().kind === 'llm'}><span style={{ 'font-size': '0.66rem', background: '#ecfdf5', 'border-radius': '4px', padding: '0.05rem 0.4rem', color: '#047857', 'font-family': 'ui-monospace, Menlo, monospace' }}>{fmtCost(n().cost)}</span></Show>
                <span style={{ 'font-size': '0.66rem', 'border-radius': '4px', padding: '0.05rem 0.4rem', 'font-family': 'ui-monospace, Menlo, monospace', ...(n().cached ? { background: '#dcfce7', color: '#15803d' } : { background: '#fef3c7', color: '#b45309' }) }}>{n().cached ? 'cached' : 'not cached'}</span>
              </div>
              <div style={{ flex: 1, 'overflow-y': 'auto', padding: '0.6rem 0.7rem' }}>
                <Show when={n().kind === 'source'} fallback={
                  <>
                    <Show when={detail.loading}><div style={{ color: '#aaa', 'font-size': '0.78rem' }}>loading run…</div></Show>
                    <Show when={detail()}>{(r) => (
                      <>
                        <div style={{ 'line-height': 1.5, 'font-size': '0.82rem', color: '#222', 'white-space': 'pre-wrap' }}>{(r().content ?? '').slice(0, 1600)}</div>
                        <Show when={r().resolved}>{(res) => (
                          <details style={{ 'margin-top': '0.7rem' }}>
                            <summary style={{ cursor: 'pointer', 'font-size': '0.74rem', color: '#666' }}>prompt (system + user)</summary>
                            <div style={{ 'font-size': '0.64rem', color: '#999', 'margin-top': '0.3rem' }}>system</div>
                            <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '11px', margin: 0, background: '#f8f8f8', padding: '0.5rem', 'border-radius': '3px', 'max-height': '24vh', overflow: 'auto' }}>{res().system_prompt}</pre>
                            <div style={{ 'font-size': '0.64rem', color: '#999', margin: '0.3rem 0 0' }}>user</div>
                            <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '11px', margin: 0, background: '#f8f8f8', padding: '0.5rem', 'border-radius': '3px', 'max-height': '24vh', overflow: 'auto' }}>{res().user_prompt}</pre>
                          </details>
                        )}</Show>
                      </>
                    )}</Show>
                    <Show when={!detail.loading && !detail()}><div style={{ color: '#bbb', 'font-size': '0.78rem' }}>nothing cached for this node on this daf yet.</div></Show>
                  </>
                }>
                  <div style={{ 'font-size': '0.82rem', color: '#555' }}>A <b>source</b> input — fetched/assembled, no model call (cost $0). The piece's prompt reads its text.</div>
                </Show>
              </div>
            </>
          )}</Show>
        </div>
        </Show>
      </div>{/* end BUILD tab */}

      {/* === MARKS tab === always mounted (its effects drive the gutter) === */}
      <div style={{ display: tab() === 'marks' ? 'block' : 'none', flex: 1, 'min-height': 0, 'overflow-y': 'auto', padding: '0.5rem 0.7rem' }}>{props.marks}</div>
      {/* === CHECKS tab === */}
      <div style={{ display: tab() === 'checks' ? 'block' : 'none', flex: 1, 'min-height': 0, 'overflow-y': 'auto', padding: '0.5rem 0.7rem' }}>{props.checks}</div>
      {/* === SECTIONS tab === */}
      <div style={{ display: tab() === 'sections' ? 'block' : 'none', flex: 1, 'min-height': 0, 'overflow-y': 'auto', padding: '0.5rem 0.7rem' }}>{props.sections}</div>
    </aside>
  );
}
