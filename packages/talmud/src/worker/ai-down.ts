/**
 * Provider-down circuit breaker (the "ai-down" sentinel).
 *
 * When the LLM provider refuses to spend — out of credits, the API key's own
 * spending cap tripped (the 2026-07 weekly key-limit incident), a rate-limit
 * wave, an upstream outage — every enqueued job is doomed, but without a
 * breaker the system keeps paying for the discovery: /api/run enqueues, the
 * client polls for minutes, deep-warm fans out dozens of children, and the
 * queue churns through failures (25-78s queue waits were observed while the
 * reader's load bar sat stalled mid-daf).
 *
 * The queue consumer writes this short-TTL KV sentinel when a failure
 * classifies as AI-unavailable; the enqueue paths read it and fail fast with
 * the same `{ paused, aiUnavailable, reason }` envelope the budget gate uses,
 * so the client shows the shared "AI paused" banner in one round-trip instead
 * of a silently-stuck progress bar.
 *
 * TTL by severity: a hard spend pause (credits / key-limit) lifts on a human
 * action or a budget reset, so 5 minutes of back-pressure is safe; a transient
 * provider blip (429 / 5xx) gets only 60s so recovery is probed quickly.
 * Trusted explicit runs (bypass_cache / studio re-runs) always go through —
 * they are the recovery probe.
 */

import type { AiUnavailableReason } from '@corpus/core/llm/ai-status';

const AI_DOWN_KEY = 'ai-down:v1';
const HARD_TTL_S = 300;
const SOFT_TTL_S = 60;

export interface AiDownState {
  reason: AiUnavailableReason;
  /** Epoch ms of the failure that raised (or last would have refreshed) it. */
  at: number;
}

/** Spend pauses that cannot self-heal within seconds: nothing succeeds until
 *  credits are added / the key's cap lifts, so queued jobs may be failed
 *  without trying. Budget caps (daily/hourly) never reach the sentinel — the
 *  existing checkBudget gate owns those before anything is enqueued. */
export function isHardAiPause(reason: AiUnavailableReason): boolean {
  return reason === 'credits' || reason === 'key-limit';
}

/** Raise the sentinel after a classified AI-unavailable failure. At most one
 *  write per TTL window — same-key KV writes are rate-limited (1/s), and a
 *  failure storm would otherwise hammer this one key from every consumer —
 *  EXCEPT to upgrade a soft blip to a hard spend pause (a rate-limit sentinel
 *  must not mask a key-limit that surfaces seconds later: the hard reason
 *  carries the longer TTL and the consumer short-circuit). */
export async function noteAiDown(
  cache: KVNamespace | undefined,
  reason: AiUnavailableReason,
): Promise<void> {
  if (!cache) return;
  try {
    const existing = await readAiDown(cache);
    const upgrade = existing && isHardAiPause(reason) && !isHardAiPause(existing.reason);
    if (existing && !upgrade) return;
    const state: AiDownState = { reason, at: Date.now() };
    await cache.put(AI_DOWN_KEY, JSON.stringify(state), {
      expirationTtl: isHardAiPause(reason) ? HARD_TTL_S : SOFT_TTL_S,
    });
  } catch {
    /* best-effort — the breaker is an optimization, never a failure source */
  }
}

/** LLM transports whose fresh success proves the provider recovered.
 *  Deterministic producers ('computed'/'graph'/'lookup') never touch the
 *  provider, so their successes say nothing about it. */
const LLM_TRANSPORTS: ReadonlySet<string> = new Set(['openrouter-gateway', 'workers-ai']);
export function transportProvesAiUp(transport: unknown): boolean {
  return typeof transport === 'string' && LLM_TRANSPORTS.has(transport);
}

/** Lower the sentinel once a fresh LLM generation proves the provider
 *  recovered — the TTL would clear it anyway; this shortens the tail so
 *  readers aren't fail-fasted for minutes after a human fixes the key/credits.
 *  `startedAtMs` is when the succeeding run began: only a sentinel raised
 *  BEFORE that is disproven by the success. A sentinel raised mid-run (a
 *  concurrent failure, possibly a soft→hard upgrade) is newer information and
 *  is left standing — KV has no CAS, so this timestamp check is what keeps a
 *  racing clear from wiping a just-raised hard pause. Read-first also keeps
 *  the healthy path at one KV read, not a same-key delete per job. */
export async function clearAiDown(
  cache: KVNamespace | undefined,
  startedAtMs: number,
): Promise<void> {
  if (!cache) return;
  try {
    const existing = await readAiDown(cache);
    if (existing && existing.at <= startedAtMs) await cache.delete(AI_DOWN_KEY);
  } catch {
    /* best-effort */
  }
}

/** Read the sentinel; expired/missing/corrupt all read as "not down". */
export async function readAiDown(cache: KVNamespace | undefined): Promise<AiDownState | null> {
  if (!cache) return null;
  try {
    const raw = await cache.get(AI_DOWN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as AiDownState | null;
    return v && typeof v.reason === 'string' && typeof v.at === 'number' ? v : null;
  } catch {
    return null;
  }
}
