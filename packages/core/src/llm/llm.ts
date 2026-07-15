/**
 * Unified LLM transport. One entry point, two transports:
 *
 *   - `@cf/*`         → env.AI.run(...)         (Workers AI binding;
 *                                                wrapEnv() Proxy injects the
 *                                                AI Gateway hint and retries)
 *   - `openrouter/*`  → fetch via Cloudflare    (AI Gateway "Universal
 *                       AI Gateway Universal     Endpoint" so prompt cache,
 *                       Endpoint                 observability, and rate-limit
 *                                                telemetry stay unified with
 *                                                the Workers-AI traffic)
 *
 * Both transports return OpenAI-compatible shapes; one shared SSE parser
 * handles streaming for either.
 *
 * Fallback chain: on retryable failures (1031 / 3046 / 5xx / 429 / network),
 * runLLM walks `opts.fallback` in order. The returned `model` field reports
 * which model actually produced the result, so callers see what fallback (if
 * any) kicked in.
 *
 * Settings (Phase 1) layer over this: defaultModel + fallbackChain are
 * resolved from KV before runLLM is called; runLLM itself only reads opts.
 */

import { runWithRetry } from './ai-gateway';
import { BudgetPausedError, checkBudget, type EmailBinding, recordSpend } from './budget';
import { isFallbackWorthy, LLMError, NEITHER, TIMEOUT } from './llm-error';
import { costSplitUsd, normalizeUsage } from './pricing';
import { DEFAULT_FALLBACK_CHAIN, DEFAULT_MODEL } from './settings';

export type LLMModelId = `@cf/${string}` | `openrouter/${string}`;

