/**
 * dafRunsStore — ONE shared owner of the `/api/daf-runs` snapshot (cache status +
 * cost per piece) plus the live `aiActivity` overlay, so the Inspect waterfall
 * (RunTreeDock) and the daf load bar (DafLoadProgress) consume the SAME info and
 * can't drift. Previously the dock owned this fetch privately and the load bar
 * had its own counters; this lifts the fetch to module scope (under a long-lived
 * createRoot) keyed by the active daf, so it runs whether or not the dock is open.
 *
 * Two facts, two natures, deliberately kept separate and reconciled downstream:
 *   - durable "cached + cost"  ← the daf-runs snapshot (this resource)
 *   - ephemeral "in flight now" ← aiActivity (liveProducerSet/Counts)
 * The load bar grounds its completion in the cached snapshot but keeps its live
 * climb on aiActivity, so it never lags a cold load or stalls below 100%.
 */

import {
  createEffect,
  createMemo,
  createResource,
  createRoot,
  createSignal,
  onCleanup,
} from 'solid-js';
import { aiActivity } from './aiActivity';
import {
  type AnchorGroup,
  type AnchorPiece,
  cacheProgressOf,
  type DafRun,
} from './dafRunsProgress';
import { liveProducerCounts, liveProducerSet } from './runStatus';

// Re-export the pure shape + reducers so consumers keep one import site; the
// testable definitions live in dafRunsProgress (no Solid → importable in vitest).
export {
  type AnchorGroup,
  type AnchorPiece,
  type AnchorRef,
  cacheProgressOf,
  type DafRun,
  isEagerRow,
  pieceToRun,
  WHOLE_DAF_ANCHOR,
} from './dafRunsProgress';

interface Target {
  tractate: string;
  page: string;
  lang: string;
}

const [target, setTarget] = createSignal<Target | null>(null);

/** Point the store at a daf — called from DafViewer on every daf/lang change.
 *  Idempotent: a same-value target doesn't refetch (resource keys on the tuple). */
export function setDafRunsTarget(tractate: string, page: string, lang: string): void {
  const cur = target();
  if (cur && cur.tractate === tractate && cur.page === page && cur.lang === lang) return;
  setTarget({ tractate, page, lang });
}

const targetKey = (): string | null => {
  const t = target();
  return t ? `${t.tractate}|${t.page}|${t.lang}` : null;
};

const store = createRoot(() => {
  const [runs, { refetch }] = createResource(
    targetKey,
    async (
      key,
    ): Promise<{
      key: string;
      rows: DafRun[];
      groups: AnchorGroup[];
      marks: Record<string, AnchorPiece>;
    }> => {
      const t = target();
      if (!t) return { key, rows: [], groups: [], marks: {} };
      const r = await fetch(
        `/api/daf-runs/${encodeURIComponent(t.tractate)}/${encodeURIComponent(t.page)}?lang=${t.lang}`,
      );
      if (!r.ok) return { key, rows: [], groups: [], marks: {} };
      const j = (await r.json()) as {
        runs?: DafRun[];
        groups?: AnchorGroup[];
        marks?: Record<string, AnchorPiece>;
      };
      return { key, rows: j.runs ?? [], groups: j.groups ?? [], marks: j.marks ?? {} };
    },
  );
  const liveLoading = createMemo<Set<string>>(() => liveProducerSet(aiActivity()));
  const liveCounts = createMemo<Map<string, number>>(() => liveProducerCounts(aiActivity()));
  // The snapshot is point-in-time; while anything is warming, re-poll so finished
  // pieces flip to their real cached/cost, then once more right after the live set
  // empties to capture the final state. Bounded — only runs during active warming.
  createEffect((wasLive: boolean) => {
    const isLive = !!target() && liveLoading().size > 0;
    if (isLive) {
      const h = setInterval(() => refetch(), 2500);
      onCleanup(() => clearInterval(h));
    } else if (wasLive && target()) {
      refetch();
    }
    return isLive;
  }, false);
  return { runs, refetch, liveLoading, liveCounts };
});

// Rows for the CURRENT target only. A resource keeps its prior value during a
// source-change refetch, so without this guard a daf change would briefly serve
// the previous daf's snapshot — flashing a stale cache fraction on the load bar.
// [] until the current daf's fetch resolves; persists across same-daf refetches.
export const dafRunRows = (): DafRun[] => {
  const r = store.runs();
  return r && r.key === targetKey() ? r.rows : [];
};
/** The by-anchor groups for the current daf (additive; empty when the server is
 *  old or the daf is un-indexed — the dock falls back to the flat `runs` view). */
export const dafRunMarks = (): Record<string, AnchorPiece> => {
  const r = store.runs();
  return r && r.key === targetKey() ? r.marks : {};
};
export const dafRunGroups = (): AnchorGroup[] => {
  const r = store.runs();
  return r && r.key === targetKey() ? r.groups : [];
};
export const dafRunsLoading = (): boolean => store.runs.loading;
export const refetchDafRuns = (): void => {
  void store.refetch();
};
export const liveLoading = store.liveLoading;
export const liveCounts = store.liveCounts;

/** The shared cache-progress, recomputed as the snapshot updates. */
export const dafCacheProgress = createRoot(() => createMemo(() => cacheProgressOf(dafRunRows())));
