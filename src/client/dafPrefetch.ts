/**
 * Daf-load prefetcher. When a daf's anchor marks have loaded, eagerly warm the
 * enrichments the reader is most likely to open next — the per-section and
 * per-move syntheses plus the suggested-questions lists — so opening a sidebar
 * shows content immediately instead of waiting on a cold generation.
 *
 * Scope:
 *   - Prefetched: argument/pesukim/places/halacha/rabbi/rishonim syntheses,
 *     pesukim/aggadata suggested-questions, AND the per-MOVE enrichments
 *     (argument-move.synthesis + argument-move.suggested-questions). Moves were
 *     previously deferred to section-open, but a daf has 15-40 of them and the
 *     scroll-deferred lazy loading left many never requested — so they now warm
 *     up front like everything else.
 *   - Never prefetched: QA answers (<mark>.qa) — fetched only when the reader
 *     clicks a specific question.
 *
 * Work funnels through the SAME bounded queue the cards use
 * (enqueueEnrichmentRun) at LOW priority, so prefetch warms the shared server
 * cache without ever starving a foreground anchor click. Progress is exposed
 * as a signal for the unified load bar.
 */

import { createSignal } from 'solid-js';
import { enqueueEnrichmentRun } from './MarkEnrichmentCards';

export interface PrefetchProgress {
  /** `${tractate}:${page}` this cohort belongs to. */
  dafKey: string;
  total: number;
  done: number;
  /** i18n catalog KEY for the family currently being warmed (translated by the
   *  consumer via t()), or null when idle/done. */
  currentLabel: string | null;
}

const [progress, setProgress] = createSignal<PrefetchProgress>({
  dafKey: '',
  total: 0,
  done: 0,
  currentLabel: null,
});

/** Read the live prefetch progress (consumed by DafLoadProgress). */
export const prefetchProgress = progress;

// Enrichments to warm per mark instance, keyed by mark id. Keep in sync with
// the aggregate/suggested-questions enrichments registered in
// worker/code-marks.ts. `argument-move` instances come from the argument-move
// mark run, so its syntheses + questions fan out one-per-move.
const SECTION_PREFETCH: Record<string, string[]> = {
  argument: ['argument.synthesis'],
  'argument-move': ['argument-move.synthesis', 'argument-move.suggested-questions'],
  pesukim: ['pesukim.synthesis', 'pesukim.suggested-questions'],
  aggadata: ['aggadata.synthesis', 'aggadata.suggested-questions'],
  places: ['places.synthesis'],
  halacha: ['halacha.synthesis'],
  rabbi: ['rabbi.synthesis'],
  rishonim: ['rishonim.synthesis'],
};

// enrichmentId → i18n catalog KEY for the family label shown in the status
// line. DafLoadProgress runs the key through t() so the label localizes (and
// re-localizes live on a language switch) instead of being a hardcoded English
// string baked into the otherwise-translated progress sentence.
const FRIENDLY: Record<string, string> = {
  'argument.synthesis': 'dafLoad.family.arguments',
  'argument-move.synthesis': 'dafLoad.family.argumentMoves',
  'argument-move.suggested-questions': 'dafLoad.family.moveQuestions',
  'pesukim.synthesis': 'dafLoad.family.verses',
  'pesukim.suggested-questions': 'dafLoad.family.verseQuestions',
  'aggadata.synthesis': 'dafLoad.family.aggadot',
  'aggadata.suggested-questions': 'dafLoad.family.aggadahQuestions',
  'places.synthesis': 'dafLoad.family.places',
  'halacha.synthesis': 'dafLoad.family.halachot',
  'rabbi.synthesis': 'dafLoad.family.rabbis',
  'rishonim.synthesis': 'dafLoad.family.rishonim',
  'argument-overview.synthesis': 'dafLoad.family.argumentOverview',
};

interface MarkInstance {
  fields?: { id?: string; name?: string; verseRef?: string; topic?: string; title?: string };
  name?: string;
}

/** Stable-ish key per instance for activity dedup. The server cache key is
 *  derived from (enrichmentId, tractate, page, mark_input), NOT this key, so a
 *  later card mount still hits the warmed cache regardless. */
function instanceKeyOf(markId: string, inst: MarkInstance, idx: number): string {
  const f = inst?.fields ?? {};
  const tag = f.id ?? f.verseRef ?? f.name ?? f.topic ?? f.title ?? inst?.name ?? String(idx);
  return `${markId}:${tag}`;
}

// Monotonic token so a daf change supersedes an in-flight cohort — stale
// completions from the previous daf must not bump the new bar.
let gen = 0;

