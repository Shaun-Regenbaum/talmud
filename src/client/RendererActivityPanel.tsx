/**
 * Live panel showing what mark renderers have done to the daf HTML. Reads
 * the `rendererActivity` store. One row per enabled mark with its most
 * recent apply outcome.
 *
 * Mounted in DevModeShelf under the AI activity panel. Self-hides when
 * empty (i.e. no marks have applied yet).
 */

import { createMemo, For, Show, type JSX } from 'solid-js';
import { rendererActivity, type RendererEntry } from './rendererActivity';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}b`;
  return `${(n / 1024).toFixed(1)}kb`;
}

function delta(before: number, after: number): string {
  const d = after - before;
  if (d === 0) return 'no change';
  const sign = d > 0 ? '+' : '';
  return `${fmtBytes(before)} → ${fmtBytes(after)} (${sign}${fmtBytes(Math.abs(d))})`;
}

export default function RendererActivityPanel(): JSX.Element {
  const rows = createMemo<RendererEntry[]>(() => {
    const all = Object.values(rendererActivity());
    return all.sort((a, b) => b.state.at - a.state.at);
  });

  return (
    <Show when={rows().length > 0}>
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
        }}>Renderer activity</div>
        <For each={rows()}>{(entry) => {
          const s = entry.state;
          if (s.kind === 'applied') {
            return (
              <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem', padding: '0.15rem 0', color: '#444' }}>
                <span style={{ color: '#15803d', 'flex-shrink': 0 }}>✓</span>
                <span style={{ 'font-weight': 500, 'flex-shrink': 0 }}>{entry.id}</span>
                <span style={{ color: '#888', 'font-size': '0.72rem', 'flex-shrink': 0 }}>{entry.key}</span>
                <span style={{ flex: 1, 'min-width': 0, color: '#666', 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' }}>
                  {s.instances}× · {delta(s.bytesBefore, s.bytesAfter)}
                </span>
                <span style={{ color: '#888', 'font-variant-numeric': 'tabular-nums', 'flex-shrink': 0 }}>{s.ms}ms</span>
              </div>
            );
          }
          if (s.kind === 'error') {
            return (
              <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem', padding: '0.15rem 0', color: '#c00' }}>
                <span style={{ 'flex-shrink': 0 }}>✗</span>
                <span style={{ 'font-weight': 500, 'flex-shrink': 0 }}>{entry.id}</span>
                <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' }} title={s.error}>{s.error}</span>
              </div>
            );
          }
          const label =
            s.kind === 'skip-no-run' ? 'no run yet'
            : s.kind === 'skip-zero-instances' ? '0 instances'
            : s.kind === 'skip-no-renderer' ? 'legacy bridge'
            : '';
          return (
            <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem', padding: '0.15rem 0', color: '#888' }}>
              <span style={{ 'flex-shrink': 0 }}>·</span>
              <span style={{ 'font-weight': 500, 'flex-shrink': 0 }}>{entry.id}</span>
              <span style={{ color: '#aaa', 'font-size': '0.72rem', 'flex-shrink': 0 }}>{entry.key}</span>
              <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' }}>{label}</span>
            </div>
          );
        }}</For>
      </div>
    </Show>
  );
}
