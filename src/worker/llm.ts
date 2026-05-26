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

import { runWithRetry, FALLBACK_WORTHY } from './ai-gateway';
import { readSettings, type SettingsEnv } from './settings';

export type LLMModelId = `@cf/${string}` | `openrouter/${string}`;

export interface LLMEnv extends SettingsEnv {
  AI?: Ai;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_DISABLE?: string;
  OPENROUTER_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  OPENROUTER_GATEWAY_PROVIDER?: string;
  DEFAULT_LLM_MODEL?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface LLMCallOptions {
  model?: LLMModelId;
  fallback?: LLMModelId[];
  messages: LLMMessage[];
  max_tokens: number;
  temperature?: number;
  response_format?:
    | { type: 'json_object' }
    | { type: 'json_schema'; json_schema: unknown };
  reasoning_effort?: 'low' | 'medium' | 'high';
  /**
   * Maps to chat_template_kwargs.enable_thinking on Workers AI Kimi-style
   * models. Ignored on OpenRouter (use reasoning_effort there).
   */
  thinking?: boolean;
  stream?: boolean;
  /**
   * OpenRouter provider routing. Default for `openrouter/deepseek/*` models is
   * `{ order: ['DeepSeek'], allow_fallbacks: false }` so we always hit
   * DeepSeek's own promo-priced endpoint. Pass `null` to opt out.
   * Ignored for `@cf/*` models.
   */
  provider?: { order?: string[]; allow_fallbacks?: boolean } | null;
  /**
   * Skip the Cloudflare AI Gateway's prompt cache for this request. Sends
   * `cf-aig-skip-cache: true` on the OpenRouter Universal Endpoint call. Use
   * for "re-run with current prompt" affordances; never set for warming
   * crons where cache hits are desirable.
   */
  bypass_cache?: boolean;
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

export class LLMError extends Error {
  constructor(public readonly status: number, message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'LLMError';
  }
}

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
// rejects with a RETRYABLE error so runLLM walks to the next model in the
// fallback chain. The abandoned call keeps running in the background until the
// isolate ends; that's acceptable — correctness over a leaked socket.
const MODEL_CALL_HARD_TIMEOUT_MS = 240_000;

function withHardTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new LLMError(408, `fetch failed: ${label} hard-timed-out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Resolve the model + fallback chain to call:
 *   1. explicit opts.model + opts.fallback wins (per-call override)
 *   2. else settings KV (settable via /api/admin/llm-settings)
 *   3. else env.DEFAULT_LLM_MODEL (wrangler.toml [vars])
 *   4. else Kimi (preserves pre-existing behavior)
 */
async function resolveChain(env: LLMEnv, opts: LLMCallOptions): Promise<LLMModelId[]> {
  if (opts.model) return [opts.model, ...(opts.fallback ?? [])];

  const settings = await readSettings(env);
  if (settings) {
    const fallback = opts.fallback ?? settings.fallbackChain ?? [];
    return [settings.defaultModel, ...fallback];
  }

  const fromEnv = env.DEFAULT_LLM_MODEL;
  if (fromEnv && (fromEnv.startsWith('@cf/') || fromEnv.startsWith('openrouter/'))) {
    return [fromEnv as LLMModelId, ...(opts.fallback ?? [])];
  }
  return ['@cf/moonshotai/kimi-k2.5', ...(opts.fallback ?? [])];
}

/**
 * runLLM: try the resolved primary model first, then walk the fallback chain.
 * The first model that doesn't throw a retryable error wins. Non-retryable
 * errors (4xx that aren't 429, schema validation, etc.) bubble up immediately
 * without trying fallback.
 */
export async function runLLM(env: LLMEnv, opts: LLMCallOptions): Promise<LLMResult> {
  const chain = await resolveChain(env, opts);

  let lastErr: unknown = null;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      const result = await withHardTimeout(callOnce(env, model, opts), MODEL_CALL_HARD_TIMEOUT_MS, model);
      return { ...result, attempts: i + 1 };
    } catch (err) {
      lastErr = err;
      const detail = String((err as Error)?.message ?? err);
      // Surface every failed attempt so the inspect drawer / Workers
      // observability can see the cascade. Without this, a successful
      // fallback hides upstream errors and a final fallback failure
      // reports only the LAST model's error, not what actually started
      // the cascade.
      // eslint-disable-next-line no-console
      console.warn(`[runLLM] ${model} attempt ${i + 1}/${chain.length} failed: ${detail.slice(0, 300)}`);
      if (!FALLBACK_WORTHY.test(detail) || i === chain.length - 1) throw err;
    }
  }
  throw lastErr ?? new LLMError(500, 'runLLM: no models in chain');
}

async function callOnce(env: LLMEnv, model: LLMModelId, opts: LLMCallOptions): Promise<Omit<LLMResult, 'attempts'>> {
  if (model.startsWith('@cf/')) return callWorkersAI(env, model, opts);
  if (model.startsWith('openrouter/')) return callOpenRouterGateway(env, model, opts);
  throw new LLMError(400, `Unknown model prefix: ${model}`);
}

// ---------------------------------------------------------------------------
// Transport: Workers AI (env.AI.run)
// ---------------------------------------------------------------------------

async function callWorkersAI(env: LLMEnv, model: LLMModelId, opts: LLMCallOptions): Promise<Omit<LLMResult, 'attempts'>> {
  if (!env.AI) throw new LLMError(503, 'AI binding not available');
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
  const content =
    r.choices?.[0]?.message?.content ??
    r.response ??
    '';
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
  if (!account) throw new LLMError(500, 'CLOUDFLARE_ACCOUNT_ID not set; required for OpenRouter routing via AI Gateway');
  if (!gateway) throw new LLMError(500, 'AI_GATEWAY_ID not set; required for OpenRouter routing via AI Gateway');
  return `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/${provider}/v1/chat/completions`;
}

async function callOpenRouterGateway(env: LLMEnv, model: LLMModelId, opts: LLMCallOptions): Promise<Omit<LLMResult, 'attempts'>> {
  if (!env.OPENROUTER_API_KEY) throw new LLMError(503, 'OPENROUTER_API_KEY not set');
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
  // Auto provider-pinning was removed: pinning DeepSeek's own endpoint is
  // cheap when it's healthy, but during congestion the cascade lands on
  // rate-limited providers and worsens latency. OpenRouter's default routing
  // picks the lowest-latency healthy provider. Re-enable on a per-call basis
  // via opts.provider when explicitly choosing cost-over-speed.
  const explicitProvider = (opts as { provider?: unknown }).provider;
  if (explicitProvider) {
    body.provider = explicitProvider;
  }

  const url = openRouterGatewayUrl(env);
  // One AbortController for the whole call (fetch + stream drain). On timeout,
  // every subsequent fetch retry inside runWithRetry will also abort instantly
  // — so the inner retry loop short-circuits after ~15s of backoff sleeps
  // instead of looping forever on a wedged endpoint.
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
        // AbortError → re-throw as a message that matches RETRYABLE so
        // runLLM's fallback chain treats it as transient and tries the next
        // model. (RETRYABLE looks for "fetch failed" / "network".)
        // workerd's fetch doesn't reliably set err.name = 'AbortError' the
        // way Node/undici does — check the controller's own state as the
        // authoritative signal that WE aborted (not some other transport
        // failure that happens to share an error class).
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') {
          throw new LLMError(408, `fetch failed: OpenRouter call aborted after ${OPENROUTER_CALL_TIMEOUT_MS}ms`);
        }
        throw err;
      }
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new LLMError(r.status, `OpenRouter HTTP ${r.status}: ${text.slice(0, 500)}`);
      }
      return r;
    });

    if (opts.stream) {
      if (!resp.body) throw new LLMError(500, 'OpenRouter stream returned empty body');
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
        // The body stream errors on AbortError when the controller fires
        // mid-stream — surface it as a retryable transport failure.
        // workerd's fetch doesn't reliably set err.name = 'AbortError' the
        // way Node/undici does — check the controller's own state as the
        // authoritative signal that WE aborted (not some other transport
        // failure that happens to share an error class).
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') {
          throw new LLMError(408, `fetch failed: OpenRouter stream aborted after ${OPENROUTER_CALL_TIMEOUT_MS}ms`);
        }
        throw err;
      }
    }

    // resp.json() reads the body stream — if the abort fires mid-read the
     // stream errors out, surface as retryable transport failure rather than
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
        throw new LLMError(408, `fetch failed: OpenRouter body read aborted after ${OPENROUTER_CALL_TIMEOUT_MS}ms`);
      }
      throw err;
    }
    const content = json.choices?.[0]?.message?.content ?? '';
    const reasoning =
      json.choices?.[0]?.message?.reasoning_content ??
      json.choices?.[0]?.message?.reasoning ??
      '';
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

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
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
    try { await reader.cancel(); } catch { /* already closed */ }
  }

  return { content, reasoning_content: reasoning, finish_reason: finish, usage };
}
