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
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  type JSX,
  Show,
} from 'solid-js';
import { lang } from './i18n';
import {
  ACTIVE_STROKE,
  BADGE_LLM,
  BADGE_PRO,
  BADGE_SRC,
  CANVAS,
  CANVAS_BORDER,
  CARD_STROKE,
  computeLayout,
  displayLabel,
  edgePath,
  fmtCost,
  fmtMs,
  type LaidEdge,
  type Layout,
  LEFT_PAD,
  NODE_H,
  NODE_W,
  NodeIcon,
  ROW_H,
  type RunResult,
  type RunTree,
  TOP_PAD,
  type TreeNode,
  variantOf,
} from './runTreeShared';

export function RunTreeDag(props: {
  tractate: string;
  page: string;
  pieceId: string;
  instance?: unknown;
}): JSX.Element {
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set([props.pieceId]));
  const [selected, setSelected] = createSignal<string | null>(props.pieceId);
  createEffect(() => {
    const p = props.pieceId;
    setExpanded(new Set([p]));
    setSelected(p);
  });

  const instanceQS = (): string => {
    const inst = props.instance;
    if (!inst || (typeof inst === 'object' && Object.keys(inst as object).length === 0)) return '';
    return `&instance=${encodeURIComponent(JSON.stringify(inst))}`;
  };
  const [tree] = createResource(
    () => `${props.tractate}|${props.page}|${props.pieceId}|${lang()}|${instanceQS()}`,
    async (): Promise<RunTree | null> => {
      const r = await fetch(
        `/api/run-tree/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}/${encodeURIComponent(props.pieceId)}?lang=${lang()}${instanceQS()}`,
      );
      if (!r.ok) return null;
      return (await r.json()) as RunTree;
    },
  );
  const layout = createMemo<Layout | null>(() => {
    const t = tree();
    return t ? computeLayout(t, expanded()) : null;
  });
  const nodeOf = (id: string): TreeNode | undefined => tree()?.nodes[id];
  const hasKids = (id: string): boolean => !!tree()?.edges.some((e) => e[0] === id);
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const badgeColor = (n: TreeNode) =>
    n.kind !== 'llm' ? BADGE_SRC : n.model?.includes('pro') ? BADGE_PRO : BADGE_LLM;
  const connected = createMemo<Set<string>>(() => {
    const sel = selected();
    const lay = layout();
    if (!sel || !lay) return new Set();
    const set = new Set<string>([sel]);
    for (const e of lay.edges) {
      if (e.fromId === sel) set.add(e.toId);
      if (e.toId === sel) set.add(e.fromId);
    }
    return set;
  });
  const isIncident = (e: LaidEdge) => e.fromId === selected() || e.toId === selected();
  const nodeY = (id: string) => {
    const r = layout()!.rowOf.get(id)!;
    return TOP_PAD + r * ROW_H;
  };

  const [detail] = createResource(
    () => {
      const id = selected();
      const n = id ? nodeOf(id) : null;
      return n && n.kind !== 'source' && n.producer
        ? { id, producer: n.producer, root: id === props.pieceId }
        : null;
    },
    async (sel): Promise<RunResult | null> => {
      const markInput = sel.root ? (props.instance ?? { fields: {} }) : { fields: {} };
      const body =
        sel.producer === 'mark'
          ? { mark_id: sel.id, tractate: props.tractate, page: props.page, lang: lang() }
          : {
              enrichment_id: sel.id,
              tractate: props.tractate,
              page: props.page,
              mark_input: markInput,
              lang: lang(),
            };
      const r = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { status?: string; result?: RunResult } | RunResult;
      if (j && typeof j === 'object' && 'status' in j)
        return j.status === 'ok' ? (j.result ?? null) : null;
      return j as RunResult;
    },
  );

  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        gap: '0.5rem',
        'font-family': 'system-ui, sans-serif',
        'font-size': '13px',
      }}
    >
      {/* DAG */}
      <div
        style={{
          'max-height': '52vh',
          overflow: 'auto',
          background: CANVAS,
          padding: '0.5rem',
          border: `1px solid ${CANVAS_BORDER}`,
          'border-radius': '8px',
        }}
      >
        <Show when={tree.loading}>
          <div style={{ padding: '0.5rem', color: '#aaa' }}>loading…</div>
        </Show>
        <Show when={tree() === null && !tree.loading}>
          <div style={{ padding: '0.5rem', color: '#c00' }}>
            no graph (unknown piece, or nothing cached)
          </div>
        </Show>
        <Show when={layout()}>
          {(lay) => (
            <div
              style={{
                position: 'relative',
                width: `${lay().width}px`,
                height: `${lay().height}px`,
              }}
            >
              <svg
                aria-hidden="true"
                width={lay().width}
                height={lay().height}
                style={{
                  position: 'absolute',
                  inset: 0,
                  'pointer-events': 'none',
                  overflow: 'visible',
                }}
              >
                <defs>
                  <marker
                    id="rtd-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0 0 L6 3 L0 6 z" fill="#c9b8b0" />
                  </marker>
                  <marker
                    id="rtd-arrow-hot"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0 0 L6 3 L0 6 z" fill="#8a2a2b" />
                  </marker>
                </defs>
                <For each={lay().edges}>
                  {(e) => {
                    const hot = () => isIncident(e);
                    const faded = () => !!selected() && !hot();
                    return (
                      <path
                        d={edgePath(e.toRow, e.fromRow, e.lane)}
                        fill="none"
                        stroke={hot() ? '#8a2a2b' : '#d3c4ba'}
                        stroke-width={hot() ? 2 : 1.5}
                        stroke-opacity={faded() ? 0.22 : hot() ? 0.85 : 1}
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        marker-end={`url(#${hot() ? 'rtd-arrow-hot' : 'rtd-arrow'})`}
                      />
                    );
                  }}
                </For>
              </svg>
              <For each={lay().order}>
                {(id) => {
                  const n = () => nodeOf(id)!;
                  const isLLM = () => n().kind === 'llm';
                  const sel = () => selected() === id;
                  const exp = () => expanded().has(id);
                  const slow = () => (n().cold_ms ?? 0) > 10_000;
                  const dim = () => !!selected() && !connected().has(id);
                  return (
                    <div
                      onClick={() => {
                        setSelected(id);
                        if (hasKids(id)) toggleExpand(id);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${LEFT_PAD}px`,
                        top: `${nodeY(id)}px`,
                        width: `${NODE_W}px`,
                        height: `${NODE_H}px`,
                        display: 'flex',
                        'align-items': 'center',
                        gap: '0.5rem',
                        padding: '0 0.6rem',
                        cursor: 'pointer',
                        'box-sizing': 'border-box',
                        background: sel() ? '#fdf2f2' : '#fff',
                        border: `${sel() ? 1.75 : 1}px solid ${sel() ? ACTIVE_STROKE : CARD_STROKE}`,
                        'border-radius': '11px',
                        'box-shadow': '0 1px 2px rgba(58,51,32,0.08)',
                        opacity: dim() ? 0.42 : 1,
                        transition: 'opacity 0.12s',
                      }}
                    >
                      <NodeIcon variant={variantOf(n())} color={badgeColor(n())} />
                      <div style={{ flex: 1, 'min-width': 0 }}>
                        <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem' }}>
                          <span
                            style={{
                              'font-weight': 600,
                              'font-size': '0.84rem',
                              color: '#2a2723',
                              'white-space': 'nowrap',
                              overflow: 'hidden',
                              'text-overflow': 'ellipsis',
                            }}
                          >
                            {displayLabel(n().id, n().label)}
                          </span>
                          <span
                            style={{
                              'margin-left': 'auto',
                              'font-size': '0.68rem',
                              'font-variant-numeric': 'tabular-nums',
                              color: slow() ? '#b45309' : '#9a857c',
                              'flex-shrink': 0,
                            }}
                          >
                            {fmtMs(n().cold_ms)}
                          </span>
                        </div>
                        <div
                          style={{
                            'font-size': '0.66rem',
                            'font-family': 'ui-monospace, Menlo, monospace',
                            color: isLLM() ? '#9a8fb5' : '#9aa4ad',
                            'white-space': 'nowrap',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                          }}
                        >
                          {isLLM()
                            ? `${(n().model ?? '').split('/').pop()} · ${fmtCost(n().cost)}`
                            : 'source · $0'}
                        </div>
                      </div>
                      <Show when={hasKids(id)}>
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelected(id);
                            toggleExpand(id);
                          }}
                          title={exp() ? 'collapse inputs' : 'expand inputs'}
                          style={{
                            'flex-shrink': 0,
                            width: '18px',
                            height: '18px',
                            'border-radius': '50%',
                            border: '1px solid #d8c9c0',
                            background: '#fff',
                            color: '#8a7d74',
                            cursor: 'pointer',
                            'font-size': '0.8rem',
                            'line-height': 1,
                            display: 'inline-flex',
                            'align-items': 'center',
                            'justify-content': 'center',
                            padding: 0,
                          }}
                        >
                          {exp() ? '–' : '+'}
                        </button>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          )}
        </Show>
      </div>

      {/* node detail */}
      <Show when={selected() ? nodeOf(selected()!) : null}>
        {(n) => (
          <div style={{ border: '1px solid #eee', 'border-radius': '8px', overflow: 'hidden' }}>
            <div
              style={{
                padding: '0.45rem 0.7rem',
                'border-bottom': '1px solid #f0f0f0',
                display: 'flex',
                'flex-wrap': 'wrap',
                gap: '0.35rem',
                'align-items': 'center',
              }}
            >
              <span
                style={{ 'font-weight': 600, 'font-size': '0.84rem', 'margin-right': '0.2rem' }}
              >
                {displayLabel(n().id, n().label)}
              </span>
              <span
                style={{
                  'font-size': '0.66rem',
                  background: '#f1f1f3',
                  'border-radius': '4px',
                  padding: '0.05rem 0.4rem',
                  color: '#555',
                  'font-family': 'ui-monospace, Menlo, monospace',
                }}
              >
                {n().kind === 'source' ? 'source' : (n().model ?? 'llm')}
              </span>
              <Show when={n().cold_ms != null}>
                <span
                  style={{
                    'font-size': '0.66rem',
                    background: '#f1f1f3',
                    'border-radius': '4px',
                    padding: '0.05rem 0.4rem',
                    color: '#555',
                    'font-family': 'ui-monospace, Menlo, monospace',
                  }}
                >
                  gen {fmtMs(n().cold_ms)}
                </span>
              </Show>
              <Show when={n().kind === 'llm'}>
                <span
                  style={{
                    'font-size': '0.66rem',
                    background: '#ecfdf5',
                    'border-radius': '4px',
                    padding: '0.05rem 0.4rem',
                    color: '#047857',
                    'font-family': 'ui-monospace, Menlo, monospace',
                  }}
                >
                  {fmtCost(n().cost)}
                </span>
              </Show>
              <span
                style={{
                  'font-size': '0.66rem',
                  'border-radius': '4px',
                  padding: '0.05rem 0.4rem',
                  'font-family': 'ui-monospace, Menlo, monospace',
                  ...(n().cached
                    ? { background: '#dcfce7', color: '#15803d' }
                    : { background: '#fef3c7', color: '#b45309' }),
                }}
              >
                {n().cached ? 'cached' : 'not cached'}
              </span>
            </div>
            <div style={{ 'max-height': '38vh', 'overflow-y': 'auto', padding: '0.6rem 0.7rem' }}>
              <Show
                when={n().kind === 'source'}
                fallback={
                  <>
                    <Show when={detail.loading}>
                      <div style={{ color: '#aaa', 'font-size': '0.78rem' }}>loading run…</div>
                    </Show>
                    <Show when={detail()}>
                      {(r) => (
                        <>
                          <div
                            style={{
                              'line-height': 1.5,
                              'font-size': '0.82rem',
                              color: '#222',
                              'white-space': 'pre-wrap',
                            }}
                          >
                            {(r().content ?? '').slice(0, 1600)}
                          </div>
                          <Show when={r().resolved}>
                            {(res) => (
                              <details style={{ 'margin-top': '0.7rem' }}>
                                <summary
                                  style={{
                                    cursor: 'pointer',
                                    'font-size': '0.74rem',
                                    color: '#666',
                                  }}
                                >
                                  prompt (system + user)
                                </summary>
                                <div
                                  style={{
                                    'font-size': '0.64rem',
                                    color: '#999',
                                    'margin-top': '0.3rem',
                                  }}
                                >
                                  system
                                </div>
                                <pre
                                  style={{
                                    'white-space': 'pre-wrap',
                                    'font-family': 'ui-monospace, Menlo, monospace',
                                    'font-size': '11px',
                                    margin: 0,
                                    background: '#f8f8f8',
                                    padding: '0.5rem',
                                    'border-radius': '3px',
                                    'max-height': '24vh',
                                    overflow: 'auto',
                                  }}
                                >
                                  {res().system_prompt}
                                </pre>
                                <div
                                  style={{
                                    'font-size': '0.64rem',
                                    color: '#999',
                                    margin: '0.3rem 0 0',
                                  }}
                                >
                                  user
                                </div>
                                <pre
                                  style={{
                                    'white-space': 'pre-wrap',
                                    'font-family': 'ui-monospace, Menlo, monospace',
                                    'font-size': '11px',
                                    margin: 0,
                                    background: '#f8f8f8',
                                    padding: '0.5rem',
                                    'border-radius': '3px',
                                    'max-height': '24vh',
                                    overflow: 'auto',
                                  }}
                                >
                                  {res().user_prompt}
                                </pre>
                              </details>
                            )}
                          </Show>
                        </>
                      )}
                    </Show>
                    <Show when={!detail.loading && !detail()}>
                      <div style={{ color: '#bbb', 'font-size': '0.78rem' }}>
                        nothing cached for this node on this daf yet.
                      </div>
                    </Show>
                  </>
                }
              >
                <div style={{ 'font-size': '0.82rem', color: '#555' }}>
                  A <b>source</b> input — fetched/assembled, no model call (cost $0). The piece's
                  prompt reads its text.
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
