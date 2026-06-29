/**
 * @corpus/ui — shared "AI features unavailable" status signal.
 *
 * A module-level Solid signal both apps (talmud, tanach) drive when an AI call
 * comes back paused (out of credits, daily/hourly cost cap, provider blip). The
 * <AiStatusBanner/> reads it; the apps' fetch error handling flips it via
 * `noteAiResponse(json)` (which recognises the worker's `{ aiUnavailable, reason }`
 * envelope) or `reportAiUnavailable(reason)` directly. One module instance per
 * app bundle, so every importer in an app shares the same banner state.
 *
 * The reason vocabulary mirrors `@corpus/core/llm/ai-status` — kept as a plain
 * string union here so the UI package needs no dependency on core.
 */

import { createSignal } from 'solid-js';

export type AiUnavailableReason =
  | 'credits'
  | 'daily-cap'
  | 'hourly-cap'
  | 'cost-control'
  | 'rate-limit'
  | 'provider';

export interface AiStatus {
  reason: AiUnavailableReason;
  /** Epoch ms this status was reported. */
  at: number;
}

/** The worker error envelope the AI routes emit on a paused call. The banner
 *  derives its "back tomorrow / within the hour" hint from `reason` alone, so no
 *  lift-time field travels in the contract (talmud's legacy `retryAfter` seconds
 *  field is unrelated and stays on its own pause responses). */
export interface AiUnavailableEnvelope {
  aiUnavailable?: boolean;
  reason?: AiUnavailableReason;
  error?: string;
}

const [status, setStatus] = createSignal<AiStatus | null>(null);

/** Once the user closes the banner, stay quiet until AI demonstrably recovers
 *  (a later successful AI call calls `noteAiSuccess`). Not reactive — it only
 *  gates whether a fresh failure is allowed to re-open the banner. */
let dismissed = false;

/** When the last failure was reported (epoch ms). A success only CLEARS the
 *  banner once it has been failure-free for this grace window — otherwise the
 *  reader's parallel card fan-out (some cards cached-OK, some 402) would flicker
 *  the banner as successes and failures resolve within a second of each other.
 *  After genuine recovery (a new daf with no failures) the next success clears. */
let lastFailureAt = 0;
const RECOVERY_GRACE_MS = 4000;

/** Reactive accessor for the current AI-unavailable status (or null). */
export const aiStatus = status;

/** Flip the banner on for a known reason. No-op while the user has it dismissed
 *  (until `noteAiSuccess` resets that). */
export function reportAiUnavailable(reason: AiUnavailableReason): void {
  lastFailureAt = Date.now();
  if (dismissed) return;
  setStatus({ reason, at: Date.now() });
}

/**
 * Inspect a parsed response body; if it is the worker's AI-unavailable envelope,
 * raise the banner and return true. Safe to call on every failed AI fetch.
 */
export function noteAiResponse(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const e = body as AiUnavailableEnvelope;
  if (e.aiUnavailable && e.reason) {
    reportAiUnavailable(e.reason);
    return true;
  }
  return false;
}

/** AI worked — re-arm the banner for future failures, and clear it once AI has
 *  recovered (no failure within the grace window). The grace check stops a
 *  near-simultaneous success from clearing a banner a parallel failure just
 *  raised. Call on any successful AI response. */
export function noteAiSuccess(): void {
  dismissed = false;
  if (status() !== null && Date.now() - lastFailureAt > RECOVERY_GRACE_MS) setStatus(null);
}

/** User closed the banner: hide it and keep it hidden until AI recovers. */
export function dismissAiStatus(): void {
  dismissed = true;
  setStatus(null);
}
