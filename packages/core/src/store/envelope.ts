/**
 * StoredArtifact — the KV value envelope. Byte-compatible with the talmud
 * worker's stored RunResult / RunResultEnrichment (every legacy field stays at
 * TOP level so existing entries parse unchanged); the model-shaped additions
 * (`provenance`, `anchors`) are two optional fields old readers ignore.
 *
 * Deliberately EXCLUDED: `total_ms`, `stale`, `refreshing` — those are
 * RESPONSE-time injections the /api/run cache-hit path spreads on top
 * (`{ ...result, cache_hit: true, total_ms: 0, stale, refreshing }`); they are
 * never written to KV (verified against every writeCachedResult call site).
 */

import type { Anchor } from '../model/anchor.ts';
import type { Authority, CostStamp, Provenance } from '../model/provenance.ts';
import { provenanceOf } from '../model/provenance.ts';

export interface StoredArtifact {
  content: string;
  reasoning?: string;
  parsed: unknown;
  parse_error: string | null;
  model: string;
  transport: string;
  attempts: number;
  usage: unknown;
  elapsed_ms: number;
  prompt_chars: number;
  resolved: { system_prompt: string; user_prompt: string };
  cache_hit: boolean;
  /** Deterministic post-generation lint issues (hard issues that gated the
   *  cache write). Empty array means clean; absent on older entries. */
  lint_issues?: unknown[];
  /** Full standardized check-layer output (all severities). Observe-only. */
  check_issues?: unknown[];
  /** Content hash of the producer's recipe at generation time (recipeHash in
   *  cache/keys.ts). Absent on entries written before the stamp existed. */
  recipe_hash?: string;
  /** Generation cost stamped at write time — the permanent per-entry ledger.
   *  Absent on computed (no-LLM) marks and on pre-stamp entries. */
  cost?: CostStamp | null;
  // --- RunResultEnrichment extras (absent on mark entries) ---
  deps_resolved?: Record<string, unknown>;
  anchors_resolved?: Record<string, unknown>;
  /** Segment range (`${startSegIdx}-${endSegIdx}`) a section enrichment was
   *  computed for; the hot path refuses a hit whose stamp mismatches. */
  section_range?: string;
  // --- NEW (additive; old readers ignore) ---
  provenance?: Provenance;
  anchors?: Anchor[];
}

/**
 * Who decided this artifact's content. Native model-era entries carry it
 * first-class on `provenance.authority`; legacy entries derive it from the
 * transport exactly the way {@link provenanceOf} does (LLM transports → 'ai',
 * everything else — 'computed', 'graph', 'lookup', … — → 'rule'). Delegating
 * to provenanceOf keeps the transport classification in ONE place.
 */
export function authorityOf(stored: StoredArtifact): Authority {
  return (
    stored.provenance?.authority ??
    provenanceOf(stored, stored.provenance?.producerId ?? '').authority
  );
}