// AbortController for the in-flight cohort. A daf change (or a new prefetch
// for a different daf) aborts it so the previous daf's queued/polling tasks
// stop occupying the shared enrichment queue's concurrency slots — otherwise
// navigating away mid-prefetch left up-to-600s pending polls clogging the
// queue, starving the new daf's prefetch and the user's anchor clicks.
let activeController: AbortController | null = null;

/** Abort the in-flight prefetch cohort and clear the progress bar. Called on
 *  daf navigation so stale section-warming work is dropped immediately. */
export function cancelPrefetch(): void {
  if (activeController) { activeController.abort(); activeController = null; }
  setProgress({ dafKey: '', total: 0, done: 0, currentLabel: null });
}

interface MarkRun { parsed?: unknown }

/**
 * Build the section-level plan from loaded mark instances and warm it. Safe to
 * call repeatedly; a new daf supersedes the prior cohort. No-op (clears the
 * bar) when no relevant marks are loaded.
 */
export function prefetchDaf(
  tractate: string,
  page: string,
  marks: Record<string, MarkRun | undefined>,
): void {
  const dafKey = `${tractate}:${page}`;
  const myGen = ++gen;
  // Supersede any previous cohort: abort it so its tasks vacate the shared
  // queue, then arm a fresh controller for this daf's tasks.
  if (activeController) activeController.abort();
  const controller = new AbortController();
  activeController = controller;

  interface Task { enrichmentId: string; instance: unknown; instanceKey: string }
  const tasks: Task[] = [];
  for (const [markId, enrichmentIds] of Object.entries(SECTION_PREFETCH)) {
    const parsed = marks[markId]?.parsed as { instances?: MarkInstance[] } | undefined;
    const instances = parsed?.instances;
    if (!Array.isArray(instances)) continue;
    instances.forEach((inst, idx) => {
      const instanceKey = instanceKeyOf(markId, inst, idx);
      for (const enrichmentId of enrichmentIds) {
        tasks.push({ enrichmentId, instance: inst, instanceKey });
      }
    });
  }

  // Whole-daf argument overview — one daf-level run, COUNTED in the bar. Warms
  // argument-overview.synthesis, which pulls the cross-section flow graph
  // (argument-overview.flow, deepseek-v4-pro + reasoning) in as a dependency,
  // so opening the overview chip is a cache hit. Only when the daf actually has
  // argument sections to relate.
  const argInstances = (marks['argument']?.parsed as { instances?: MarkInstance[] } | undefined)?.instances;
  if (Array.isArray(argInstances) && argInstances.length > 0) {
    tasks.push({
      enrichmentId: 'argument-overview.synthesis',
      instance: { fields: {} },
      instanceKey: 'argument-overview:daf',
    });
  }

  setProgress({
    dafKey,
    total: tasks.length,
    done: 0,
    currentLabel: tasks.length > 0 ? 'dafLoad.sections' : null,
  });
  if (tasks.length === 0) return;

  for (const t of tasks) {
    void enqueueEnrichmentRun(t.enrichmentId, tractate, page, t.instance, t.instanceKey, controller.signal)
      // Best-effort: a failed or aborted prefetch just means the card
      // generates on open.
      .catch(() => undefined)
      .finally(() => {
        if (myGen !== gen) return; // superseded by a newer daf
        setProgress((p) => {
          if (p.dafKey !== dafKey) return p;
          const done = p.done + 1;
          return {
            dafKey,
            total: p.total,
            done,
            currentLabel: done < p.total ? (FRIENDLY[t.enrichmentId] ?? 'dafLoad.sections') : null,
          };
        });
      });
  }

  // Reverse-index capture (rabbi.observations) — one daf-level run, fired LAST
  // and deliberately NOT counted in the visible progress bar: it's an internal
  // deterministic collect step, not a card the reader opens. Enqueued after the
  // synthesis tasks so it sits at the back of the LOW queue and runs once they
  // (incl. rabbi.location, which it reads from cache for the high-confidence
  // place tier) have landed. Correctness doesn't depend on ordering — it pulls
  // its mark deps in regardless. mark_input { id: 'daf' } shares the canonical
  // daf-level cache key with the cron path. Only when the daf has rabbis.
  const rabbiParsed = marks['rabbi']?.parsed as { instances?: MarkInstance[] } | undefined;
  if (Array.isArray(rabbiParsed?.instances) && rabbiParsed.instances.length > 0) {
    void enqueueEnrichmentRun('rabbi.observations', tractate, page, { id: 'daf' }, 'rabbi.observations:daf', controller.signal)
      .catch(() => undefined);
  }
}
