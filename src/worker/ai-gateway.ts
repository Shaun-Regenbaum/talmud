/**
 * AI Gateway wrapper. Routes ALL Workers AI calls through Cloudflare's AI
 * Gateway (slug: "talmud") for prompt caching, observability, and retry.
 *
 * The gateway lives on the same PropheX account as the worker, so we use the
 * Workers AI binding's built-in `gateway` option — no API token, no extra
 * secret, just a routing hint. The binding handles auth as before; the
 * gateway adds:
 *   - 7-day prompt cache (repeated daf views become free + instant)
 *   - per-request logs visible at dash.cloudflare.com → AI → AI Gateway
 *   - this wrapper layers exponential-backoff retry on 1031 / 3046 / 5xx
 *
 * Mechanism: wrapEnv() returns env with env.AI replaced by a Proxy whose
 * .run() injects { gateway: { id } } and retries transient failures. Every
 * existing call site (env.AI.run, runKimiStreaming, runGenerationsModel,
 * etc.) routes through the gateway with zero code changes.
 *
 * Setup (one-time):
 *   1. Gateway "talmud" already exists on PropheX (created via MCP).
 *   2. Set AI_GATEWAY_ID = "talmud" in wrangler.toml [vars] (already done).
 *   3. Deploy.
 *
 * Emergency disable: set AI_GATEWAY_DISABLE = "1" to bypass the proxy and
 * fall back to direct binding without redeploying code.
 */

import { isRetryable } from './llm-error';

export interface AiGatewayEnv {
  AI?: Ai;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_DISABLE?: string;
}

// Retry/fallback classification now lives on the error itself (see ./llm-error):
// LLMError carries `retryable` / `fallbackWorthy`, and isRetryable() /
// isFallbackWorthy() also handle foreign throwables. runWithRetry retries only
// same-model transient transport failures (isRetryable); a stalled or timed-out
// model is recovered by switching MODELS (runLLM + isFallbackWorthy), not by
// hammering the same one.
//
// MAX_ATTEMPTS bumped 3 → 5 to ride out transient OpenRouter / gateway 5xx
// bursts. Backoff is exponential (1s, 2s, 4s, 8s, 16s) + 0–500ms jitter; total
// worst-case wait ≈31s before giving up — fits inside the queue consumer's 90s
// budget and matches how upstream provider outages typically clear in 5–15s.
const MAX_ATTEMPTS = 5;

export function gatewayActive(env: AiGatewayEnv): boolean {
  if (env.AI_GATEWAY_DISABLE === '1') return false;
  return Boolean(env.AI && env.AI_GATEWAY_ID);
}

export interface GatewayStatus {
  active: boolean;
  disabled: boolean;
  gatewayId: string | null;
}

export function gatewayStatus(env: AiGatewayEnv): GatewayStatus {
  return {
    active: gatewayActive(env),
    disabled: env.AI_GATEWAY_DISABLE === '1',
    gatewayId: env.AI_GATEWAY_ID ?? null,
  };
}

function backoffMs(attempt: number): number {
  return 1000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
}

// Interruptible delay: resolves after `ms`, or rejects immediately if `signal`
// aborts first. Without this the backoff between retries blocks even after the
// caller has given up (e.g. callOpenRouterGateway's hard-timeout controller has
// already fired) — wasting up to a full backoff interval before noticing.
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function runWithRetry<T>(perform: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await perform();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) throw err;
      await delay(backoffMs(attempt), signal);
    }
  }
  throw lastErr;
}

/**
 * Returns env unchanged when the gateway is inactive. Otherwise returns a
 * shallow clone with env.AI replaced by a Proxy that injects the gateway
 * option on every .run() and wraps it in a retry loop. Other Ai methods
 * pass through to the underlying binding.
 */
export function wrapEnv<E extends AiGatewayEnv>(env: E): E {
  if (!env.AI || !gatewayActive(env)) return env;
  const realAi = env.AI;
  const gatewayId = env.AI_GATEWAY_ID as string;
  const proxiedAi = new Proxy(realAi, {
    get(target, prop, receiver) {
      if (prop === 'run') {
        return (modelId: unknown, params: unknown, options?: Record<string, unknown>) => {
          const merged = { ...(options ?? {}), gateway: { id: gatewayId } };
          return runWithRetry(() => realAi.run(modelId as never, params as never, merged as never));
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Ai;
  return { ...env, AI: proxiedAi };
}
