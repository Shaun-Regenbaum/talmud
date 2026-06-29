/**
 * Classify a failed LLM call into a user-facing "AI features unavailable" reason.
 *
 * Both apps (talmud, tanach) funnel every paid call through the same `runLLM`
 * chokepoint, which throws typed errors: a `BudgetPausedError` when our own
 * cost-cap guard trips (daily / hourly), or a plain `LLMError` carrying the
 * provider's HTTP status — notably 402 when the prepaid OpenRouter balance runs
 * dry. A route can call `classifyAiUnavailable(err)` to decide whether a failure
 * is a "we paused AI to control spend" state (worth a clear banner + a stable
 * `{ aiUnavailable, reason }` envelope) versus an ordinary bug (which should keep
 * surfacing as a 500/502). The reader-facing banner copy lives in @corpus/ui,
 * keyed by the same `reason`; this module only owns the classification + a
 * neutral one-liner for the JSON envelope.
 */

import { BudgetPausedError } from './budget';
import { LLMError } from './llm-error';

export type AiUnavailableReason =
  | 'credits' // OpenRouter prepaid balance exhausted (HTTP 402)
  | 'daily-cap' // our daily spend cap reached (BudgetPausedError scope 'all')
  | 'hourly-cap' // our hourly custom-question cap reached (scope 'custom')
  | 'rate-limit' // provider 429 (not our cap) — transient overload
  | 'provider'; // provider 5xx / upstream outage — transient

export interface AiUnavailable {
  reason: AiUnavailableReason;
  /** Epoch ms when the pause is expected to lift. Set for our budget caps
   *  (we know the bucket rollover); unknown for credits/provider failures. */
  retryAfter?: number;
}

// The provider returns 402 with an "Insufficient credits" body when out of
// credits. We key off the typed status first; this regex is the fallback for
// foreign throwables whose status we never captured (raw fetch / re-wrapped
// messages) — the one signal we must not miss.
const CREDITS_RE =
  /insufficient credits|out of credits|requires more credits|add more (credits|using)/i;

/**
 * Map an error to an AI-unavailable reason, or `null` when it is an ordinary
 * failure (a real bug, a 4xx that isn't payment, a malformed request) that
 * should NOT be dressed up as a friendly "AI paused" banner.
 */
export function classifyAiUnavailable(err: unknown): AiUnavailable | null {
  // Our own cost-cap guard — typed, and it knows when the pause lifts.
  if (err instanceof BudgetPausedError) {
    return {
      reason: err.scope === 'custom' ? 'hourly-cap' : 'daily-cap',
      retryAfter: err.until,
    };
  }
  if (err instanceof LLMError) {
    if (err.status === 402 || CREDITS_RE.test(err.message)) return { reason: 'credits' };
    if (err.status === 429) return { reason: 'rate-limit' };
    if (err.status >= 500) return { reason: 'provider' };
    return null; // other 4xx: client/config error, not a spend pause
  }
  // Foreign throwable (raw fetch / provider body re-thrown without a status):
  // last-resort sniff for the out-of-credits signal only.
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (CREDITS_RE.test(msg)) return { reason: 'credits' };
  return null;
}

export function isAiUnavailable(err: unknown): boolean {
  return classifyAiUnavailable(err) !== null;
}

/**
 * Neutral, corpus-agnostic one-liner for the JSON error envelope's `error`
 * field. The banner in @corpus/ui renders richer, sponsor-aware copy from the
 * same `reason`; this is the plain-text fallback (logs, non-UI clients, the
 * inline message a card shows before the banner mounts).
 */
export function aiUnavailableMessage(reason: AiUnavailableReason): string {
  switch (reason) {
    case 'credits':
      return 'AI features are paused — the project is out of AI credits right now.';
    case 'daily-cap':
      return "AI features are paused — today's AI budget has been reached. They'll be back tomorrow.";
    case 'hourly-cap':
      return "AI features are paused — this hour's AI budget has been reached. Try again shortly.";
    case 'rate-limit':
      return 'AI features are busy right now. Please try again in a moment.';
    case 'provider':
      return 'AI features are temporarily unavailable. Please try again shortly.';
  }
}
