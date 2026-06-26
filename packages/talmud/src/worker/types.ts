// Shared worker types, extracted from index.ts so any module (route slices,
// telemetry, crons) can reference them WITHOUT importing index.ts. index.ts is
// the entry point that wires everything together, so importing it back from a
// helper module creates a cycle — these neutral types break that.

import type { EmailBinding } from './warm-cron';
import type { DafWarmParams } from './workflow-warm';

/** Queue message for one enrichment/mark run. `/api/run` enqueues a JobMessage;
 *  the queue consumer (bottom of index.ts) runs the LLM chain and writes the
 *  result to KV under `job:{runId}`. */
export interface JobMessage {
  runId: string;
  mark_id?: string;
  enrichment_id?: string;
  ad_hoc?: unknown;
  tractate: string;
  page: string;
  model_override?: string;
  mark_input?: unknown;
  bypass_cache?: boolean;
  /** Free-text input that becomes part of the enrichment's cache key (via
   *  qualifierHash) and is exposed to its prompt as {{user_question}}. Used
   *  by argument-move.qa today. Empty/undefined means a vanilla run. */
  user_question?: string;
  /** Output language for enrichments. 'he' selects the *_he prompt variant
   *  and a `:he`-namespaced cache key; omitted/'en' is the default English
   *  path. Marks ignore this (language-neutral output). */
  lang?: 'en' | 'he';
  /** Deep-warm job: run this daf's structural marks, then fan out a warm job
   *  for every per-instance enrichment (synthesis + suggested-questions). Used
   *  by /api/warm-daf to comprehensively pre-warm an adjacent daf so navigation
   *  lands on a fully-cached page. Mutually exclusive with mark_id/enrichment_id. */
  warm_deep?: boolean;
  /** With `warm_deep`, restrict the warm to this set of enrichment ids (the
   *  re-warm cascade) and EVICT their cache entries so they regenerate. A recipe
   *  edit leaves the key unchanged, so the cascade must be evicted to actually
   *  regenerate — but only the cascade, so unchanged dependencies still cache-hit
   *  (see deepWarmDaf `evict`). Covers the deep-warm surface (synthesis /
   *  suggested-questions / overview); cascade ids outside it regenerate on their
   *  next on-demand request. */
  rewarm_only?: string[];
}

/** Worker environment bindings (declared in wrangler.toml). */
export interface Bindings {
  ASSETS: Fetcher;
  AI?: Ai;
  CACHE?: KVNamespace;
  EMAIL?: EmailBinding;
  // AI Gateway routing (see src/worker/ai-gateway.ts).
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_DISABLE?: string;
  // OpenRouter via AI Gateway Universal Endpoint (see src/worker/llm.ts).
  OPENROUTER_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  // Cloudflare API token (Account Analytics: Read) for the AI Gateway cost
  // query in aigw-analytics.ts. Set via `wrangler secret put CF_ANALYTICS_TOKEN`.
  CF_ANALYTICS_TOKEN?: string;
  // OpenRouter MANAGEMENT/provisioning key (not the inference key) for the
  // authoritative billed-spend query in openrouter-cost.ts (/api/v1/activity +
  // /credits). Set via `wrangler secret put OPENROUTER_PROVISIONING_KEY`.
  OPENROUTER_PROVISIONING_KEY?: string;
  OPENROUTER_GATEWAY_PROVIDER?: string;
  DEFAULT_LLM_MODEL?: string;
  // Enrichment job queue — see wrangler.toml + queue handler at the bottom
  // of index.ts. /api/run enqueues a JobMessage; the queue consumer
  // runs the LLM chain and writes the result to KV under `job:{runId}`.
  ENRICHMENT_QUEUE?: Queue<JobMessage>;
  // Phase 3 (step 1): the warm Workflow binding — generates a daf's whole-daf
  // pieces as per-step invocations. Triggered by POST /api/admin/workflow-warm.
  DAF_WARM_WORKFLOW?: Workflow<DafWarmParams>;
  // When '1', the background Sefaria Shas walk also enqueues rabbi.observations
  // per amud (full reverse-index backfill). OFF by default — see WarmEnv.
  OBSERVATIONS_WARM_SHAS?: string;
  // When '1', the warm-cron incrementally builds the per-tractate spine-view
  // snapshot shelf (a window of warmed dapim per tick). OFF by default.
  SPINE_VIEW_WARM_SHAS?: string;
  // Dynamic Worker Loader binding (wrangler.toml `worker_loaders`). Spins up the
  // isolated sandbox the code-mode MCP `execute` tool runs in. Optional: when
  // unset, GET/POST /mcp returns 503 and the rest of the worker is unaffected.
  LOADER?: WorkerLoader;
  // Shared secret gating the privileged /api/run knobs (ad_hoc,
  // model_override, bypass_cache) and the admin mutation endpoints. Presented
  // by trusted tools as the `x-studio-secret` header. UNSET => every request is
  // treated as untrusted (fail-safe): the public app still works (it only uses
  // the safe subset), but no one can use the worker as a free LLM proxy.
  // Set via `wrangler secret put STUDIO_SECRET`.
  STUDIO_SECRET?: string;
  // Spend-budget overrides (USD) read by ./budget. Default 300 / 10 when unset.
  DAILY_BUDGET_USD?: string;
  HOURLY_CUSTOM_BUDGET_USD?: string;
  // Which deployment this is: "generator" (talmud-gen — queue consumer +
  // DafWarmWorkflow host + heavy crons) or "reader"/unset (talmud — read-only,
  // runs only the health-watch cron). Read by scheduled() in index.ts to route
  // cron work to the right isolate pool. See wrangler.generator.toml.
  WORKER_ROLE?: 'reader' | 'generator';
}
