/**
 * RunTreeDock — dev-mode bottom dock that shows the BUILD PROVENANCE of a piece
 * on the current daf as a click-to-expand dependency DAG, backed by the
 * read-only GET /api/run-tree endpoint.
 *
 * The DAG starts at a chosen piece (default tidbit.essay — the deepest one) and
 * shows its direct dependencies; click a node's ⊕ to expand ITS inputs, so the
 * graph reveals progressively instead of all-at-once. Shared nodes (e.g. gemara,
 * depended on across the chain) appear once with fan-in edges. Source nodes carry
 * a database icon (fetched, no cost); LLM nodes a sparkle (model + $). Selecting a
 * node loads its prompt + generation on demand via the existing /api/run (cache-
 * respecting) + /api/run-sources — kept lazy so the tree fetch stays small.
 *
 * Styled in the app's flow/voice-map language (parchment canvas, rounded node
 * cards, the brand-red active state). The header rolls up the COLD build cost/
 * time (what a cold daf pays) — each shared node counted once.
 *
 * This is the first increment of the dev-surface consolidation: the network-style
 * activity waterfall + folding the marks/checks/sections panels into tabs here
 * (retiring the side shelf + InstanceInspectorShelf) follow.
 */

import { createSignal, createMemo, createResource, Show, For, type JSX } from 'solid-js';
import { lang } from './i18n';

interface TreeNode {
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
interface RunTree {
  root: string;
  tractate: string;
  page: string;
  lang: string;
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

// Deep whole-daf pieces worth inspecting (the chains with the most depth).
const COMMON_PIECES = [
  'tidbit.essay', 'biyun.essay', 'argument-overview.synthesis',
  'daf-background.concepts', 'daf-background.synthesis',
];

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}
function fmtCost(c: number | null | undefined): string {
  return typeof c === 'number' ? `$${c.toFixed(4)}` : '$0';
}

// app graph tokens (from ArgumentFlowGraph / ArgumentVoiceMap)
const CARD = '#ffffff', CARD_STROKE = '#e4e0d4', ACTIVE_FILL = '#fdf2f2', ACTIVE_STROKE = '#8a2a2b';
const CANVAS = '#fdfcf9', CANVAS_BORDER = '#ece9df';
const BADGE_LLM = '#1d4ed8', BADGE_PRO = '#7c3aed', BADGE_SRC = '#475569';

const NODE_W = 156, NODE_H = 48, COL_W = 196, ROW_H = 62, PAD_X = 18, PAD_Y = 16;

interface Placed { id: string; x: number; y: number; }
interface Layout { placed: Placed[]; edges: Array<{ a: Placed; b: Placed }>; w: number; h: number; }

/** Layered left→right layout over the VISIBLE subgraph (root + children of
 *  expanded nodes). depth = longest path from root, so sources sink right. */
function layoutDag(tree: RunTree, expanded: Set<string>): Layout {
  const childrenOf = (id: string) => tree.edges.filter((e) => e[0] === id).map((e) => e[1]);
  const root = tree.root;
  const vis = new Set<string>([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...vis]) {
      if (expanded.has(id)) for (const c of childrenOf(id)) if (!vis.has(c)) { vis.add(c); changed = true; }
    }
  }
  const visEdges = tree.edges.filter(([a, b]) => vis.has(a) && vis.has(b) && expanded.has(a));
  const depth: Record<string, number> = { [root]: 0 };
  for (let k = 0; k < vis.size + 2; k++) {
    for (const [a, b] of visEdges) if (depth[a] != null) depth[b] = Math.max(depth[b] ?? 0, depth[a] + 1);
  }
  const cols: Record<number, string[]> = {};
  let maxD = 0;
  for (const id of vis) { const d = depth[id] ?? 0; (cols[d] ??= []).push(id); maxD = Math.max(maxD, d); }
  const pos = new Map<string, Placed>();
  for (let d = 0; d <= maxD; d++) (cols[d] ?? []).forEach((id, i) => pos.set(id, { id, x: PAD_X + d * COL_W, y: PAD_Y + i * ROW_H }));
  const rowsMax = Math.max(1, ...Object.values(cols).map((c) => c.length));
  return {
    placed: [...pos.values()],
    edges: visEdges.map(([a, b]) => ({ a: pos.get(a)!, b: pos.get(b)! })).filter((e) => e.a && e.b),
    w: PAD_X * 2 + maxD * COL_W + NODE_W,
    h: Math.max(160, PAD_Y * 2 + rowsMax * ROW_H),
  };
}

