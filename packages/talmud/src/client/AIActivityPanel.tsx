/**
 * Live panel showing what AI work is in flight. Reads the shared
 * `aiActivity` store. Renders one row per active or recently-completed
 * entry, with a state-specific indicator on the left:
 *   - loading: spinning red dot          + "running 4.2s" ticker
 *   - ok:      green check               + final "1.1s"
 *   - error:   red ✗                     + "error"
 *
 * Queued entries are collapsed into a single "N queued" summary row (a
 * cold daf enqueues dozens at once, which otherwise buries the handful
 * actually running). Click the summary to expand the full FIFO list.
 *
 * Mounted in DevModeShelf above the marks panel so dev-mode users see a
 * heartbeat for what the worker is chewing on.
 */

import { createMemo, createSignal, For, Show, onCleanup, type JSX } from 'solid-js';
import { aiActivity, type ActivityEntry } from './aiActivity';

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export default function AIActivityPanel(): JSX.Element {
  // Tick once a second so the "running 4.2s" / queued-wait badges update.
  const [now, setNow] = createSignal(Date.now());
  const interval = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(interval));

  const [showQueued, setShowQueued] = createSignal(false);
  const [showRunning, setShowRunning] = createSignal(false);
  const [showDone, setShowDone] = createSignal(false);
  // Cap how many running rows render at once; the rest collapse behind a
  // "+N more running" toggle so a burst of parallel jobs doesn't flood the panel.
  const MAX_RUNNING = 5;

  // Partition into loading (active) / queued (waiting on a slot) / terminal
  // (recently finished, still lingering). Order top-to-bottom by lifecycle:
  // running → waiting → done.
  const groups = createMemo(() => {
    const all = Object.values(aiActivity());
    const startedAt = (e: ActivityEntry) =>
      e.state.kind === 'loading' || e.state.kind === 'ok' || e.state.kind === 'error' ? e.state.startedAt : 0;
    const enqueuedAt = (e: ActivityEntry) => (e.state.kind === 'queued' ? e.state.enqueuedAt : 0);
    const finishedAt = (e: ActivityEntry) =>
      e.state.kind === 'ok' || e.state.kind === 'error' ? e.state.finishedAt : 0;
    return {
      loading: all.filter((e) => e.state.kind === 'loading').sort((a, b) => startedAt(a) - startedAt(b)),
      queued: all.filter((e) => e.state.kind === 'queued').sort((a, b) => enqueuedAt(a) - enqueuedAt(b)),
      terminal: all.filter((e) => e.state.kind === 'ok' || e.state.kind === 'error').sort((a, b) => finishedAt(b) - finishedAt(a)),
    };
  });

  // Oldest queued wait — surfaced on the summary row so a stalled queue
  // (jobs sitting for minutes) is obvious at a glance.
  const oldestQueuedWait = createMemo(() => {
    const q = groups().queued;
    if (q.length === 0) return 0;
    const oldest = Math.min(...q.map((e) => (e.state.kind === 'queued' ? e.state.enqueuedAt : Date.now())));
    return now() - oldest;
  });

  const total = createMemo(() => {
    const g = groups();
    return g.loading.length + g.queued.length + g.terminal.length;
  });

  const renderEntry = (entry: ActivityEntry): JSX.Element => {
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
        <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.15rem 0 0.15rem 1rem', color: '#9a8b6f' }}>
          <span style={{
            display: 'inline-block', width: '0.45rem', height: '0.45rem',
            'border-radius': '50%', background: '#f59e0b', 'flex-shrink': 0,
          }} />
          <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden', 'font-size': '0.72rem' }}>{entry.label}</span>
          <span style={{ color: '#b8a98c', 'font-variant-numeric': 'tabular-nums', 'font-size': '0.7rem', 'flex-shrink': 0 }}>{fmtMs(waited())}</span>
        </div>
      );
    }
    if (state.kind === 'ok') {
      const totalMs = state.finishedAt - state.startedAt;
      return (
        <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.15rem 0', color: '#444' }}>
          <span style={{ color: '#15803d', 'flex-shrink': 0 }}>✓</span>
          <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' }}>{entry.label}</span>
          <span style={{ color: '#888', 'font-variant-numeric': 'tabular-nums', 'flex-shrink': 0 }}>{fmtMs(totalMs)}</span>
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
  };

  return (
    <Show when={total() > 0}>
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

        {/* Active work first — capped at MAX_RUNNING, the rest collapsed. */}
        <For each={showRunning() ? groups().loading : groups().loading.slice(0, MAX_RUNNING)}>{(entry) => renderEntry(entry)}</For>
        <Show when={groups().loading.length > MAX_RUNNING}>
          <div
            onClick={() => setShowRunning((v) => !v)}
            title={showRunning() ? 'Show fewer running' : 'Show all running'}
            style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.15rem 0', cursor: 'pointer', color: '#8a2a2b' }}
          >
            <span style={{
              display: 'inline-block', width: '0.7rem', height: '0.7rem', 'border-radius': '50%',
              border: '2px solid #d6d3d1', 'border-top-color': '#8a2a2b',
              animation: 'daf-spin 0.8s linear infinite', 'flex-shrink': 0,
            }} />
            <span style={{ flex: 1, 'min-width': 0 }}>
              {showRunning() ? 'show fewer' : `+${groups().loading.length - MAX_RUNNING} more running`}
              <span style={{ color: '#888', 'font-size': '0.7rem' }}> {showRunning() ? '▾' : '▸'}</span>
            </span>
          </div>
        </Show>

        {/* Queued — collapsed to a single count by default. */}
        <Show when={groups().queued.length > 0}>
          <div
            onClick={() => setShowQueued((v) => !v)}
            title={showQueued() ? 'Hide queued' : 'Show queued'}
            style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.15rem 0', cursor: 'pointer', color: '#9a8b6f' }}
          >
            <span style={{
              display: 'inline-block', width: '0.55rem', height: '0.55rem',
              'border-radius': '50%', background: '#f59e0b', 'flex-shrink': 0,
              animation: 'daf-pulse 1.6s ease-in-out infinite',
            }} />
            <span style={{ flex: 1, 'min-width': 0 }}>
              {groups().queued.length} queued
              <span style={{ color: '#888', 'font-size': '0.7rem' }}> {showQueued() ? '▾' : '▸'}</span>
            </span>
            <span style={{ color: '#b8a98c', 'font-variant-numeric': 'tabular-nums', 'font-size': '0.72rem', 'flex-shrink': 0 }}>{fmtMs(oldestQueuedWait())}</span>
          </div>
          <Show when={showQueued()}>
            <For each={groups().queued}>{(entry) => renderEntry(entry)}</For>
          </Show>
        </Show>

        {/* Recently finished — collapsed to a single count by default. */}
        <Show when={groups().terminal.length > 0}>
          <div
            onClick={() => setShowDone((v) => !v)}
            title={showDone() ? 'Hide finished' : 'Show finished'}
            style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.15rem 0', cursor: 'pointer', color: '#15803d' }}
          >
            <span style={{ 'flex-shrink': 0 }}>✓</span>
            <span style={{ flex: 1, 'min-width': 0 }}>
              {groups().terminal.length} finished
              <span style={{ color: '#888', 'font-size': '0.7rem' }}> {showDone() ? '▾' : '▸'}</span>
            </span>
          </div>
          <Show when={showDone()}>
            <For each={groups().terminal}>{(entry) => renderEntry(entry)}</For>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
