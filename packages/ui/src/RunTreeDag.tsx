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

import { type JSX, Show } from 'solid-js';
import {
  CANVAS,
  CANVAS_BORDER,
  displayLabel,
  fmtCost,
  fmtMs,
  ProvenanceSection,
  type RunTree,
  type TreeNode,
} from './RunTree.tsx';
import { RunTreeCanvas } from './RunTreeCanvas.tsx';

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
  // The DAG canvas (edges + node cards + selection) is the shared RunTreeCanvas;
  // this component adds only the surrounding scroll box + the node-detail pane.
  const nodeOf = (id: string): TreeNode | undefined => props.tree?.nodes[id];

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
      {/* DAG canvas — the shared @corpus/ui/RunTreeCanvas */}
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
        <RunTreeCanvas
          tree={props.tree}
          loading={props.loading}
          selected={props.selected}
          onSelect={props.onSelect}
          expanded={props.expanded}
          onToggleExpand={props.onToggleExpand}
          emptyLabel={props.emptyLabel}
        />
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
