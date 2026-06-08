/**
 * Shared store for daf-rendering pipeline stage timings.
 *
 * One entry per stage (e.g. "daf-fetch", "sefaria-align", "layout-spacers")
 * with wall-clock duration, optional cache state, and an optional one-line
 * detail. Read by `PipelinePanel` (mounted in the dev shelf). Entries
 * never expire — the panel shows the last record per id so you can see
 * "daf-fetch 320ms (cache hit)" at a glance. Subsequent records replace.
 *
 * Filename retained as `rendererActivity` for git-history continuity —
 * the per-mark renderer entries it used to also hold were retired in
 * favour of the existing AI activity panel.
 */

import { createSignal } from 'solid-js';

/** Pipeline stage timing entry. */
export interface PipelineStageEntry {
  /** Stable id used as a map key (e.g. "daf-fetch", "sefaria-align",
   *  "layout-spacers"). */
  id: string;
  /** Display label shown in the panel ("Daf fetch", "Sefaria align"). */
  label: string;
  /** Wall-clock duration. */
  ms: number;
  /** Optional cache state. 'hit' = served from cache (KV / browser),
   *  'miss' = fresh fetch / computation. Undefined when the stage isn't
   *  cached. */
  cache?: 'hit' | 'miss';
  /** Optional one-line detail rendered below the stage (e.g.
   *  "Berakhot 2a · 14 KB"). */
  detail?: string;
  /** Timestamp of the most recent record call. */
  at: number;
}

const [stages, setStages] = createSignal<Record<string, PipelineStageEntry>>({});
export const pipelineStages = stages;

export function recordStage(
  id: string,
  label: string,
  ms: number,
  opts?: { cache?: 'hit' | 'miss'; detail?: string },
): void {
  setStages((cur) => ({
    ...cur,
    [id]: { id, label, ms, cache: opts?.cache, detail: opts?.detail, at: Date.now() },
  }));
}

export function clearPipelineStages(): void {
  setStages({});
}
