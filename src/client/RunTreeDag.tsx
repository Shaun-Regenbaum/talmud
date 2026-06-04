/**
 * RunTreeDag — the build-provenance dependency DAG for ONE piece on a daf,
 * embeddable anywhere (flow layout, no dock chrome). A self-contained extract of
 * the Inspect panel's DAG view (RunTreeDock) so the alignment workbench can show
 * "select a generation → its whole DAG" without mounting the dock.
 *
 * Backed by the read-only GET /api/run-tree/:t/:p/:id[?instance=…]. Click a node
 * to select it (loads its prompt + generation via /api/run); click its ⊕ to
 * reveal its inputs. Arrows point dependency → consumer.
 *
 * NOTE: this duplicates RunTreeDock's DAG render + layout helpers on purpose —
 * the dock is under active development; fold both onto a shared component once
 * that settles.
 */
import { createSignal, createMemo, createResource, createEffect, Show, Switch, Match, For, type JSX } from 'solid-js';
import { lang } from './i18n';

interface TreeNode {
  id: string; label: string;
  kind: 'source' | 'llm' | 'computed';
  producer?: 'mark' | 'enrichment';
  model?: string; cached: boolean; cold_ms: number | null; cost: number | null; tokens: number | null;
}
interface RunTree {
  root: string; tractate: string; page: string; lang: string;
  nodes: Record<string, TreeNode>;
  edges: Array<[string, string]>;
  totals: { count: number; llm: number; source: number; cached: number; cold_ms: number; cost: number };
}
interface RunResult { content?: string; resolved?: { system_prompt: string; user_prompt: string } }

const fmtMs = (ms: number | null | undefined): string => ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
const fmtCost = (c: number | null | undefined): string => typeof c === 'number' ? `$${c.toFixed(4)}` : '$0';
const prettifyId = (id: string): string => id.split(/[.\-]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const displayLabel = (id: string, label: string): string => (id.includes('.') ? prettifyId(id) : label);

const CARD_STROKE = '#e4e0d4', ACTIVE_STROKE = '#8a2a2b';
const CANVAS = '#fdfcf9', CANVAS_BORDER = '#ece9df';
const BADGE_LLM = '#1d4ed8', BADGE_PRO = '#7c3aed', BADGE_SRC = '#475569';
const NODE_W = 290, NODE_H = 54, ROW_GAP = 12, TOP_PAD = 12, LEFT_PAD = 12;
const ROW_H = NODE_H + ROW_GAP;
const LANE_BASE = 14, LANE_STEP = 12, CORNER_R = 14;

function assignLanes(edges: Array<{ from: number; to: number }>): number[] {
  const order = edges.map((c, i) => ({ i, lo: Math.min(c.from, c.to), hi: Math.max(c.from, c.to) })).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const laneHi: number[] = [];
  const lanes = new Array<number>(edges.length).fill(0);
  for (const { i, lo, hi } of order) {
    let lane = laneHi.findIndex((h) => h < lo);
    if (lane === -1) { lane = laneHi.length; laneHi.push(hi); } else laneHi[lane] = hi;
    lanes[i] = lane;
  }
  return lanes;
}
interface LaidEdge { fromRow: number; toRow: number; lane: number; fromId: string; toId: string }
interface Layout { order: string[]; rowOf: Map<string, number>; edges: LaidEdge[]; laneCount: number; width: number; height: number }

function computeLayout(tree: RunTree, expanded: Set<string>): Layout {
  const childrenOf = (id: string) => tree.edges.filter((e) => e[0] === id).map((e) => e[1]);
  const root = tree.root;
  const vis = new Set<string>([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...vis]) if (expanded.has(id)) for (const c of childrenOf(id)) if (!vis.has(c)) { vis.add(c); changed = true; }
  }
  const visEdges = tree.edges.filter(([a, b]) => vis.has(a) && vis.has(b) && expanded.has(a));
  const depth: Record<string, number> = { [root]: 0 };
  for (let k = 0; k < vis.size + 2; k++) for (const [a, b] of visEdges) if (depth[a] != null) depth[b] = Math.max(depth[b] ?? 0, depth[a] + 1);
  const seenOrder: string[] = []; const q = [root]; const mark = new Set([root]);
  while (q.length) { const id = q.shift()!; seenOrder.push(id); for (const c of childrenOf(id)) if (vis.has(c) && !mark.has(c)) { mark.add(c); q.push(c); } }
  const order = [...vis].sort((a, b) => (depth[a] ?? 0) - (depth[b] ?? 0) || seenOrder.indexOf(a) - seenOrder.indexOf(b));
  const rowOf = new Map(order.map((id, i) => [id, i]));
  const laid = visEdges.map(([a, b]) => ({ from: rowOf.get(a)!, to: rowOf.get(b)! }));
  const lanes = assignLanes(laid);
  const laneCount = lanes.length ? Math.max(...lanes) + 1 : 0;
  const edges: LaidEdge[] = visEdges.map(([a, b], i) => ({ fromRow: rowOf.get(a)!, toRow: rowOf.get(b)!, lane: lanes[i], fromId: a, toId: b }));
  const gutter = LANE_BASE + Math.max(1, laneCount) * LANE_STEP + 10;
  return { order, rowOf, edges, laneCount, width: LEFT_PAD + NODE_W + gutter, height: TOP_PAD * 2 + order.length * NODE_H + (order.length - 1) * ROW_GAP };
}
function edgePath(fromRow: number, toRow: number, lane: number): string {
  const rightX = LEFT_PAD + NODE_W;
  const laneX = LEFT_PAD + NODE_W + LANE_BASE + lane * LANE_STEP;
  const y1 = TOP_PAD + fromRow * ROW_H + NODE_H / 2;
  const y2 = TOP_PAD + toRow * ROW_H + NODE_H / 2;
  const dir = y2 >= y1 ? 1 : -1;
  const r = Math.min(CORNER_R, laneX - rightX, Math.abs(y2 - y1) / 2 || CORNER_R);
  return [`M ${rightX} ${y1}`, `L ${laneX - r} ${y1}`, `Q ${laneX} ${y1} ${laneX} ${y1 + dir * r}`, `L ${laneX} ${y2 - dir * r}`, `Q ${laneX} ${y2} ${laneX - r} ${y2}`, `L ${rightX} ${y2}`].join(' ');
}

