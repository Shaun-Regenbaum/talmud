/**
 * Unified daf-load progress bar. Replaces the scatter of per-anchor spinners
 * with ONE slim sticky bar + a single status line describing what's still
 * loading. Combines two cohorts into one fraction:
 *
 *   1. Anchor extraction — the mark runs (rabbi/argument/pesukim/…), read from
 *      markStatuses().
 *   2. Section prefetch — the syntheses + suggested-questions warmed by
 *      dafPrefetch, read from prefetchProgress().
 *
 * Auto-hides shortly after everything completes. On a fully-warm daf (all KV
 * cache hits) it barely flickers; on a cold daf it tracks the real work.
 */

import { createMemo, createEffect, createSignal, onCleanup, Show, type JSX } from 'solid-js';
import { markStatuses } from './MarksRegistryPanel';
import { prefetchProgress } from './dafPrefetch';

const COMPLETE_LINGER_MS = 700;

export default function DafLoadProgress(): JSX.Element {
  // Anchor cohort: marks that are actually doing something (skip idle/disabled).
  const marks = createMemo(() => {
    const relevant = markStatuses().filter((m) => m.kind !== 'idle');
    const done = relevant.filter((m) => m.kind === 'ok' || m.kind === 'error').length;
    return { total: relevant.length, done };
  });

  const combined = createMemo(() => {
    const m = marks();
    const pf = prefetchProgress();
    const total = m.total + pf.total;
    const done = m.done + pf.done;
    return { total, done, marksLoading: m.total > 0 && m.done < m.total, pf };
  });

  const percent = createMemo(() => {
    const { total, done } = combined();
    if (total === 0) return 0;
    return Math.min(100, Math.round((done / total) * 100));
  });

  const label = createMemo(() => {
    const c = combined();
    if (c.marksLoading) {
      return `Analyzing daf — ${marks().done} of ${marks().total} anchors`;
    }
    if (c.pf.total > 0 && c.pf.done < c.pf.total) {
      return `Loading ${c.pf.currentLabel ?? 'sections'} — ${c.pf.done} of ${c.pf.total}`;
    }
    return 'Up to date';
  });

  // Visibility: show whenever there's incomplete work; linger briefly at 100%
  // so the fill animation reads as "done" before the bar slides away.
  const [visible, setVisible] = createSignal(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const { total, done } = combined();
    const incomplete = total > 0 && done < total;
    if (incomplete) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = undefined; }
      setVisible(true);
    } else if (visible()) {
      // All done — linger then hide.
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setVisible(false), COMPLETE_LINGER_MS);
    }
  });
  onCleanup(() => { if (hideTimer) clearTimeout(hideTimer); });

  return (
    <Show when={visible()}>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'sticky',
          top: 0,
          'z-index': 40,
          background: 'rgba(255,255,255,0.94)',
          'backdrop-filter': 'blur(4px)',
          'border-bottom': '1px solid #ece9e4',
          padding: '0.3rem 0.75rem 0.35rem',
          'font-size': '0.72rem',
          color: '#6b6258',
        }}
      >
        <div style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem', 'margin-bottom': '0.28rem' }}>
          <span
            style={{
              display: 'inline-block', width: '0.6rem', height: '0.6rem',
              'border-radius': '50%',
              border: '2px solid #d6d3d1', 'border-top-color': '#8a2a2b',
              animation: 'daf-spin 0.8s linear infinite',
              'flex-shrink': 0,
            }}
          />
          <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
            {label()}
          </span>
          <span style={{ 'font-variant-numeric': 'tabular-nums', color: '#a39a8c', 'flex-shrink': 0 }}>
            {percent()}%
          </span>
        </div>
        {/* track */}
        <div style={{ height: '3px', background: '#eceae6', 'border-radius': '2px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${percent()}%`,
              background: 'linear-gradient(90deg, #8a2a2b, #b5564f)',
              'border-radius': '2px',
              transition: 'width 0.35s ease',
            }}
          />
        </div>
      </div>
    </Show>
  );
}
