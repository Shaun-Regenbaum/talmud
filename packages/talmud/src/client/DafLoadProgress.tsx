/**
 * Daf-load progress — the talmud adapter over the shared @corpus/ui LoadProgress
 * bar. Replaces the scatter of per-anchor spinners with ONE slim sticky bar +
 * a single status line. Combines two cohorts into one fraction:
 *
 *   1. Anchor extraction — the mark runs (rabbi/argument/pesukim/…), read from
 *      markStatuses().
 *   2. Section prefetch — the syntheses + suggested-questions warmed by
 *      dafPrefetch, read from prefetchProgress().
 *
 * All the talmud-specific math (the 30/70 phase weighting, the cache-snapshot
 * grounding, the t()-driven labels, the pause/failure notice) lives here; the
 * shared component owns the render + the auto-show/hide behaviour.
 */

import { aiStatus } from '@corpus/ui/aiStatus';
import { LoadProgress, type LoadProgressNotice } from '@corpus/ui/LoadProgress';
import { createMemo, type JSX } from 'solid-js';
import { loadNotice, prefetchProgress } from './dafPrefetch';
import { dafCacheProgress } from './dafRunsStore';
import { isServiceUnavailableError, PAUSED_ERROR } from './enrichmentQueue';
import { t } from './i18n';
import { markStatuses } from './MarksRegistryPanel';

interface DafLoadProgressProps {
  /** When true, render for the mobile bottom shelf: no sticky/top pinning
   *  (the shelf is already fixed) and tighter margins. Defaults to the
   *  in-column sticky bar pinned above the daf. */
  embedded?: boolean;
}

export default function DafLoadProgress(props: DafLoadProgressProps = {}): JSX.Element {
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
  const enginePercent = createMemo(() => {
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
  // Ground completion in the SHARED daf-runs cache snapshot — the same source the
  // Inspect waterfall reads — so the two can't disagree about what's loaded (a
  // warm revisit with a full cache reads ~100% at once). max() so the snapshot
  // only ever ADVANCES the bar; it never drags the live climb backward on a cold
  // load, where the snapshot lags the warm.
  // Final clamp to [0,100]: the shared bar renders this verbatim as both the
  // "N%" label and the fill width, so neither cohort's math may push it over 100.
  const percent = createMemo(() =>
    Math.min(100, Math.max(enginePercent(), dafCacheProgress().pct)),
  );

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

  const loading = () => {
    const c = combined();
    return c.marksLoading || c.prefetchActive;
  };

  // Top-level notice: a budget pause or a wave of failures, so generation
  // problems don't read as a silently-stuck bar.
  const notice = createMemo<LoadProgressNotice | null>(() => {
    // When the shared AI-paused banner is up it's the single, clear explanation
    // (out of credits / cost cap) — don't also show the generic "couldn't be
    // generated" / "paused" line, which would just repeat it.
    if (aiStatus()) return null;
    const kind = loadNotice(prefetchProgress());
    if (kind) {
      return { kind, text: kind === 'paused' ? t('dafLoad.paused') : t('dafLoad.failed') };
    }
    // Genuine mark failures land here too (the reader used to render them as a
    // raw red "Rabbis: BUDGET_PAUSED" strip — never again): paused/outage marks
    // are the banner's story and stay quiet, anything else gets the same
    // localized "couldn't be generated" line as a failed prefetch wave.
    const markFailed = markStatuses().some(
      (m) => m.kind === 'error' && m.error !== PAUSED_ERROR && !isServiceUnavailableError(m.error),
    );
    if (markFailed) return { kind: 'failed', text: t('dafLoad.failed') };
    return null;
  });

  return (
    <LoadProgress
      percent={percent}
      label={label}
      loading={loading}
      notice={notice}
      embedded={props.embedded}
    />
  );
}
