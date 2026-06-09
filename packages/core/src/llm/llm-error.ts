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
