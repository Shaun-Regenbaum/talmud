/**
 * Typed LLM error + failure classification.
 *
 * Whether a failure is worth retrying or failing over is a *property of the
 * error*, not a regex on its `.message`. Errors we construct (`LLMError`) carry
 * their own `retryable` / `fallbackWorthy` flags, set at the throw site. For
 * foreign throwables — raw fetch / workerd / Workers-AI binding errors we did
 * NOT construct — we fall back to message matching, confined to
 * `classifyForeignError` below. That is the only place stringly-typed matching
 * survives, and it only ever sees errors whose shape we don't own.
 *
 *   retryable      — worth retrying the SAME model/endpoint: a genuine transient
 *                    transport blip (5xx, 429, Workers-AI 1031/3046, network).
 *   fallbackWorthy — worth handing off to the NEXT model in the chain. Everything
 *                    retryable, plus timeouts/aborts: a stalled model is recovered
 *                    by switching models, not by hammering the same one (so a
 *                    timeout is fallbackWorthy but NOT retryable).
 */
export interface FailureClass {
  retryable: boolean;
  fallbackWorthy: boolean;
}

/** Config / client errors (4xx, missing binding): surface immediately. */
export const NEITHER: FailureClass = { retryable: false, fallbackWorthy: false };
/** Transient transport failure (5xx / 429 / network): retry same model, then fall over. */
export const TRANSIENT: FailureClass = { retryable: true, fallbackWorthy: true };
/** Timeout / abort: don't re-hit the same stalled endpoint, but do fail over. */
export const TIMEOUT: FailureClass = { retryable: false, fallbackWorthy: true };
/** The API key or prepaid balance refused to spend. Do not retry that
 *  credential (another attempt fails the same way). A later model on a
 *  different provider may still succeed — see nextFallbackIndex. */
export const SWITCH_PROVIDER: FailureClass = { retryable: false, fallbackWorthy: true };

// OpenRouter's own wording for "this key / this balance cannot spend". A bare
// 403 (real auth failure) must not match. Kept here, next to the retry
// decision, so the transport does not import the reader-facing classifier.
const SHARED_CREDENTIAL_RE =
  /key limit exceeded|insufficient credits|out of credits|requires more credits|add more (credits|using)/i;

export class LLMError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly fallbackWorthy: boolean;
  constructor(status: number, message: string, opts?: { cls?: FailureClass; cause?: unknown }) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
    const cls = opts?.cls ?? classifyStatus(status);
    this.retryable = cls.retryable;
    this.fallbackWorthy = cls.fallbackWorthy;
    if (opts?.cause !== undefined) this.cause = opts.cause;
  }
}

/**
 * Default classification from an HTTP-ish status, used when the caller doesn't
 * pass one explicitly: 429 + 5xx are transient; everything else (4xx) surfaces
 * immediately. Callers pass `TIMEOUT` explicitly for hard-timeout / abort 408s,
 * and `NEITHER` for misconfiguration errors that happen to use a 5xx status
 * (e.g. a missing binding — retrying or failing over won't fix config).
 */
export function classifyStatus(status: number): FailureClass {
  if (status === 429 || status >= 500) return TRANSIENT;
  return NEITHER;
}

// Message matching for FOREIGN errors only — raw fetch / workerd / Workers-AI
// throwables we didn't construct. Workers AI surfaces 1031 / 3046 /
// InferenceUpstreamError inside the message; fetch surfaces "fetch failed" /
// network. Mirrors the semantics of the old exported RETRYABLE / FALLBACK_WORTHY
// regexes, now confined to errors whose shape we don't own.
const FOREIGN_RETRYABLE =
  /1031|InferenceUpstreamError|3046|AiError 3046|HTTP 5\d\d|HTTP 429|fetch failed|network/i;
const FOREIGN_TIMEOUT = /aborted|timed-out|timed out|timeout/i;

export function classifyForeignError(err: unknown): FailureClass {
  const detail = String((err as { message?: unknown } | null)?.message ?? err);
  const retryable = FOREIGN_RETRYABLE.test(detail);
  const fallbackWorthy = retryable || FOREIGN_TIMEOUT.test(detail);
  return { retryable, fallbackWorthy };
}

/** Worth retrying the same model/endpoint. */
export function isRetryable(err: unknown): boolean {
  return err instanceof LLMError ? err.retryable : classifyForeignError(err).retryable;
}

/** Worth handing off to the next model in the fallback chain. */
export function isFallbackWorthy(err: unknown): boolean {
  return err instanceof LLMError ? err.fallbackWorthy : classifyForeignError(err).fallbackWorthy;
}

/** OpenRouter refused because this key, or the prepaid balance behind it,
 *  cannot spend. Status 402 is that refusal even when the body is empty.
 *  The message covers a 403/429 that says "Key limit exceeded" — a bare 403
 *  does not match. */
export function isSharedCredentialFailure(err: unknown): boolean {
  if (err instanceof LLMError && err.status === 402) return true;
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return SHARED_CREDENTIAL_RE.test(msg);
}

/** Class for an OpenRouter HTTP failure. A key cap or an empty balance is not
 *  retried — the next call on that key fails the same way — but it is worth
 *  handing to a different provider. */
export function openRouterFailureClass(status: number, body: string): FailureClass {
  if (status === 402 || SHARED_CREDENTIAL_RE.test(body)) return SWITCH_PROVIDER;
  return classifyStatus(status);
}

/** OpenRouter models share one API key. Workers AI (`@cf/`) does not. */
export function sameModelProvider(a: string, b: string): boolean {
  const provider = (id: string) =>
    id.startsWith('@cf/') ? 'workers-ai' : id.startsWith('openrouter/') ? 'openrouter' : 'other';
  return provider(a) === provider(b);
}

/** Next chain index after `failedAt`, or -1 to surface `err`.
 *  A shared-credential refusal skips every later model on that same
 *  credential instead of calling them. Any other fallback-worthy error walks
 *  to the immediate next model, including one on the same provider (a stalled
 *  model is not a dead key). */
export function nextFallbackIndex(
  chain: readonly string[],
  failedAt: number,
  err: unknown,
): number {
  if (!isFallbackWorthy(err)) return -1;
  const skipSame = isSharedCredentialFailure(err);
  for (let j = failedAt + 1; j < chain.length; j++) {
    if (skipSame && sameModelProvider(chain[failedAt] ?? '', chain[j] ?? '')) continue;
    return j;
  }
  return -1;
}
