/**
 * Producer — the unified registry-entry shape behind both legacy definition
 * families (MarkDefinition / EnrichmentDefinition). A producer declares what it
 * makes (kind), from what (inputs), how (recipe), where its outputs sit
 * (anchoring), how many it makes (cardinality), and how its outputs cache
 * (scope + key_shape + cacheVersion). model/compat.ts projects the legacy defs
 * into this shape LOSSLESSLY (anything without a first-class field rides in
 * `legacy`).
 */

import type { AnchorPrecision } from './anchor.ts';

/** How a producer's outputs get their anchors:
 *  - 'discovers'  — the extractor finds them (mark extraction, anchor refiners)
 *  - 'inherits'   — outputs sit where their input instance sits (per-instance
 *                   enrichments)
 *  - 'aggregates' — one output over many inputs (daf-level synthesis) */
export type AnchorBehavior = 'discovers' | 'inherits' | 'aggregates';

export type Cardinality = 'one' | 'many' | 'per-input';

export type ProducerInput =
  | { source: string }
  | { producer: string; fanOut?: boolean }
  | { spine: string; select?: 'unit' | 'work' };

export interface Recipe {
  extractor: unknown;
  render?: unknown;
}

export interface Producer {
  id: string;
  label: string;
  description?: string;
  category?: string;
  /** 'mark-instance' | 'enrichment' | 'anchor-refinement' | app-defined. */
  kind: string;
  inputs: ProducerInput[];
  recipe: Recipe;
  anchoring: {
    behavior: AnchorBehavior;
    precision?: AnchorPrecision;
    spine?: string;
    /** The producer whose outputs this one operates on (legacy target_mark). */
    target?: string;
  };
  cardinality: Cardinality;
  scope: 'global' | 'local' | 'spine';
  /** FROZEN legacy key family ('mark:…' vs 'enrich:…' cache keys) — kept so
   *  every already-warmed KV entry stays reachable. */
  key_shape: 'mark' | 'enrich';
  cacheVersion: string;
  passes?: string[];
  status?: 'draft' | 'promoted';
  experimental?: boolean;
  source?: 'kv' | 'code';
  updatedAt?: string;
  /** Lossless round-trip bag: legacy fields with no first-class home
   *  (anchorKind, def_hash, sidebar recipe, verbatim dependencies, …). */
  legacy?: Record<string, unknown>;
}
