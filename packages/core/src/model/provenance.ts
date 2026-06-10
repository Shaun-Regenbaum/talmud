/**
 * Provenance — how an artifact was made: who decided (human / rule / ai), by
 * which producer + recipe, from which inputs, at what cost. The model-side
 * superset of the fields legacy RunResult cache entries already carry;
 * {@link provenanceOf} synthesizes a Provenance from a stored legacy entry so
 * nothing needs re-generation to enter the new model.
 */

export type Authority = 'human' | 'rule' | 'ai';

/** One input an artifact was built from. Legacy entries only know the resolved
 *  dependency KEY (sourceKey); real artifact ids + content hashes arrive when
 *  producers write artifacts natively. */
export interface InputRef {
  artifactId?: string;
  sourceKey?: string;
  contentHash?: string;
}

/** Generation cost stamped onto a cache entry — the permanent per-entry
 *  ledger. VERBATIM copy of the talmud worker's CostStamp (index.ts) so stored
 *  stamps parse unchanged. */
export interface CostStamp {
  /** OpenRouter billed USD (net of prompt-cache); null on Workers AI / unpriced. */
  billedUsd: number | null;
  /** List-price estimate total; null when the model has no known rate. */
  estimatedUsd: number | null;
  /** Estimate split so input-vs-output dollars are answerable per entry. */
  costInUsd: number | null;
  costOutUsd: number | null;
  tokensIn: number;
  tokensOut: number;
  lang: 'en' | 'he';
  cacheVersion: string;
  computedAt: number;
}

export interface Provenance {
  authority: Authority;
  producerId: string;
  recipeHash?: string;
  inputs: InputRef[];
  confidence?: number;
  model?: string;
  transport?: string;
  usage?: unknown;
  cost?: CostStamp | null;
  /** ISO timestamp; '' when the legacy entry recorded no time. */
  createdAt: string;
  updatedAt?: string;
}

/** The fields of a stored legacy RunResult that provenance synthesis reads.
 *  Structural on purpose: core must not import from the apps; any stored
 *  RunResult-shaped object satisfies this. */
export interface LegacyRunFields {
  model: string;
  transport: string;
  recipe_hash?: string;
  usage?: unknown;
  cost?: CostStamp | null;
  deps_resolved?: Record<string, unknown>;
  anchors_resolved?: Record<string, unknown>;
}

/** Transports that mean a real LLM produced the content. Everything else
 *  ('computed', 'graph', 'lookup', …) is a deterministic rule. */
const AI_TRANSPORTS = new Set(['workers-ai', 'openrouter-gateway']);

/** Synthesize a Provenance from a legacy stored RunResult-shaped object.
 *  Inputs are the resolved dependency + anchor keys (legacy entries don't
 *  record real artifact ids or content hashes, so each becomes a sourceKey). */
export function provenanceOf(stored: LegacyRunFields, producerId: string): Provenance {
  const inputs: InputRef[] = [
    ...Object.keys(stored.deps_resolved ?? {}),
    ...Object.keys(stored.anchors_resolved ?? {}),
  ].map((k) => ({ sourceKey: k }));
  return {
    authority: AI_TRANSPORTS.has(stored.transport) ? 'ai' : 'rule',
    producerId,
    recipeHash: stored.recipe_hash,
    inputs,
    model: stored.model,
    transport: stored.transport,
    usage: stored.usage,
    cost: stored.cost,
    createdAt: stored.cost?.computedAt ? new Date(stored.cost.computedAt).toISOString() : '',
  };
}