export interface LLMEnv {
  CACHE?: KVNamespace;
  AI?: Ai;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_DISABLE?: string;
  OPENROUTER_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  OPENROUTER_GATEWAY_PROVIDER?: string;
  DEFAULT_LLM_MODEL?: string;
  // Spend-budget overrides read by ./budget (checkBudget / recordSpend).
  DAILY_BUDGET_USD?: string;
  HOURLY_CUSTOM_BUDGET_USD?: string;
  // send_email binding — recordSpend uses it to email a spend alert on cap trips.
  EMAIL?: EmailBinding;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Billed cost in USD, returned by OpenRouter when the request sets
   *  `usage: { include: true }`. Accounts for prompt-cache discounts. Absent
   *  on Workers AI (`@cf/*`) calls, which aren't billed per-token here. */
  cost?: number;
  /** Prompt-cache accounting, passed through by OpenRouter and OpenAI-compat
   *  providers. `cached_tokens` is the portion of `prompt_tokens` (a subset,
   *  not additional tokens) billed at the provider's cache-read rate instead
   *  of the full input price. Absent when the routed endpoint doesn't support
   *  prompt caching. */
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

export interface LLMCallOptions {
  model?: LLMModelId;
  fallback?: LLMModelId[];
  messages: LLMMessage[];
  max_tokens: number;
  temperature?: number;
  response_format?: { type: 'json_object' } | { type: 'json_schema'; json_schema: unknown };
  reasoning_effort?: 'low' | 'medium' | 'high';
  /**
   * Maps to chat_template_kwargs.enable_thinking on Workers AI Kimi-style
   * models. Ignored on OpenRouter (use reasoning_effort there).
   */
  thinking?: boolean;
  stream?: boolean;
  /**
   * OpenRouter provider routing. When unset, `openrouter/deepseek/*` models
   * default to `{ sort: 'price', allow_fallbacks: true, require_parameters: true }`
   * — cheapest qualifying endpoint first (see the routing block in
   * callOpenRouterGateway). Pass an explicit object to override, or `null` to
   * opt out and take OpenRouter's default load-balancer. Ignored for `@cf/*`.
   */
  provider?: {
    order?: string[];
    allow_fallbacks?: boolean;
    sort?: 'price' | 'throughput' | 'latency';
    require_parameters?: boolean;
  } | null;
  /**
   * Skip the Cloudflare AI Gateway's prompt cache for this request. Sends
   * `cf-aig-skip-cache: true` on the OpenRouter Universal Endpoint call. Use
   * for "re-run with current prompt" affordances; never set for warming
   * crons where cache hits are desirable.
   */
  bypass_cache?: boolean;
  /** Optional attribution label written to the cost ledger (e.g.
   *  'mark:rabbi', 'enrich:rabbi.synthesis'). Lets /api/admin/llm-cost break
   *  spend down by mark/enrichment. Untagged calls still count toward totals. */
  tag?: string;
  /** Structured cost-ledger provenance: which daf / language / producer / kind
   *  of paid work this call was. Lets spend be traced to a daf and a producer,
   *  not just a free-text tag. See CostAttribution. */
  attribution?: CostAttribution;
  /** Spend classification for the budget guard (./budget). 'custom-question'
   *  counts against the hourly custom-Q&A cap AND the daily total; everything
   *  else counts only against the daily total. */
  cost_class?: 'custom-question';
}

/** Coarse category of paid work, so spend can be grouped by what it was for
 *  even when there's no producer id (translate, hebraize, diagnostics, …). */
export type CostKind =
  | 'mark'
  | 'enrichment'
  | 'translate'
  | 'hebraize'
  | 'match'
  | 'bridge'
  | 'cross-flow'
  | 'analyze'
  | 'rabbi'
  | 'adhoc'
  | 'qa'
  | 'other';

/** Structured provenance attached to a paid LLM call. Every field is optional —
 *  daf-bound work fills tractate/page/lang/cache_version; global work (rabbi
 *  enrichment, diagnostics) just sets `kind`. Written verbatim into the cost
 *  ledger so a dollar can be traced to a daf, a language, a producer version. */
export interface CostAttribution {
  tractate?: string;
  page?: string;
  lang?: 'en' | 'he';
  /** The producer's cache_version at generation time — lets spend on a
   *  superseded version be told apart from spend on the current one. */
  cache_version?: string;
  kind?: CostKind;
  /** Mark or enrichment id (e.g. 'rabbi', 'argument.synthesis'). */
  producerId?: string;
}

export type LLMTransport = 'workers-ai' | 'openrouter-gateway';

export interface LLMResult {
  content: string;
  reasoning_content: string;
  finish_reason: string | null;
  usage: LLMUsage | null;
  prompt_chars: number;
  elapsed_ms: number;
  model: LLMModelId;
  transport: LLMTransport;
  /**
   * Number of attempts including the final successful one. >1 means a
   * fallback was used; the `model` field reports which one succeeded.
   */
  attempts: number;
}

// LLMError moved to ./llm-error (where it carries typed retryable /
// fallbackWorthy classification). Re-exported so existing
// `import { LLMError } from './llm'` call sites keep working.
export { LLMError };

const DEFAULT_TEMPERATURE = 0.2;

// Hard cap on a single OpenRouter call (fetch + stream drain combined). Without
// this, a stalled connection or a streaming response that goes quiet
// mid-message wedges the consumer until Cloudflare kills the invocation, the
// job retries once, then drops. Symptom in the wild was a queue backlog that
// drained at ~0.6/s instead of the configured ~10/s.
//
// 240s ceiling. The heaviest mark (argument-move on a long daf) emits a large
// structured JSON and legitimately runs 90-180s on DeepSeek V4 Pro, so 90s was
// cutting off correct-but-slow work. Queue consumers get a 15-min wall budget,
// so even three chained models at 240s each (12 min) fits.
//
// NOTE: AbortController.signal is wired to fetch as best-effort cancellation,
// but it is NOT the primary timeout mechanism — workerd's fetch does not
// reliably interrupt an in-flight *streaming* response when the signal aborts
// mid-stream, so the abort frequently never propagated. The authoritative
// timeout is withHardTimeout() in runLLM (a Promise.race), which fires
// regardless of transport behavior. This AbortController just tries to free
// the underlying connection when we give up.
const OPENROUTER_CALL_TIMEOUT_MS = 240_000;

// Hard ceiling per model attempt, enforced by Promise.race in runLLM so it
// fires no matter what the transport does (see note above). On expiry it
// rejects with a fallback-worthy (TIMEOUT) error so runLLM walks to the next model in the
// fallback chain. The abandoned call keeps running in the background until the
// isolate ends; that's acceptable — correctness over a leaked socket.
const MODEL_CALL_HARD_TIMEOUT_MS = 240_000;

function withHardTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new LLMError(408, `${label} hard-timed-out after ${ms}ms`, { cls: TIMEOUT })),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Resolve the model + fallback chain to call. Code-driven (no KV layer):
 *   1. explicit opts.model wins (per-call override — this is what marks /
 *      enrichments use; they pin DeepSeek Flash/Pro per task). No default
 *      fallback is appended to a pinned model unless the caller passes one.
 *   2. else env.DEFAULT_LLM_MODEL (wrangler.toml [vars]) if set + valid
 *   3. else DEFAULT_MODEL (settings.ts) — the explicit code floor.
 * The default fallback chain (DEFAULT_FALLBACK_CHAIN) is appended in cases 2/3
 * unless the caller overrides it. NOT Kimi anywhere — it was dropped over
 * Workers AI concurrency limits.
 */
