/**
 * Shared in-process store for "AI work happening right now" so the UI can
 * render a live activity panel showing what mark/enrichment is loading at
 * any moment, what just finished, and how long it took.
 *
 * The store is written to by every client-side runner that POSTs to
 * `/api/studio/run` — `MarkEnrichmentCards`'s queue helpers and
 * `MarksRegistryPanel`'s runMark/runEnrichment. Read by `AIActivityPanel`
 * (mounted in the dev shelf).
 *
 * Entries flow: `loading` → `ok` (or `error`). Completed entries linger for
 * COMPLETION_LINGER_MS so the user sees the green check + total time, then
 * drop out of the panel. Loading entries never drop until they resolve.
 */

import { createSignal } from 'solid-js';

export type ActivityState =
  | { kind: 'loading'; startedAt: number }
  | { kind: 'ok'; startedAt: number; finishedAt: number }
  | { kind: 'error'; startedAt: number; finishedAt: number; error: string };

export interface ActivityEntry {
  /** Stable id across start/finish — same string must be passed to both calls. */
  id: string;
  /** Human-readable label shown in the panel. */
  label: string;
  state: ActivityState;
}

const COMPLETION_LINGER_MS = 30_000;

const [activities, setActivities] = createSignal<Record<string, ActivityEntry>>({});

export const aiActivity = activities;

export function startActivity(id: string, label: string): void {
  setActivities((cur) => ({
    ...cur,
    [id]: { id, label, state: { kind: 'loading', startedAt: Date.now() } },
  }));
}

export function finishActivity(id: string, label: string, ok: boolean, error?: string): void {
  setActivities((cur) => {
    const prev = cur[id];
    const startedAt = prev?.state.startedAt ?? Date.now();
    const state: ActivityState = ok
      ? { kind: 'ok', startedAt, finishedAt: Date.now() }
      : { kind: 'error', startedAt, finishedAt: Date.now(), error: error ?? 'failed' };
    return { ...cur, [id]: { id, label, state } };
  });
  setTimeout(() => {
    setActivities((cur) => {
      const next = { ...cur };
      const entry = next[id];
      if (entry && entry.state.kind !== 'loading') delete next[id];
      return next;
    });
  }, COMPLETION_LINGER_MS);
}

/**
 * Activity-store wrapper around a fetch+poll cycle. Caller provides a
 * stable id and a label. Returns whatever the work function resolves to;
 * rethrows on error after marking the entry failed.
 *
 * The lifecycle is surfaced live by `AIActivityPanel` in the dev shelf.
 */
export async function trackAI<T>(
  id: string,
  label: string,
  work: () => Promise<T>,
): Promise<T> {
  startActivity(id, label);
  try {
    const result = await work();
    finishActivity(id, label, true);
    return result;
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    finishActivity(id, label, false, msg);
    throw err;
  }
}
