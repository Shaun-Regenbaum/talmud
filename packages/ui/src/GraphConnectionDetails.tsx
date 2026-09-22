import { type JSX, Show } from 'solid-js';
import type { GraphConnection, GraphNode } from './graph/model';
import './graph.css';

export interface GraphConnectionDetailsProps {
  edge: GraphConnection;
  from: GraphNode;
  to: GraphNode;
  clearLabel: string;
  onClear: () => void;
  /** Locate an endpoint without activating the host's navigation or disclosure. */
  onLocate?: (node: GraphNode) => void;
  direction?: 'ltr' | 'rtl';
}

/** Read the supplied relationship as source → relation → target in either map layout. */
export function GraphConnectionDetails(props: GraphConnectionDetailsProps): JSX.Element {
  const endpoint = (node: GraphNode) => (
    <Show
      when={props.onLocate}
      fallback={<bdi class="ui-graph-connection-endpoint">{node.label}</bdi>}
    >
      <button
        type="button"
        class="ui-graph-connection-endpoint"
        onClick={() => props.onLocate?.(node)}
      >
        <Show when={node.reference}>
          <bdi class="ui-graph-connection-reference">{node.reference}</bdi>{' '}
        </Show>
        <bdi>{node.label}</bdi>
      </button>
    </Show>
  );
  return (
    <div
      class="ui-graph-connection-detail"
      dir={props.direction}
      style={{ '--connection-color': props.edge.color }}
    >
      <div class="ui-graph-connection-content" aria-live="polite" aria-atomic="true">
        <div class="ui-graph-connection-sentence">
          {endpoint(props.from)}
          <span class="ui-graph-connection-kind">{props.edge.kindLabel || props.edge.label}</span>
          {endpoint(props.to)}
        </div>
        <Show when={props.edge.kindLabel && props.edge.label !== props.edge.kindLabel}>
          <p class="ui-graph-connection-note" dir="auto">
            {props.edge.label}
          </p>
        </Show>
        <Show when={props.edge.provenance}>
          <p class="ui-graph-connection-note" dir="auto">
            {props.edge.provenance}
          </p>
        </Show>
      </div>
      <button
        type="button"
        class="ui-graph-clear-connection"
        aria-label={props.clearLabel}
        onClick={props.onClear}
      >
        ×
      </button>
    </div>
  );
}
