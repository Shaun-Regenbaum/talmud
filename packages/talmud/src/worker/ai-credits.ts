/**
 * Authoritative "is AI spending available" gate for the cold-generation entry
 * paths (`POST /api/daf-generate`, the cold-miss branch of `POST /api/run`).
 *
 * WHY THIS EXISTS. The `ai-down` sentinel (ai-down.ts) is REACTIVE: it is only
 * written after a job has actually failed with a 402, and it self-expires on a
 * 5-minute TTL. That is the right shape for a transient blip, but it has a hole
 * for the recurring case — the prepaid OpenRouter balance running dry. In any
 * quiet window (no generation churning failures for >5 min) the sentinel is
 * absent, so `/api/daf-generate` happily answers `{ generating: true }` and
 * kicks off a Workflow that is doomed to 402 every step. The reader, having
 * seen `generating: true`, sits in view-driven polling for up to 12 minutes
 * with NO "AI paused" banner — the exact "load bar completes but the sections
 * spin forever" symptom.
 *
 * THE FIX. Consult the ACTUAL account balance (cached, best-effort) at the gate,
 * so out-of-credits is known BEFORE we spawn a doomed generation — not
 * discovered by failing. A positive balance is likewise authoritative: it clears
 * a stale `credits` sentinel so a top-up recovers within the cache TTL instead
 * of waiting out the 5-minute sentinel. The balance probe never BLOCKS on its
 * own uncertainty: an unknown balance (no provisioning key, a fetch error, a
 * timeout) defers entirely to the reactive sentinel — today's behaviour, no
 * regression.
 *
 * The balance is cached in KV (short TTL) so a reader burst costs at most ~one
 * OpenRouter call per minute; every other request is a single KV read.
 */

import { type AiDownState, clearAiDown, noteAiDown, readAiDown } from './ai-down';
import { fetchOpenRouterBalance } from './openrouter-cost';

interface CreditsEnv {
  CACHE?: KVNamespace;
  OPENROUTER_PROVISIONING_KEY?: string;
}

const AI_CREDITS_KEY = 'ai-credits:v1';
const CREDITS_TTL_S = 60;

/** Pause a hair before absolute zero. A daf costs a few cents to generate;
 *  starting one we cannot finish leaves half-empty cards, and a small floor also
 *  absorbs the lag between this cached read and the balance actually moving. */
const MIN_USABLE_USD = 0.1;

export interface CreditsState {
  /** Authoritatively out of spendable credits (balance known and at/below the floor). */
  out: boolean;
  /** Spendable USD (`total_credits - total_usage`), or `null` when unknown. */
  remaining: number | null;
  /** Epoch ms the balance was OBSERVED — the cache row's fetch time for a cached
   *  read, `now` for a fresh probe; `null` when unknown. The caller compares this
   *  against a sentinel's raise time so a STALE positive reading can't clear a
   *  sentinel raised after the balance was last measured. */
  at: number | null;
}

interface CreditsCacheRow {
  remaining: number;
  at: number;
}

const UNKNOWN_CREDITS: CreditsState = { out: false, remaining: null, at: null };

/**
 * Best-effort spendable-balance read, KV-cached for {@link CREDITS_TTL_S}.
 * Unknown (no provisioning key, fetch/timeout error, corrupt cache, or an
 * unexpected `/credits` shape) returns {@link UNKNOWN_CREDITS} — a flaky balance
 * probe must never masquerade as "out of credits".
 */
export async function getCreditsState(env: CreditsEnv): Promise<CreditsState> {
  const cache = env.CACHE;
  if (cache) {
    try {
      const raw = await cache.get(AI_CREDITS_KEY);
      if (raw) {
        const row = JSON.parse(raw) as CreditsCacheRow | null;
        if (row && typeof row.remaining === 'number' && typeof row.at === 'number')
          return { out: row.remaining <= MIN_USABLE_USD, remaining: row.remaining, at: row.at };
      }
    } catch {
      /* fall through to a fresh probe */
    }
  }
  const bal = await fetchOpenRouterBalance(env);
  if (!bal.ok || typeof bal.remaining !== 'number') return UNKNOWN_CREDITS;
  const remaining = bal.remaining;
  const at = Date.now();
  if (cache) {
    try {
      await cache.put(AI_CREDITS_KEY, JSON.stringify({ remaining, at }), {
        expirationTtl: CREDITS_TTL_S,
      });
    } catch {
      /* best-effort — the gate still returns the fresh value below */
    }
  }
  return { out: remaining <= MIN_USABLE_USD, remaining, at };
}

/**
 * The gate the cold-generation entry paths call in place of a bare
 * `readAiDown`. Returns the same `AiDownState | null` contract, but is
 * authoritative rather than purely reactive:
 *
 *  - Out of credits (balance known, at/below floor): raise a `credits` sentinel
 *    if one isn't already up — so every other plain `readAiDown` gate (SWR
 *    recompute, the queue consumer) lights up too — and report down.
 *  - Healthy balance (known, above floor) with a lingering `credits` sentinel
 *    that predates the balance reading: someone topped up; clear it so recovery
 *    is prompt. A sentinel raised AFTER our (possibly cached) balance reading is
 *    NEWER information — a real 402 that landed since the balance was measured —
 *    so it stands; otherwise a stale positive cache would delete a fresh
 *    sentinel and reopen the gate to doomed jobs.
 *  - Anything else (unknown balance, or a non-credits sentinel a healthy balance
 *    cannot disprove): defer to whatever the sentinel says.
 */
export async function resolveAiDown(env: CreditsEnv): Promise<AiDownState | null> {
  const cache = env.CACHE;
  const [down, credits] = await Promise.all([readAiDown(cache), getCreditsState(env)]);

  if (credits.out) {
    if (!down) await noteAiDown(cache, 'credits');
    return down ?? { reason: 'credits', at: Date.now() };
  }

  // Authoritatively healthy balance disproves a `credits` pause specifically —
  // NOT a `key-limit` (credits exist but the key's own cap tripped) nor a
  // transient `rate-limit`/`provider` blip, which a balance says nothing about —
  // and ONLY when the balance was observed at/after the sentinel rose (else a
  // 402 that fired since our cached reading would be wrongly cleared).
  if (credits.remaining !== null && credits.at !== null && down?.reason === 'credits') {
    if (down.at <= credits.at) {
      // clearAiDown re-checks this same freshness guard against the live
      // sentinel, so a concurrent newer 402 still survives the delete.
      await clearAiDown(cache, credits.at);
      return null;
    }
    return down; // sentinel is newer than the balance reading — trust it
  }

  return down;
}