export function resolveChain(env: LLMEnv, opts: LLMCallOptions): LLMModelId[] {
  if (opts.model) return [opts.model, ...(opts.fallback ?? [])];
  const fromEnv = env.DEFAULT_LLM_MODEL;
  const base: LLMModelId =
    typeof fromEnv === 'string' && (fromEnv.startsWith('@cf/') || fromEnv.startsWith('openrouter/'))
      ? (fromEnv as LLMModelId)
      : DEFAULT_MODEL;
  return [base, ...(opts.fallback ?? DEFAULT_FALLBACK_CHAIN)];
}

/**
 * runLLM: try the resolved primary model first, then walk the fallback chain.
 * The first model that doesn't throw a retryable error wins. Non-retryable
 * errors (4xx that aren't 429, schema validation, etc.) bubble up immediately
 * without trying fallback.
 */
export async function runLLM(env: LLMEnv, opts: LLMCallOptions): Promise<LLMResult> {
  // Budget gate (./budget): refuse before spending when a pause is latched. The
  // thrown BudgetPausedError is classified NEITHER, so runLLM does NOT walk the
  // fallback chain on it — it surfaces immediately to the caller. This is the
  // single authoritative chokepoint: every paid path (marks, enrichments, QA,
  // warm/yomi crons) funnels through here.
  const custom = opts.cost_class === 'custom-question';
  const gate = await checkBudget(env, { custom });
  if (!gate.ok) throw new BudgetPausedError(gate.scope ?? 'all', gate.until, gate.reason);

  const chain = resolveChain(env, opts);

  let lastErr: unknown = null;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      const result = await withHardTimeout(
        callOnce(env, model, opts),
        MODEL_CALL_HARD_TIMEOUT_MS,
        model,
      );
      await recordLLMCost(env, model, i + 1, result, opts);
      // Feed the spend budget (./budget) so the next checkBudget sees this call.
      await recordSpend(env, { model: result.model, usage: result.usage, custom });
      return { ...result, attempts: i + 1 };
    } catch (err) {
      lastErr = err;
      const detail = String((err as Error)?.message ?? err);
      // Surface every failed attempt so the inspect drawer / Workers
      // observability can see the cascade. Without this, a successful
      // fallback hides upstream errors and a final fallback failure
      // reports only the LAST model's error, not what actually started
      // the cascade.
      console.warn(
        `[runLLM] ${model} attempt ${i + 1}/${chain.length} failed: ${detail.slice(0, 300)}`,
      );
      if (!isFallbackWorthy(err) || i === chain.length - 1) throw err;
    }
  }
  throw lastErr ?? new LLMError(500, 'runLLM: no models in chain', { cls: NEITHER });
}

// Per-call cost ledger. One unique KV key per billable LLM call so 50-way
// concurrent queue workers never clobber each other (a single ring buffer's
// read-modify-write would lose entries and undercount). /api/admin/llm-cost
// sums the prefix. Best-effort + short TTL; failures never block the call.
// Schema is additive over the original (model/tag/cost/tokens stay put), so the
// 7-day window of pre-attribution entries still aggregates — new fields just
// read as null on them.
const LLM_COST_PREFIX = 'llmcost:v1:';
const LLM_COST_TTL_S = 7 * 24 * 3600;