type IconVariant = 'source' | 'mark' | 'enrichment';
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
const variantOf = (n: { kind: string; producer?: string }): IconVariant => (n.kind !== 'llm' ? 'source' : n.producer === 'mark' ? 'mark' : 'enrichment');

export function RunTreeDag(props: { tractate: string; page: string; pieceId: string; instance?: unknown }): JSX.Element {
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set([props.pieceId]));
  const [selected, setSelected] = createSignal<string | null>(props.pieceId);
  createEffect(() => { const p = props.pieceId; setExpanded(new Set([p])); setSelected(p); });

  const instanceQS = (): string => {
    const inst = props.instance;
    if (!inst || (typeof inst === 'object' && Object.keys(inst as object).length === 0)) return '';
    return `&instance=${encodeURIComponent(JSON.stringify(inst))}`;
  };
  const [tree] = createResource(
    () => `${props.tractate}|${props.page}|${props.pieceId}|${lang()}|${instanceQS()}`,
    async (): Promise<RunTree | null> => {
      const r = await fetch(`/api/run-tree/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}/${encodeURIComponent(props.pieceId)}?lang=${lang()}${instanceQS()}`);
      if (!r.ok) return null;
      return (await r.json()) as RunTree;
    },
  );
  const layout = createMemo<Layout | null>(() => { const t = tree(); return t ? computeLayout(t, expanded()) : null; });
  const nodeOf = (id: string): TreeNode | undefined => tree()?.nodes[id];
  const hasKids = (id: string): boolean => !!tree()?.edges.some((e) => e[0] === id);
  const toggleExpand = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const badgeColor = (n: TreeNode) => (n.kind !== 'llm' ? BADGE_SRC : n.model?.includes('pro') ? BADGE_PRO : BADGE_LLM);
  const connected = createMemo<Set<string>>(() => {
    const sel = selected(); const lay = layout();
    if (!sel || !lay) return new Set();
    const set = new Set<string>([sel]);
    for (const e of lay.edges) { if (e.fromId === sel) set.add(e.toId); if (e.toId === sel) set.add(e.fromId); }
    return set;
  });
  const isIncident = (e: LaidEdge) => e.fromId === selected() || e.toId === selected();
  const nodeY = (id: string) => { const r = layout()!.rowOf.get(id)!; return TOP_PAD + r * ROW_H; };

  const [detail] = createResource(
    () => { const id = selected(); const n = id ? nodeOf(id) : null; return n && n.kind !== 'source' && n.producer ? { id, producer: n.producer, root: id === props.pieceId } : null; },
    async (sel): Promise<RunResult | null> => {
      const markInput = sel.root ? (props.instance ?? { fields: {} }) : { fields: {} };
      const body = sel.producer === 'mark'
        ? { mark_id: sel.id, tractate: props.tractate, page: props.page, lang: lang() }
        : { enrichment_id: sel.id, tractate: props.tractate, page: props.page, mark_input: markInput, lang: lang() };
      const r = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await r.json()) as { status?: string; result?: RunResult } | RunResult;
      if (j && typeof j === 'object' && 'status' in j) return j.status === 'ok' ? (j.result ?? null) : null;
      return j as RunResult;
    },
  );

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem', 'font-family': 'system-ui, sans-serif', 'font-size': '13px' }}>
      {/* DAG */}
      <div style={{ 'max-height': '52vh', overflow: 'auto', background: CANVAS, padding: '0.5rem', border: `1px solid ${CANVAS_BORDER}`, 'border-radius': '8px' }}>
        <Show when={tree.loading}><div style={{ padding: '0.5rem', color: '#aaa' }}>loading…</div></Show>
        <Show when={tree() === null && !tree.loading}><div style={{ padding: '0.5rem', color: '#c00' }}>no graph (unknown piece, or nothing cached)</div></Show>
        <Show when={layout()}>{(lay) => (
          <div style={{ position: 'relative', width: `${lay().width}px`, height: `${lay().height}px` }}>
            <svg width={lay().width} height={lay().height} style={{ position: 'absolute', inset: 0, 'pointer-events': 'none', overflow: 'visible' }}>
              <defs>
                <marker id="rtd-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#c9b8b0" /></marker>
                <marker id="rtd-arrow-hot" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#8a2a2b" /></marker>
              </defs>
              <For each={lay().edges}>{(e) => {
                const hot = () => isIncident(e);
                const faded = () => !!selected() && !hot();
                return (
                  <path d={edgePath(e.toRow, e.fromRow, e.lane)} fill="none"
                    stroke={hot() ? '#8a2a2b' : '#d3c4ba'} stroke-width={hot() ? 2 : 1.5}
                    stroke-opacity={faded() ? 0.22 : hot() ? 0.85 : 1} stroke-linecap="round" stroke-linejoin="round"
                    marker-end={`url(#${hot() ? 'rtd-arrow-hot' : 'rtd-arrow'})`} />
                );
              }}</For>
            </svg>
            <For each={lay().order}>{(id) => {
              const n = () => nodeOf(id)!;
              const isLLM = () => n().kind === 'llm';
              const sel = () => selected() === id;
              const exp = () => expanded().has(id);
              const slow = () => (n().cold_ms ?? 0) > 10_000;
              const dim = () => !!selected() && !connected().has(id);
              return (
                <div onClick={() => { setSelected(id); if (hasKids(id)) toggleExpand(id); }}
                  style={{
                    position: 'absolute', left: `${LEFT_PAD}px`, top: `${nodeY(id)}px`, width: `${NODE_W}px`, height: `${NODE_H}px`,
                    display: 'flex', 'align-items': 'center', gap: '0.5rem', padding: '0 0.6rem', cursor: 'pointer', 'box-sizing': 'border-box',
                    background: sel() ? '#fdf2f2' : '#fff', border: `${sel() ? 1.75 : 1}px solid ${sel() ? ACTIVE_STROKE : CARD_STROKE}`,
                    'border-radius': '11px', 'box-shadow': '0 1px 2px rgba(58,51,32,0.08)', opacity: dim() ? 0.42 : 1, transition: 'opacity 0.12s',
                  }}>
                  <NodeIcon variant={variantOf(n())} color={badgeColor(n())} />
                  <div style={{ flex: 1, 'min-width': 0 }}>
                    <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem' }}>
                      <span style={{ 'font-weight': 600, 'font-size': '0.84rem', color: '#2a2723', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{displayLabel(n().id, n().label)}</span>
                      <span style={{ 'margin-left': 'auto', 'font-size': '0.68rem', 'font-variant-numeric': 'tabular-nums', color: slow() ? '#b45309' : '#9a857c', 'flex-shrink': 0 }}>{fmtMs(n().cold_ms)}</span>
                    </div>
                    <div style={{ 'font-size': '0.66rem', 'font-family': 'ui-monospace, Menlo, monospace', color: isLLM() ? '#9a8fb5' : '#9aa4ad', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
                      {isLLM() ? `${(n().model ?? '').split('/').pop()} · ${fmtCost(n().cost)}` : 'source · $0'}
                    </div>
                  </div>
                  <Show when={hasKids(id)}>
                    <button onClick={(ev) => { ev.stopPropagation(); setSelected(id); toggleExpand(id); }} title={exp() ? 'collapse inputs' : 'expand inputs'}
                      style={{ 'flex-shrink': 0, width: '18px', height: '18px', 'border-radius': '50%', border: '1px solid #d8c9c0', background: '#fff', color: '#8a7d74', cursor: 'pointer', 'font-size': '0.8rem', 'line-height': 1, display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', padding: 0 }}>{exp() ? '–' : '+'}</button>
                  </Show>
                </div>
              );
            }}</For>
          </div>
        )}</Show>
      </div>

      {/* node detail */}
      <Show when={selected() ? nodeOf(selected()!) : null}>{(n) => (
        <div style={{ border: '1px solid #eee', 'border-radius': '8px', overflow: 'hidden' }}>
          <div style={{ padding: '0.45rem 0.7rem', 'border-bottom': '1px solid #f0f0f0', display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'align-items': 'center' }}>
            <span style={{ 'font-weight': 600, 'font-size': '0.84rem', 'margin-right': '0.2rem' }}>{displayLabel(n().id, n().label)}</span>
            <span style={{ 'font-size': '0.66rem', background: '#f1f1f3', 'border-radius': '4px', padding: '0.05rem 0.4rem', color: '#555', 'font-family': 'ui-monospace, Menlo, monospace' }}>{n().kind === 'source' ? 'source' : (n().model ?? 'llm')}</span>
            <Show when={n().cold_ms != null}><span style={{ 'font-size': '0.66rem', background: '#f1f1f3', 'border-radius': '4px', padding: '0.05rem 0.4rem', color: '#555', 'font-family': 'ui-monospace, Menlo, monospace' }}>gen {fmtMs(n().cold_ms)}</span></Show>
            <Show when={n().kind === 'llm'}><span style={{ 'font-size': '0.66rem', background: '#ecfdf5', 'border-radius': '4px', padding: '0.05rem 0.4rem', color: '#047857', 'font-family': 'ui-monospace, Menlo, monospace' }}>{fmtCost(n().cost)}</span></Show>
            <span style={{ 'font-size': '0.66rem', 'border-radius': '4px', padding: '0.05rem 0.4rem', 'font-family': 'ui-monospace, Menlo, monospace', ...(n().cached ? { background: '#dcfce7', color: '#15803d' } : { background: '#fef3c7', color: '#b45309' }) }}>{n().cached ? 'cached' : 'not cached'}</span>
          </div>
          <div style={{ 'max-height': '38vh', 'overflow-y': 'auto', padding: '0.6rem 0.7rem' }}>
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
        </div>
      )}</Show>
    </div>
  );
}
