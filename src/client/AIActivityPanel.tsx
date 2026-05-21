/**
 * Live panel showing what AI work is in flight. Reads the shared
 * `aiActivity` store. Renders one row per active or recently-completed
 * entry, with a state-specific indicator on the left:
 *   - loading: spinning red dot          + "running 4.2s" ticker
 *   - queued:  pulsing amber dot, dim    + "waited 12s" ticker
 *              (in the FIFO, no slot yet — visually clearly NOT active)
 *   - ok:      green check               + final "1.1s"
 *   - error:   red ✗                     + "error"
 *
 * Mounted in DevModeShelf above the marks panel so dev-mode users see a
 * heartbeat for what the worker is chewing on. Could also be promoted to
 * the main header later for production users — for now it's dev-scoped.
 */

import { createMemo, createSignal, For, Show, onCleanup, type JSX } from 'solid-js';
import { aiActivity, type ActivityEntry } from './aiActivity';

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export default function AIActivityPanel(): JSX.Element {
  // Tick once a second so the "running 4.2s" / "waited 12s" badges update
  // on loading + queued entries. Cleanup on unmount.
  const [now, setNow] = createSignal(Date.now());
  const interval = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(interval));

  // Single sort key across all states: loading first (eye lands on what's
  // actually working), queued next in FIFO order (next-up at the top),
  // then most-recent completions.
  const rows = createMemo<ActivityEntry[]>(() => {
    const stateRank = (e: ActivityEntry): number => {
      if (e.state.kind === 'loading') return 0;
      if (e.state.kind === 'queued') return 1;
      return 2;
    };
    const tieBreaker = (e: ActivityEntry): number => {
      if (e.state.kind === 'loading') return -e.state.startedAt;
      if (e.state.kind === 'queued') return e.state.enqueuedAt;
      return -e.state.finishedAt;
    };
    return Object.values(aiActivity()).sort((a, b) => {
      const r = stateRank(a) - stateRank(b);
      if (r !== 0) return r;
      return tieBreaker(a) - tieBreaker(b);
    });
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
        }}>AI activity</div>
        <For each={rows()}>{(entry) => {
          const state = entry.state;
          if (state.kind === 'loading') {
            const elapsed = () => now() - state.startedAt;
            return (
              <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.15rem 0' }}>
                <span style={{
                  display: 'inline-block', width: '0.7rem', height: '0.7rem',
                  'border-radius': '50%',
                  border: '2px solid #d6d3d1', 'border-top-color': '#8a2a2b',
                  animation: 'daf-spin 0.8s linear infinite',
                  'flex-shrink': 0,
                }} />
                <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' }}>{entry.label}</span>
                <span style={{ color: '#888', 'font-variant-numeric': 'tabular-nums', 'flex-shrink': 0 }}>{fmtMs(elapsed())}</span>
              </div>
            );
          }
          if (state.kind === 'queued') {
            const waited = () => now() - state.enqueuedAt;
            return (
              <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.15rem 0', color: '#9a8b6f' }}>
                {/* Solid amber dot (no spin) — visually distinct from the
                    loading spinner. Pulses gently so the user can tell it's
                    a live "waiting" indicator rather than a stale row. */}
                <span style={{
                  display: 'inline-block', width: '0.55rem', height: '0.55rem',
                  'border-radius': '50%',
                  background: '#f59e0b',
                  'flex-shrink': 0,
                  animation: 'daf-pulse 1.6s ease-in-out infinite',
                }} title="queued — waiting on a concurrency slot" />
                <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' }}>{entry.label}</span>
                <span style={{
                  color: '#b8a98c',
                  'font-variant-numeric': 'tabular-nums',
                  'font-size': '0.7rem',
                  'flex-shrink': 0,
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.04em',
                  'margin-right': '0.15rem',
                }}>queued</span>
                <span style={{ color: '#b8a98c', 'font-variant-numeric': 'tabular-nums', 'font-size': '0.72rem', 'flex-shrink': 0 }}>{fmtMs(waited())}</span>
              </div>
            );
          }
          if (state.kind === 'ok') {
            const total = state.finishedAt - state.startedAt;
            return (
              <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.15rem 0', color: '#444' }}>
                <span style={{ color: '#15803d', 'flex-shrink': 0 }}>✓</span>
                <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' }}>{entry.label}</span>
                <span style={{ color: '#888', 'font-variant-numeric': 'tabular-nums', 'flex-shrink': 0 }}>{fmtMs(total)}</span>
              </div>
            );
          }
          return (
            <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.15rem 0', color: '#c00' }}>
              <span style={{ 'flex-shrink': 0 }}>✗</span>
              <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' }} title={state.error}>{entry.label}</span>
              <span style={{ color: '#888', 'font-size': '0.7rem', 'flex-shrink': 0 }}>error</span>
            </div>
          );
        }}</For>
      </div>
    </Show>
  );
}