function edgePath(a: Placed, b: Placed): string {
  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}

/** source = database cylinder, generation = sparkle; both in the badge color. */
function NodeIcon(props: { kind: TreeNode['kind']; color: string }): JSX.Element {
  return (
    <Show
      when={props.kind === 'source'}
      fallback={<path d="M0 -6.6 L1.7 -1.7 L6.6 0 L1.7 1.7 L0 6.6 L-1.7 1.7 L-6.6 0 L-1.7 -1.7 Z" fill={props.color} />}
    >
      <>
        <ellipse cx={0} cy={-3.6} rx={5.6} ry={2.2} fill="none" stroke={props.color} stroke-width={1.4} />
        <path d="M -5.6 -3.6 V 3.6 A 5.6 2.2 0 0 0 5.6 3.6 V -3.6" fill="none" stroke={props.color} stroke-width={1.4} />
        <path d="M -5.6 0 A 5.6 2.2 0 0 0 5.6 0" fill="none" stroke={props.color} stroke-width={1.2} />
      </>
    </Show>
  );
}

export default function RunTreeDock(props: { tractate: string; page: string; open: boolean; onClose: () => void }): JSX.Element {
  const [pieceId, setPieceId] = createSignal('tidbit.essay');
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set(['tidbit.essay']));
  const [selected, setSelected] = createSignal<string | null>('tidbit.essay');
  const [height, setHeight] = createSignal(Math.round(window.innerHeight * 0.5));

  const [tree] = createResource(
    () => (props.open ? `${props.tractate}|${props.page}|${pieceId()}|${lang()}` : null),
    async (): Promise<RunTree | null> => {
      const r = await fetch(`/api/run-tree/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}/${encodeURIComponent(pieceId())}?lang=${lang()}`);
      if (!r.ok) return null;
      return (await r.json()) as RunTree;
    },
  );

  // Reset the expansion + selection to the new root whenever the piece changes.
  const pickPiece = (id: string) => { setPieceId(id); setExpanded(new Set([id])); setSelected(id); };

  const layout = createMemo<Layout | null>(() => { const t = tree(); return t ? layoutDag(t, expanded()) : null; });

  const nodeOf = (id: string): TreeNode | undefined => tree()?.nodes[id];
  const hasKids = (id: string): boolean => !!tree()?.edges.some((e) => e[0] === id);
  const toggleExpand = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Node detail — lazy: load the selected producer's cached run (prompt +
  // generation) on demand. Sources have no run.
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
    const move = (e: MouseEvent) => setHeight(Math.max(240, Math.min(window.innerHeight - 60, window.innerHeight - e.clientY)));
    const up = () => { document.body.style.userSelect = ''; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };

  const badgeColor = (n: TreeNode) => n.kind !== 'llm' ? BADGE_SRC : (n.model?.includes('pro') ? BADGE_PRO : BADGE_LLM);

  return (
    <Show when={props.open}>
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, height: `${height()}px`,
        background: '#fff', 'border-top': '2px solid #111', 'box-shadow': '0 -6px 24px rgba(0,0,0,0.13)',
        'z-index': 1000, display: 'flex', 'flex-direction': 'column',
        'font-family': 'system-ui, sans-serif', 'font-size': '13px',
      }}>
        {/* resize handle */}
        <div onMouseDown={onResizeStart} title="drag to resize"
          style={{ position: 'absolute', top: '-4px', left: 0, right: 0, height: '9px', cursor: 'ns-resize', 'z-index': 1002 }} />

        {/* header */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '0.6rem', padding: '0.4rem 0.8rem', 'border-bottom': '1px solid #eee', background: '#fafafa', 'flex-shrink': 0 }}>
          <span style={{ 'font-size': '0.72rem', 'letter-spacing': '0.06em', 'text-transform': 'uppercase', color: '#555', 'font-weight': 600 }}>Build</span>
          <select value={pieceId()} onChange={(e) => pickPiece(e.currentTarget.value)} style={{ 'font-size': '0.78rem', padding: '2px 6px', 'font-family': 'inherit' }}>
            <For each={COMMON_PIECES}>{(p) => <option value={p}>{p}</option>}</For>
          </select>
          <Show when={tree()}>{(t) => (
            <span style={{ 'margin-left': '0.3rem', display: 'flex', gap: '0.9rem', 'font-size': '0.74rem', 'font-variant-numeric': 'tabular-nums' }}>
              <span style={{ color: '#b45309' }}>cold {fmtMs(t().totals.cold_ms)}</span>
              <span style={{ color: '#047857' }}>{fmtCost(t().totals.cost)}</span>
              <span style={{ color: '#888' }}>{t().totals.llm} LLM · {t().totals.source} source · {t().totals.cached}/{t().totals.count} cached</span>
            </span>
          )}</Show>
          <button onClick={props.onClose} style={{ 'margin-left': 'auto', padding: '2px 10px', cursor: 'pointer', background: '#fff', border: '1px solid #ccc', 'border-radius': '4px', 'font-size': '0.74rem', color: '#555' }}>close</button>
        </div>

        {/* body: DAG (left) + node detail (right) */}
        <div style={{ flex: 1, 'min-height': 0, display: 'flex' }}>
          <div style={{ flex: 1.6, 'min-width': 0, overflow: 'auto', background: '#fafaf7', 'border-right': '1px solid #eee' }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem', padding: '0.4rem 0.7rem', 'font-size': '0.7rem', color: '#999', 'border-bottom': '1px solid #efece3', background: '#fff', position: 'sticky', top: 0 }}>
              <b style={{ color: '#444', 'font-size': '0.78rem' }}>{pieceId()}</b><span>dependency graph</span>
              <span style={{ 'margin-left': 'auto', 'font-size': '0.66rem', color: '#bbb' }}>click a node to open it · ⊕ to expand its inputs</span>
            </div>
            <Show when={tree.loading}><div style={{ padding: '1rem', color: '#aaa' }}>loading…</div></Show>
            <Show when={tree() === null && !tree.loading}><div style={{ padding: '1rem', color: '#c00' }}>no graph (unknown piece, or run-tree unavailable)</div></Show>
            <Show when={layout()}>{(lay) => (
              <div style={{ padding: '0.5rem' }}>
                <svg width={lay().w} height={lay().h} viewBox={`0 0 ${lay().w} ${lay().h}`} style={{ display: 'block', border: `1px solid ${CANVAS_BORDER}`, 'border-radius': '8px', background: CANVAS }}>
                  <defs>
                    <marker id="rt-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#c9b8b0" /></marker>
                    <filter id="rt-shadow" x="-20%" y="-30%" width="140%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1.3" flood-color="#3a3320" flood-opacity="0.12" /></filter>
                  </defs>
                  <For each={lay().edges}>{(e) => <path d={edgePath(e.a, e.b)} fill="none" stroke="#d8c9c0" stroke-width={1.4} marker-end="url(#rt-arrow)" />}</For>
                  <For each={lay().placed}>{(p) => {
                    const n = () => nodeOf(p.id)!;
                    const isLLM = () => n().kind === 'llm';
                    const sel = () => selected() === p.id;
                    const exp = () => expanded().has(p.id);
                    return (
                      <g style={{ cursor: 'pointer' }} onClick={() => { setSelected(p.id); if (hasKids(p.id)) toggleExpand(p.id); }}>
                        <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={9} fill={sel() ? ACTIVE_FILL : CARD} stroke={sel() ? ACTIVE_STROKE : CARD_STROKE} stroke-width={sel() ? 1.8 : 1} filter="url(#rt-shadow)" />
                        <g transform={`translate(${p.x + 17},${p.y + 16})`}><NodeIcon kind={n().kind} color={badgeColor(n())} /></g>
                        <text x={p.x + 32} y={p.y + 17} font-size="11.5" font-weight="600" font-family="system-ui" fill="#2a2723">{n().label.length > 16 ? n().label.slice(0, 15) + '…' : n().label}</text>
                        <text x={p.x + 32} y={p.y + 33} font-size="9.5" font-family="ui-monospace, Menlo, monospace" fill={isLLM() ? '#9a8fb5' : '#9aa4ad'}>
                          {isLLM() ? `${(n().model ?? '').split('/').pop()} · ${fmtCost(n().cost)}` : 'source · $0'}
                        </text>
                        <text x={p.x + NODE_W - 8} y={p.y + 15} text-anchor="end" font-size="9.5" font-family="ui-monospace, Menlo, monospace" fill={(n().cold_ms ?? 0) > 10000 ? '#b45309' : '#9a857c'}>{fmtMs(n().cold_ms)}</text>
                        <Show when={hasKids(p.id)}>
                          <g onClick={(ev) => { ev.stopPropagation(); setSelected(p.id); toggleExpand(p.id); }}>
                            <circle cx={p.x + NODE_W} cy={p.y + NODE_H / 2} r={8} fill="#fff" stroke="#d8c9c0" stroke-width={1} />
                            <text x={p.x + NODE_W} y={p.y + NODE_H / 2 + 1} text-anchor="middle" dominant-baseline="central" font-size="12" font-family="system-ui" fill="#8a7d74">{exp() ? '–' : '+'}</text>
                          </g>
                        </Show>
                      </g>
                    );
                  }}</For>
                </svg>
              </div>
            )}</Show>
          </div>

          {/* node detail */}
          <div style={{ flex: 1, 'min-width': '300px', display: 'flex', 'flex-direction': 'column', overflow: 'hidden' }}>
            <Show when={selected() ? nodeOf(selected()!) : null} fallback={<div style={{ padding: '1rem', color: '#bbb' }}>select a node</div>}>{(n) => (
              <>
                <div style={{ padding: '0.5rem 0.7rem', 'border-bottom': '1px solid #eee', display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'align-items': 'center' }}>
                  <span style={{ 'font-weight': 600, 'font-size': '0.84rem', 'margin-right': '0.3rem' }}>{n().label}</span>
                  <span style={{ 'font-size': '0.68rem', background: '#f1f1f3', 'border-radius': '4px', padding: '0.05rem 0.4rem', color: '#555', 'font-family': 'ui-monospace, Menlo, monospace' }}>{n().kind === 'source' ? 'source' : (n().model ?? 'llm')}</span>
                  <Show when={n().cold_ms != null}><span style={{ 'font-size': '0.68rem', background: '#f1f1f3', 'border-radius': '4px', padding: '0.05rem 0.4rem', color: '#555', 'font-family': 'ui-monospace, Menlo, monospace' }}>gen {fmtMs(n().cold_ms)}</span></Show>
                  <Show when={n().kind === 'llm'}><span style={{ 'font-size': '0.68rem', background: '#ecfdf5', 'border-radius': '4px', padding: '0.05rem 0.4rem', color: '#047857', 'font-family': 'ui-monospace, Menlo, monospace' }}>{fmtCost(n().cost)}</span></Show>
                  <span style={{ 'font-size': '0.68rem', 'border-radius': '4px', padding: '0.05rem 0.4rem', 'font-family': 'ui-monospace, Menlo, monospace', ...(n().cached ? { background: '#dcfce7', color: '#15803d' } : { background: '#fef3c7', color: '#b45309' }) }}>{n().cached ? 'cached' : 'not cached'}</span>
                </div>
                <div style={{ flex: 1, 'overflow-y': 'auto', padding: '0.6rem 0.7rem' }}>
                  <Show when={n().kind === 'source'} fallback={
                    <>
                      <Show when={detail.loading}><div style={{ color: '#aaa', 'font-size': '0.78rem' }}>loading run…</div></Show>
                      <Show when={detail()}>{(r) => (
                        <>
                          <div style={{ 'line-height': 1.55, 'font-size': '0.84rem', color: '#222', 'white-space': 'pre-wrap' }}>{(r().content ?? '').slice(0, 1400)}</div>
                          <Show when={r().resolved}>{(res) => (
                            <details style={{ 'margin-top': '0.7rem' }}>
                              <summary style={{ cursor: 'pointer', 'font-size': '0.74rem', color: '#666' }}>prompt (system + user)</summary>
                              <div style={{ 'font-size': '0.64rem', color: '#999', 'margin-top': '0.3rem' }}>system</div>
                              <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '11px', margin: 0, background: '#f8f8f8', padding: '0.5rem', 'border-radius': '3px', 'max-height': '18vh', overflow: 'auto' }}>{res().system_prompt}</pre>
                              <div style={{ 'font-size': '0.64rem', color: '#999', margin: '0.3rem 0 0' }}>user</div>
                              <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '11px', margin: 0, background: '#f8f8f8', padding: '0.5rem', 'border-radius': '3px', 'max-height': '18vh', overflow: 'auto' }}>{res().user_prompt}</pre>
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
        </div>
      </div>
    </Show>
  );
}
