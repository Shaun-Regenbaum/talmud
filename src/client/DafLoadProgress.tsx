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
import { prefetchProgress, loadNotice } from './dafPrefetch';
import { t } from './i18n';

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
    const marksLoading = m.total > 0 && m.done < m.total;
    const prefetchActive = pf.total > 0 && pf.done < pf.total;
    return { m, pf, marksLoading, prefetchActive };
  });

  // Phase-weighted so the bar climbs monotonically instead of filling during
  // anchor extraction then snapping backwards when the prefetch cohort appears.
  // Anchors occupy the first 30%; section prefetch the remaining 70%.
  const ANCHOR_WEIGHT = 30;
  const percent = createMemo(() => {
    const { m, pf } = combined();
    if (m.total === 0 && pf.total === 0) return 0;
    const anchorFrac = m.total > 0 ? m.done / m.total : 1;
    const anchorPct = anchorFrac * ANCHOR_WEIGHT;
    if (pf.total === 0) {
      // Prefetch not planned yet (or none coming). Hold at the anchor ceiling;
      // visibility hides the bar if no prefetch ultimately fires.
      return Math.round(m.done < m.total ? anchorPct : ANCHOR_WEIGHT);
    }
    return Math.round(ANCHOR_WEIGHT + (pf.done / pf.total) * (100 - ANCHOR_WEIGHT));
  });

  const label = createMemo(() => {
    const c = combined();
    if (c.marksLoading) {
      return t('dafLoad.analyzing', { done: c.m.done, total: c.m.total });
    }
    if (c.prefetchActive) {
      return t('dafLoad.loadingSections', {
        section: t(c.pf.currentLabel ?? 'dafLoad.sections'),
        done: c.pf.done,
        total: c.pf.total,
      });
    }
    return t('dafLoad.upToDate');
  });

  // Visibility: show whenever there's incomplete work; linger briefly at 100%
  // so the fill animation reads as "done" before the bar slides away.
  const [visible, setVisible] = createSignal(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const c = combined();
    const incomplete = c.marksLoading || c.prefetchActive;
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

  // Top-level notice: a budget pause or a wave of failures, so generation
  // problems don't read as a silently-stuck bar. Persists (independent of the
  // bar's auto-hide) until the next daf clears the cohort.
  const notice = createMemo(() => loadNotice(prefetchProgress()));

  return (
    <>
    <Show when={notice()}>
      {(kind) => (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex', 'align-items': 'center', gap: '0.4rem',
            position: 'sticky', top: 0, 'z-index': 50,
            width: '100%', 'box-sizing': 'border-box',
            padding: '0.4rem 0.55rem', 'margin-bottom': '0.5rem',
            'border-radius': '4px',
            border: `1px solid ${kind() === 'paused' ? '#f59e0b' : '#ef4444'}`,
            background: kind() === 'paused' ? '#fffbeb' : '#fef2f2',
            color: kind() === 'paused' ? '#92400e' : '#b91c1c',
            'font-family': 'system-ui, -apple-system, sans-serif',
            'font-size': '0.72rem', 'line-height': 1.4,
          }}
        >
          <span aria-hidden="true">{kind() === 'paused' ? '⏸' : '⚠'}</span>
          <span>{kind() === 'paused' ? t('dafLoad.paused') : t('dafLoad.failed')}</span>
        </div>
      )}
    </Show>
    <Show when={visible() && !notice()}>
      <div
        role="status"
        aria-live="polite"
        style={{
          // Pinned directly above the daf: rendered inside the daf body
          // column so it's exactly the daf's width, and sticky so it stays
          // above the daf as the reader scrolls. Parchment background so daf
          // text scrolling underneath doesn't bleed through.
          position: 'sticky',
          top: 0,
          'z-index': 50,
          width: '100%',
          'box-sizing': 'border-box',
          background: 'var(--bg)',
          padding: '0.4rem 0.25rem',
          'margin-bottom': '0.5rem',
          'font-family': 'system-ui, -apple-system, sans-serif',
          'font-size': '0.72rem',
          color: 'var(--muted)',
        }}
      >
        <div style={{ display: 'flex', 'align-items': 'center', gap: '0.45rem', 'margin-bottom': '0.3rem' }}>
          <span
            style={{
              display: 'inline-block', width: '0.6rem', height: '0.6rem',
              'border-radius': '50%',
              border: '2px solid var(--line)', 'border-top-color': 'var(--accent)',
              animation: 'daf-spin 0.8s linear infinite',
              'flex-shrink': 0,
            }}
          />
          <span style={{ flex: 1, 'min-width': 0, 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis', 'letter-spacing': '0.01em' }}>
            {label()}
          </span>
          <span style={{ 'font-variant-numeric': 'tabular-nums', color: '#a39a8c', 'flex-shrink': 0 }} aria-hidden="true">
            {percent()}%
          </span>
        </div>
        {/* track — thin parchment rule that fills with the accent */}
        <div style={{ height: '2px', background: 'var(--line)', 'border-radius': '1px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${percent()}%`,
              background: 'var(--accent)',
              'border-radius': '1px',
              transition: 'width 0.4s ease',
              opacity: 0.8,
            }}
          />
        </div>
      </div>
    </Show>
    </>
  );
}