async function recordLLMCost(
  env: LLMEnv,
  model: LLMModelId,
  attempts: number,
  result: Omit<LLMResult, 'attempts'>,
  opts: LLMCallOptions,
): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;
  try {
    const u = result.usage;
    const a = opts.attribution;
    const { input, output } = normalizeUsage(u);
    // OpenRouter returns one billed `cost`; the in/out split is a list-price
    // estimate so the dashboard can show where tokens (and dollars) went.
    const { costInUsd, costOutUsd } = costSplitUsd(model, u);
    const now = Date.now();
    const key = `${LLM_COST_PREFIX}${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const rec = {
      ts: now,
      model,
      transport: result.transport,
      tag: opts.tag ?? 'untagged',
      attempts,
      ms: result.elapsed_ms,
      cost: typeof u?.cost === 'number' ? u.cost : null,
      cost_in_est: costInUsd,
      cost_out_est: costOutUsd,
      prompt_tokens: u?.prompt_tokens ?? input ?? null,
      completion_tokens: u?.completion_tokens ?? output ?? null,
      total_tokens: u?.total_tokens ?? null,
      // Prompt-cache hits (subset of prompt_tokens billed at the cache-read
      // rate). Null on endpoints without caching — distinguishes "no caching
      // available" from a genuine zero-hit call.
      cached_tokens: u?.prompt_tokens_details?.cached_tokens ?? null,
      // Structured attribution — null when the caller didn't supply it.
      kind: a?.kind ?? null,
      producer_id: a?.producerId ?? null,
      tractate: a?.tractate ?? null,
      page: a?.page ?? null,
      lang: a?.lang ?? null,
      cache_version: a?.cache_version ?? null,
      cost_class: opts.cost_class ?? null,
    };
    await cache.put(key, JSON.stringify(rec), { expirationTtl: LLM_COST_TTL_S });
  } catch {
    // best-effort telemetry; never fail the LLM call over a ledger write
  }
}

async function callOnce(
  env: LLMEnv,
  model: LLMModelId,
  opts: LLMCallOptions,
): Promise<Omit<LLMResult, 'attempts'>> {
  if (model.startsWith('@cf/')) return callWorkersAI(env, model, opts);
  if (model.startsWith('openrouter/')) return callOpenRouterGateway(env, model, opts);
  throw new LLMError(400, `Unknown model prefix: ${model}`);
}

// ---------------------------------------------------------------------------
// Transport: Workers AI (env.AI.run)
// ---------------------------------------------------------------------------

async function callWorkersAI(
  env: LLMEnv,
  model: LLMModelId,
  opts: LLMCallOptions,
): Promise<Omit<LLMResult, 'attempts'>> {
  if (!env.AI) throw new LLMError(503, 'AI binding not available', { cls: NEITHER });
  const promptChars = opts.messages.reduce((s, m) => s + m.content.length, 0);
  const t0 = Date.now();

  const body: Record<string, unknown> = {
    messages: opts.messages,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
  };
  if (opts.response_format) body.response_format = opts.response_format;
  if (opts.reasoning_effort) body.reasoning_effort = opts.reasoning_effort;
  if (opts.thinking !== undefined) body.chat_template_kwargs = { enable_thinking: opts.thinking };
  if (opts.stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }

  // The wrapEnv() Proxy already wraps env.AI.run with retry + gateway hint;
  // we don't double-retry here.
  const raw = (await env.AI.run(model as never, body as never)) as unknown;

  if (opts.stream) {
    const parsed = await parseOpenAIStream(raw as ReadableStream<Uint8Array>);
    return {
      ...parsed,
      prompt_chars: promptChars,
      elapsed_ms: Date.now() - t0,
      model,
      transport: 'workers-ai',
    };
  }

  // Non-streaming Workers AI: shapes vary. Some models return { response: "..." },
  // others return OpenAI-style { choices: [{ message: { content: ... } }], usage }.
  const r = raw as {
    response?: string;
    choices?: Array<{
      message?: { content?: string; reasoning_content?: string };
      finish_reason?: string | null;
    }>;
    usage?: LLMUsage;
  };
  const content = r.choices?.[0]?.message?.content ?? r.response ?? '';
  const reasoning = r.choices?.[0]?.message?.reasoning_content ?? '';
  const finish = r.choices?.[0]?.finish_reason ?? null;
  return {
    content,
    reasoning_content: reasoning,
    finish_reason: finish,
    usage: r.usage ?? null,
    prompt_chars: promptChars,
    elapsed_ms: Date.now() - t0,
    model,
    transport: 'workers-ai',
  };
}

// ---------------------------------------------------------------------------
// Transport: OpenRouter via CF AI Gateway Universal Endpoint
// ---------------------------------------------------------------------------

function openRouterGatewayUrl(env: LLMEnv): string {
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const gateway = env.AI_GATEWAY_ID;
  const provider = env.OPENROUTER_GATEWAY_PROVIDER ?? 'openrouter';
  if (!account)
    throw new LLMError(
      500,
      'CLOUDFLARE_ACCOUNT_ID not set; required for OpenRouter routing via AI Gateway',
      { cls: NEITHER },
    );
  if (!gateway)
    throw new LLMError(
      500,
      'AI_GATEWAY_ID not set; required for OpenRouter routing via AI Gateway',
      { cls: NEITHER },
    );
  return `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/${provider}/v1/chat/completions`;
}

async function callOpenRouterGateway(
  env: LLMEnv,
  model: LLMModelId,
  opts: LLMCallOptions,
): Promise<Omit<LLMResult, 'attempts'>> {
  if (!env.OPENROUTER_API_KEY)
    throw new LLMError(503, 'OPENROUTER_API_KEY not set', { cls: NEITHER });
  const promptChars = opts.messages.reduce((s, m) => s + m.content.length, 0);
  const t0 = Date.now();
  const orSlug = model.replace(/^openrouter\//, '');

  const body: Record<string, unknown> = {
    model: orSlug,
    messages: opts.messages,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
  };
  if (opts.response_format) body.response_format = opts.response_format;
  // Ask OpenRouter to return billed cost (USD, net of prompt-cache discounts)
  // in the response `usage` object. Drives the cost ledger / /api/admin/llm-cost.
  body.usage = { include: true };
  if (opts.reasoning_effort) body.reasoning_effort = opts.reasoning_effort;
  // DeepSeek V4 Pro reasons by default and burns ~30-90s on full-daf prompts.
  // OpenRouter accepts `reasoning: { enabled: false }` to disable. We turn it
  // off for any deepseek/* slug when the caller hasn't explicitly opted into
  // reasoning_effort. Saves a huge amount of latency for structured-output
  // extraction tasks (rabbi/argument/etc) where chain-of-thought adds noise,
  // not value.
  if (orSlug.startsWith('deepseek/') && !opts.reasoning_effort) {
    body.reasoning = { enabled: false };
  }
  if (opts.stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  // Provider routing. An explicit opts.provider always wins; pass `null` to
  // opt out and take OpenRouter's default load-balancer. Otherwise, for any
  // DeepSeek slug we route cheapest-endpoint-first:
  //   - V4 Pro: DeepSeek's own endpoint is the cheapest ($0.435/$0.87), so
  //     price-sorting keeps Pro on first-party.
  //   - V4 Flash: third-party providers (Baidu / DeepInfra / Cloudflare,
  //     ~$0.10/$0.20) undercut DeepSeek's own Flash ($0.14/$0.28) by ~30-40%,
  //     so price-sorting moves Flash to the cheaper endpoint.
  // `require_parameters` keeps routing to providers that honor everything we
  // send (response_format / json_schema / reasoning) so structured-output
  // marks never land on an endpoint that silently drops the schema — if no
  // cheaper provider qualifies it just falls back to DeepSeek, costing nothing.
  // `allow_fallbacks` preserves availability under congestion (the reason
  // hard-pinning was originally removed).
  const explicitProvider = (opts as { provider?: unknown }).provider;
  if (explicitProvider !== undefined) {
    if (explicitProvider !== null) body.provider = explicitProvider;
  } else if (orSlug.startsWith('deepseek/')) {
    body.provider = { sort: 'price', allow_fallbacks: true, require_parameters: true };
  }

  const url = openRouterGatewayUrl(env);
  // One AbortController for the whole call (fetch + stream drain). On timeout
  // the controller aborts: any in-flight backoff sleep is interrupted (runWithRetry
  // takes the signal), and the abort surfaces as a TIMEOUT-classed 408 which is
  // NOT retryable — so runWithRetry stops at once and runLLM fails over to the
  // next model instead of looping on a wedged endpoint.
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OPENROUTER_CALL_TIMEOUT_MS);
  try {
    // Retry on transient transport errors (5xx, 429). Non-retryable (4xx other
    // than 429) throws on the first attempt.
    const resp = await runWithRetry(async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://talmud.shaunregenbaum.com',
        'X-Title': 'talmud',
      };
      if (opts.bypass_cache) headers['cf-aig-skip-cache'] = 'true';
      let r: Response;
      try {
        r = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        // Our hard-timeout aborted the call: re-throw as a typed 408 (TIMEOUT →
        // fallbackWorthy, NOT retryable) so runLLM fails over to the next model
        // instead of runWithRetry hammering the same stalled endpoint.
        // workerd's fetch doesn't reliably set err.name = 'AbortError' the
        // way Node/undici does — check the controller's own state as the
        // authoritative signal that WE aborted (not some other transport
        // failure that happens to share an error class).
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') {
          throw new LLMError(
            408,
            `OpenRouter call aborted after ${OPENROUTER_CALL_TIMEOUT_MS}ms (hard timeout)`,
            { cls: TIMEOUT },
          );
        }
        throw err;
      }
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new LLMError(r.status, `OpenRouter HTTP ${r.status}: ${text.slice(0, 500)}`);
      }
      return r;
    }, controller.signal);

    if (opts.stream) {
      if (!resp.body)
        throw new LLMError(500, 'OpenRouter stream returned empty body', { cls: NEITHER });
      try {
        const parsed = await parseOpenAIStream(resp.body);
        return {
          ...parsed,
          prompt_chars: promptChars,
          elapsed_ms: Date.now() - t0,
          model,
          transport: 'openrouter-gateway',
        };
      } catch (err) {
        // The body stream errors when the controller fires mid-stream — surface
        // it as a typed 408 (TIMEOUT → fail over to the next model).
        // workerd's fetch doesn't reliably set err.name = 'AbortError' the
        // way Node/undici does — check the controller's own state as the
        // authoritative signal that WE aborted (not some other transport
        // failure that happens to share an error class).
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') {
          throw new LLMError(
            408,
            `OpenRouter stream aborted after ${OPENROUTER_CALL_TIMEOUT_MS}ms (hard timeout)`,
            { cls: TIMEOUT },
          );
        }
        throw err;
      }
    }

    // resp.json() reads the body stream — if the abort fires mid-read the
    // stream errors out, surface as a typed 408 (fail over) rather than
    // letting the raw "operation aborted" error escape unwrapped.
    let json: {
      choices?: Array<{
        message?: { content?: string; reasoning?: string; reasoning_content?: string };
        finish_reason?: string | null;
      }>;
      usage?: LLMUsage;
    };
    try {
      json = (await resp.json()) as typeof json;
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') {
        throw new LLMError(
          408,
          `OpenRouter body read aborted after ${OPENROUTER_CALL_TIMEOUT_MS}ms (hard timeout)`,
          { cls: TIMEOUT },
        );
      }
      throw err;
    }
    const content = json.choices?.[0]?.message?.content ?? '';
    const reasoning =
      json.choices?.[0]?.message?.reasoning_content ?? json.choices?.[0]?.message?.reasoning ?? '';
    const finish = json.choices?.[0]?.finish_reason ?? null;
    return {
      content,
      reasoning_content: reasoning,
      finish_reason: finish,
      usage: json.usage ?? null,
      prompt_chars: promptChars,
      elapsed_ms: Date.now() - t0,
      model,
      transport: 'openrouter-gateway',
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ---------------------------------------------------------------------------
// Shared OpenAI-compat SSE parser
// ---------------------------------------------------------------------------

/**
 * Drain an OpenAI-compatible SSE stream into one buffered result. Handles:
 *   - `choices[].delta.content` and `choices[].delta.reasoning_content`
 *   - top-level `response` (some Workers AI models)
 *   - `usage` and `finish_reason` as they arrive
 *   - `[DONE]` terminator and keepalive comments
 *
 * Lifted verbatim from the original runKimiStreaming in index.ts. Both the
 * Workers AI Kimi stream and OpenRouter return the same OpenAI shape, so one
 * parser handles both.
 */
export async function parseOpenAIStream(stream: ReadableStream<Uint8Array>): Promise<{
  content: string;
  reasoning_content: string;
  finish_reason: string | null;
  usage: LLMUsage | null;
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';
  let finish: string | null = null;
  let usage: LLMUsage | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const sep = buffer.indexOf('\n\n');
        if (sep === -1) break;
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string; reasoning_content?: string; reasoning?: string };
                finish_reason?: string | null;
              }>;
              response?: string;
              usage?: LLMUsage;
            };
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) content += delta.content;
            if (delta?.reasoning_content) reasoning += delta.reasoning_content;
            if (delta?.reasoning) reasoning += delta.reasoning;
            const f = parsed.choices?.[0]?.finish_reason;
            if (f) finish = f;
            if (parsed.usage) usage = parsed.usage;
            if (typeof parsed.response === 'string') content += parsed.response;
          } catch {
            // Not valid JSON — skip (keepalive / comments)
          }
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }

  return { content, reasoning_content: reasoning, finish_reason: finish, usage };
}
