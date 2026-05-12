/**
 * Live panel showing what the daf rendering pipeline has just done.
 * Reads the `pipelineStages` store — one row per stage in dataflow order
 * (fetch → align → layout). Mounted in DevModeShelf below the AI
 * activity panel. Self-hides until at least one stage has been recorded.
 *
 * The per-mark renderer rows that used to live here were retired — they
 * were either redundant with the AI activity panel (e.g. rabbi applied
 * 4×) or noise from the legacy gutter+sidebar bridge marks that the
 * dispatcher intentionally no-ops for.
 */

import { createMemo, For, Show, type JSX } from 'solid-js';
import { pipelineStages, type PipelineStageEntry } from './rendererActivity';

export default function PipelinePanel(): JSX.Element {
  /** Pipeline stages — show in a fixed order (fetch → align → layout)
   *  rather than sort-by-time, so the user reads them as the dataflow. */
  const stageOrder = ['daf-fetch', 'sefaria-align', 'layout-spacers'];
  const stages = createMemo<PipelineStageEntry[]>(() => {
    const all = pipelineStages();
    const ordered: PipelineStageEntry[] = [];
    for (const id of stageOrder) {
      const e = all[id];
      if (e) ordered.push(e);
    }
    // Any unknown stage ids (future additions) — append in record order.
    for (const id of Object.keys(all)) {
      if (!stageOrder.includes(id)) ordered.push(all[id]);
    }
    return ordered;
  });

  return (
    <Show when={stages().length > 0}>
      <div style={{
        border: '1px solid #eee',
        'border-radius': '4px',
        background: '#fff',
        padding: '0.4rem 0.55rem',
        'font-size': '0.78rem',
        'line-height': 1.45,
      }}>
        <div style={{
          'font-size': '0.65rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.06em',
          color: '#888',
          'margin-bottom': '0.3rem',
        }}>Pipeline</div>
        <For each={stages()}>{(stage) => (
          <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem', padding: '0.15rem 0', color: '#444' }}>
            <span style={{ color: stage.cache === 'hit' ? '#15803d' : '#0f766e', 'flex-shrink': 0 }}>·</span>
            <span style={{ 'font-weight': 500, 'flex-shrink': 0 }}>{stage.label}</span>
            <Show when={stage.cache}>
              <span style={{
                'font-size': '0.62rem', 'flex-shrink': 0,
                color: stage.cache === 'hit' ? '#15803d' : '#a16207',
                background: stage.cache === 'hit' ? '#dcfce7' : '#fef3c7',
                padding: '0 0.3rem', 'border-radius': '3px',
              }}>{stage.cache}</span>
            </Show>
            <span style={{ flex: 1, 'min-width': 0, color: '#888', 'font-size': '0.72rem', 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' }}>{stage.detail ?? ''}</span>
            <span style={{ color: '#888', 'font-variant-numeric': 'tabular-nums', 'flex-shrink': 0 }}>{stage.ms}ms</span>
          </div>
        )}</For>
      </div>
    </Show>
  );
}
