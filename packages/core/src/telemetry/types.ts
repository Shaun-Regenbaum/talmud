/**
 * @corpus/core/telemetry — the canonical DATA shapes for the dev/telemetry
 * surfaces (the inspector run-tree + the usage ledger), shared by every corpus
 * app. The DERIVATIONS over these (aggregateUsage, buildRunTree, isExpandable)
 * live alongside in usage.ts / runtree.ts; the RENDER lives in @corpus/ui. The
 * point of housing them here is that both apps' usage page + inspector are
 * PROJECTIONS of the producer registry + the run ledger — not hand-built pages.
 */

// ── Run-tree (inspector) ────────────────────────────────────────────────────

export type Authority = 'human' | 'rule' | 'ai';
export type Staleness = 'fresh' | 'stale-recipe' | 'stale-inputs' | 'unknown';

/** Per-input freshness: did this dependency's content hash move since the node
 *  was generated? */
export interface TreeNodeInput {
  sourceKey: string;
  status: 'same' | 'changed' | 'unknown';
}

export interface TreeNode {
  id: string;
  label: string;
  kind: 'source' | 'llm' | 'computed';
  producer?: 'mark' | 'enrichment';
  model?: string;
  cached: boolean;
  cold_ms: number | null;
  cost: number | null;
  tokens: number | null;
  /** Per-instance producers report the warmed fraction; absent on whole-unit /
   *  single-entry nodes. */
  instances?: { total: number; cached: number };
  // additive provenance/staleness (absent on older payloads + source leaves)
  authority?: Authority | null;
  staleness?: Staleness | null;
  createdAt?: string | null;
  recipeHash?: string | null;
  inputs?: TreeNodeInput[];
  inputsChanged?: string[];
}

export interface RunTreeTotals {
  count: number;
  llm: number;
  source: number;
  cached: number;
  cold_ms: number;
  cost: number;
}

export interface RunTree {
  root: string;
  /** Addressing context — the unit the tree is for (daf "tractate"/"page" or a
   *  chapter "book"/"page"); opaque to the renderer. */
  tractate: string;
  page: string;
  lang: string;
  nodes: Record<string, TreeNode>;
  edges: Array<[string, string]>;
  rootInstances?: Array<{ label: string; instance: unknown }>;
  totals: RunTreeTotals;
}

export interface RunResult {
  content?: string;
  model?: string;
  usage?: { total_tokens?: number; cost?: number } | null;
  elapsed_ms?: number;
  cache_hit?: boolean;
  resolved?: { system_prompt: string; user_prompt: string };
}

// ── Usage ledger ──────────────────────────────────────────────────────────

/** One recorded producer call. */
export interface UsageEntry {
  ts: number;
  /** The unit it was attributed to ("Genesis 22", "Berakhot 2a", "Genesis 22:4"). */
  ref: string;
  producer: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Total cost (prefer billed; estimate fallback). */
  costUsd: number | null;
  /** Input/output cost split, when known (content-in / content-out). */
  costInUsd?: number | null;
  costOutUsd?: number | null;
}

/** A roll-up over some key (a producer, a model, a ref). */
export interface UsageBucket {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  costInUsd: number;
  costOutUsd: number;
}

export interface UsageSummary {
  totals: UsageBucket;
  byProducer: Record<string, UsageBucket>;
  byModel: Record<string, UsageBucket>;
  /** Per-unit (per-daf / per-chapter) — the dimension talmud's page has and
   *  tanach's lacked. Derived from each entry's `ref`. */
  byRef: Record<string, UsageBucket>;
}
