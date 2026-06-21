/**
 * @corpus/ui — InspectorRow.
 *
 * One per-piece row for a reader's "inspect" panel: a cached/missed dot, the
 * piece label (+ an optional instance/anchor), and meta (cold-build time +
 * cost, or "miss"). Shared by every corpus app's inspect surface so the rows
 * read identically. The app owns the panel shell, the data fetch, and the
 * totals header; this is just the row.
 *
 * Styling: `.inspect-*` in inspector.css (shared tokens). Re-exports the shared
 * fmtMs/fmtCost for the app's own totals line.
 */

import { type JSX, Show } from 'solid-js';
import { fmtCost, fmtMs } from './format.ts';

export { fmtCost, fmtMs };

export interface InspectorRowProps {
  /** Cache hit — fills the dot green; a miss shows "miss" in place of meta. */
  cached: boolean;
  label: string;
  /** Anchor/instance suffix (verse, range, place, …). */
  instance?: string | null;
  /** Cold-build time (ms); shown only when cached. */
  coldMs?: number | null;
  /** Generation cost (USD); shown only when cached. */
  cost?: number | null;
}

export function InspectorRow(props: InspectorRowProps): JSX.Element {
  return (
    <div class="inspect-row">
      <span
        class="inspect-dot"
        classList={{ hit: props.cached }}
        title={props.cached ? 'cached' : 'not cached'}
      />
      <span class="inspect-label">
        {props.label}
        <Show when={props.instance}>{(inst) => <span class="inspect-inst"> · {inst()}</span>}</Show>
      </span>
      <span class="inspect-meta">
        <Show when={props.cached} fallback={<span class="inspect-miss">miss</span>}>
          <Show when={props.coldMs != null}>
            <span class="inspect-ms">{fmtMs(props.coldMs)}</span>
          </Show>
          <Show when={props.cost != null}>
            <span class="inspect-cost">{fmtCost(props.cost)}</span>
          </Show>
        </Show>
      </span>
    </div>
  );
}
