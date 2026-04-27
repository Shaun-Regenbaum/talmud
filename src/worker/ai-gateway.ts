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
 * runEraLlmModel, etc.) routes through the gateway with zero code changes.
 *
 * Setup (one-time):
 *   1. Gateway "talmud" already exists on PropheX (created via MCP).
 *   2. Set AI_GATEWAY_ID = "talmud" in wrangler.toml [vars] (already done).
 *   3. Deploy.
 *
 * Emergency disable: set AI_GATEWAY_DISABLE = "1" to bypass the proxy and
 * fall back to direct binding without redeploying code.
 */

export interface AiGatewayEnv {
  AI?: Ai;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_DISABLE?: string;
}

const RETRYABLE = /1031|InferenceUpstreamError|3046|AiError 3046|HTTP 5\d\d|HTTP 429|fetch failed|network/i;
const MAX_ATTEMPTS = 3;

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

async function runWithRetry<T>(perform: () => Promise<T>): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await perform();
    } catch (err) {
      lastErr = err;
      const detail = String((err as Error)?.message ?? err);
      if (!RETRYABLE.test(detail) || attempt === MAX_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
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
