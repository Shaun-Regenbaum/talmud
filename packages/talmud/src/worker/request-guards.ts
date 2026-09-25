// Request trust + spend-pause helpers, moved out of index.ts so route modules
// can use them without importing the worker entry file (which would make a
// cycle). See @corpus/core/llm/budget for the budget guard itself.

import type { BudgetScope } from '@corpus/core/llm/budget';
import type { Bindings } from './types';

/** Constant-time-ish string compare (avoids early-exit timing leaks beyond
 *  length). */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True iff the request carries the STUDIO_SECRET (header `x-studio-secret`, or
 * `Authorization: Bearer <secret>`). Returns FALSE whenever the secret is unset
 * — fail-safe, so the privileged /api/run knobs (ad_hoc, model_override,
 * bypass_cache) and the admin mutation endpoints stay locked until the owner
 * provisions the secret. The public daf app never needs these, so locking them
 * by default doesn't degrade it.
 */
export function isTrustedRequest(c: {
  req: { header: (k: string) => string | undefined };
  env: Bindings;
}): boolean {
  const secret = c.env.STUDIO_SECRET;
  if (!secret) return false;
  const presented =
    c.req.header('x-studio-secret') ??
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  return presented.length > 0 && timingSafeEqualStr(presented, secret);
}

/** Seconds until a pause lifts, for a Retry-After-style hint. */
export function pauseRetryAfterSec(until?: number): number {
  if (!until) return 3600;
  return Math.max(1, Math.ceil((until - Date.now()) / 1000));
}

/** Human fallback message for a paused response. The client maps the `paused`
 *  flag to its own localized copy; this is for non-UI / API consumers. */
export function pauseErrorMessage(scope?: BudgetScope): string {
  return scope === 'custom'
    ? 'Custom-question generation is paused for now (hourly budget reached). Please try again later.'
    : 'AI generation is paused for now (daily budget reached). Please try again tomorrow.';
}

/** Cross-app AI-unavailable fields for a budget pause, derived from scope. Spread
 *  alongside the existing `paused`/`scope`/`retryAfter` so the shared client
 *  banner (@corpus/ui, keyed off `aiUnavailable` + `reason`) lights up too. */
export function pausedAiFields(scope?: BudgetScope) {
  return {
    aiUnavailable: true as const,
    reason: scope === 'custom' ? ('hourly-cap' as const) : ('daily-cap' as const),
  };
}
