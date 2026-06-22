/**
 * @corpus/ui — RunTreeDag.
 *
 * The build-provenance dependency DAG for ONE piece, embeddable anywhere (flow
 * layout, no dock chrome). PRESENTATIONAL: it renders a `RunTree` (the derived
 * @corpus/core/telemetry shape) — the DAG canvas + the selected node's header +
 * its provenance — and leaves the per-node DETAIL BODY (prompt / generated text)
 * to the host via `renderDetail`. Selection + expansion are controlled by the
 * host, so each app owns its data fetching while the graph maths + visuals stay
 * identical across talmud and tanach.
 *
 * Arrows point dependency → consumer. Source nodes carry a database icon
 * (fetched, $0); LLM nodes a sparkle (model + $). Shared nodes appear once with
 * fan-in edges.
 */

import { createMemo, For, type JSX, Show } from 'solid-js';
import {
  ACTIVE_STROKE,
  AuthorityBadge,
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
  ProvenanceSection,
  ROW_H,
  type RunTree,
  StalenessDot,
  TOP_PAD,
  type TreeNode,
  variantOf,
} from './RunTree.tsx';

export interface RunTreeDagProps {
  /** The derived run-tree (from @corpus/core/telemetry buildRunTree). */
  tree: RunTree | null;
  loading?: boolean;
  /** Selected node id (controlled by the host). */
  selected: string | null;
  onSelect: (id: string) => void;
  /** Expanded node ids (controlled by the host). */
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  /** Render the BODY of a non-source node's detail pane (prompt / generation).
   *  The node header + ProvenanceSection are rendered by this component; omit
   *  the slot to show provenance only. */
  renderDetail?: (node: TreeNode) => JSX.Element;
  /** Shown when the tree is null and not loading. */
  emptyLabel?: string;
}

export function RunTreeDag(props: RunTreeDagProps): JSX.Element {
  const layout = createMemo<Layout | null>(() => {
    const t = props.tree;
    return t ? computeLayout(t, props.expanded) : null;
  });
  const nodeOf = (id: string): TreeNode | undefined => props.tree?.nodes[id];
  const hasKids = (id: string): boolean => !!props.tree?.edges.some((e) => e[0] === id);
  const badgeColor = (n: TreeNode) =>
    n.kind !== 'llm' ? BADGE_SRC : n.model?.includes('pro') ? BADGE_PRO : BADGE_LLM;
  const connected = createMemo<Set<string>>(() => {
    const sel = props.selected;
    const lay = layout();
    if (!sel || !lay) return new Set();
    const set = new Set<string>([sel]);
    for (const e of lay.edges) {
      if (e.fromId === sel) set.add(e.toId);
      if (e.toId === sel) set.add(e.fromId);
    }
    return set;
  });
  const isIncident = (e: LaidEdge) => e.fromId === props.selected || e.toId === props.selected;
  const nodeY = (id: string) => {
    const r = layout()!.rowOf.get(id)!;
    return TOP_PAD + r * ROW_H;
  };
  const activate = (id: string) => {
    props.onSelect(id);
    if (hasKids(id)) props.onToggleExpand(id);
  };

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
        <Show when={props.loading}>
          <div style={{ padding: '0.5rem', color: '#aaa' }}>loading…</div>
        </Show>
        <Show when={props.tree === null && !props.loading}>
          <div style={{ padding: '0.5rem', color: '#c00' }}>
            {props.emptyLabel ?? 'no graph (unknown piece, or nothing cached)'}
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
                    const faded = () => !!props.selected && !hot();
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
                  const sel = () => props.selected === id;
                  const exp = () => props.expanded.has(id);
                  const slow = () => (n().cold_ms ?? 0) > 10_000;
                  const dim = () => !!props.selected && !connected().has(id);
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: node card contains a nested expand <button>; a native button cannot contain another button
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => activate(id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          activate(id);
                        }
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
                          <Show when={n().staleness}>
                            {(s) => (
                              <StalenessDot
                                staleness={s()}
                                inputsChanged={n().inputsChanged}
                                isMark={n().producer === 'mark'}
                              />
                            )}
                          </Show>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            'align-items': 'center',
                            gap: '0.3rem',
                            'font-size': '0.66rem',
                            'font-family': 'ui-monospace, Menlo, monospace',
                            color: isLLM() ? '#9a8fb5' : '#9aa4ad',
                            'white-space': 'nowrap',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                          }}
                        >
                          <Show when={n().authority}>
                            {(a) => <AuthorityBadge authority={a()} />}
                          </Show>
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
                            props.onSelect(id);
                            props.onToggleExpand(id);
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
      <Show when={props.selected ? nodeOf(props.selected) : null}>
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
                    {props.renderDetail?.(n())}
                    <ProvenanceSection node={n()} />
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
