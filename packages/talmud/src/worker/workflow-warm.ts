/**
 * Phase 3 (step 1) — generation as a Cloudflare Workflow.
 *
 * The cold-daf OOMs come from one invocation doing too much: a generation job
 * resolves a producer's whole dependency tree (and regenerates cold deps) in a
 * single 128 MB isolate. A Workflow decomposes that into checkpointed STEPS —
 * each `step.do(...)` is its own invocation with its own memory budget, so the
 * pile can't build up. This first step proves the model on an ADDITIVE warming
 * path (a new admin trigger) that warms a daf's whole-daf pieces one step each,
 * reusing the EXACT same generation function (`runEnrichmentOnce`) so it writes
 * byte-identical cache keys — it can't force a re-warm and doesn't touch the live
 * queue / run / reader paths.
 *
 * This module holds the pure, testable selection logic; the WorkflowEntrypoint
 * class lives in index.ts (where the generation internals are in scope).
 */

export interface MarkLike {
  id: string;
  anchor?: string;
}
export interface EnrichmentLike {
  id: string;
  scope?: string;
  target_mark?: string;
}

/**
 * The whole-daf enrichment ids a warm pass generates: those whose target mark is
 * whole-daf (or which declare no target mark). Same bucketing rule the daf-view
 * uses to separate whole-daf from per-instance pieces, so the two stay in sync.
 * Per-instance enrichments are intentionally excluded here (step 1 warms the
 * whole-daf surface; per-instance fan-out is a later step).
 */
export function wholeDafEnrichmentIds(marks: MarkLike[], enrichments: EnrichmentLike[]): string[] {
  const anchorById = new Map(marks.map((m) => [m.id, m.anchor]));
  return enrichments
    .filter((e) => e.scope === 'local')
    .filter((e) => !e.target_mark || anchorById.get(e.target_mark) === 'whole-daf')
    .map((e) => e.id);
}

/** Params passed to the warm Workflow. */
export interface DafWarmParams {
  tractate: string;
  page: string;
  lang: 'en' | 'he';
}
