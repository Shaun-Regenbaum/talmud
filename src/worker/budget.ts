/**
 * LLM spend budget guard. Two independent ceilings, both enforced fail-safe:
 *
 *   - Custom questions: > $10 / rolling hour  -> pause custom Q&A for 1 hour.
 *   - All LLM spend:    > $300 / UTC day       -> pause ALL generation until
 *                                                 the next UTC midnight.
 *
 * Storage is KV (the only primitive this worker has), so accounting is
 * best-effort: KV has no atomic increment and ~60s eventual consistency, and
 * the queue runs 50-way concurrent. We accept a small overshoot and design
 * around it:
 *   - Counters are bucketed by wall-clock window (day / hour) so they expire on
 *     their own -- no cleanup, and a new window always starts at $0.
 *   - A "pause latch" is written the moment a counter crosses its cap. The latch
 *     is the authoritative signal the gate reads, so the decision stays put even
 *     as buckets roll over or a counter read is momentarily stale.
 *   - The daily latch trips at DAILY_SAFETY_FACTOR x cap (default $270, below
 *     the $300 hard cap) to leave headroom for in-flight concurrent jobs whose
 *     cost is only known AFTER they return (we can't pre-charge them). The queue
 *     runs up to 50 jobs at once, so up to ~50 calls can already be past the
 *     gate when the latch trips; the ~$30 of headroom absorbs their cost so
 *     actual spend stays at/under the $300 cap ("never more than $300, ever").
 *
 * Cost per call: OpenRouter returns billed USD in usage.cost; for priced models
 * without it we fall back to pricing.ts list-price estimation; Workers-AI
 * (@cf/*) calls are unpriced and contribute $0 (same as the existing ledger).
 *
 * Enforcement lives at the single chokepoint runLLM() (src/worker/llm.ts):
 * checkBudget() before the call, recordSpend() after. Producer endpoints
 * (qa/ask, run, warm-daf) pre-check too, purely for instant UI feedback
 * and to avoid pointless queue churn.
 */
import { costUsd, type TokenUsage } from './pricing';
import { LLMError, NEITHER } from './llm-error';

/** Minimal Cloudflare Email-send binding (send_email). Structurally compatible
 *  with the one in warm-cron.ts and the EMAIL binding in wrangler.toml. */
export interface EmailBinding {
  send(message: { to: string; from: string; subject: string; html?: string; text?: string }): Promise<{ messageId: string }>;
}

/** Env surface budget functions need. Bindings / LLMEnv both satisfy this. */
export interface BudgetEnv {
  CACHE?: KVNamespace;
  /** Per-deploy override for the daily hard cap (USD). Defaults to 300. */
  DAILY_BUDGET_USD?: string;
  /** Per-deploy override for the hourly custom-question cap (USD). Defaults to 10. */
  HOURLY_CUSTOM_BUDGET_USD?: string;
  /** Cloudflare send_email binding. When present, recordSpend emails an alert
   *  (deduped per window) the first time a daily/hourly cap trips. */
  EMAIL?: EmailBinding;
}

export type BudgetScope = 'all' | 'custom';

const PREFIX = 'budget:v1:';
const TOTAL_BUCKET = `${PREFIX}total:`; // + YYYYMMDD (UTC)
const CUSTOM_BUCKET = `${PREFIX}custom:`; // + YYYYMMDDHH (UTC)
const PAUSE_ALL = `${PREFIX}pause:all`;
const PAUSE_CUSTOM = `${PREFIX}pause:custom`;
// Dedup flags so a tripped cap emails at most once per window (the daily latch
// re-arms on every subsequent call; the queue runs 50-way concurrent).
const ALERTED_DAILY = `${PREFIX}alerted:daily:`; // + YYYYMMDD (UTC)
const ALERTED_CUSTOM = `${PREFIX}alerted:custom:`; // + YYYYMMDDHH (UTC)

// Spend-alert recipient + sender. `to` must be a verified Cloudflare Email
// Routing destination address; `from` must be on a zone we control.
const ALERT_TO = 'shaunregenbaum@gmail.com';
const ALERT_FROM = 'budget-alert@shaunregenbaum.com';
const APP_URL = 'https://talmud.shaunregenbaum.com';

// Daily counter must outlive its day enough to catch late-arriving cost from a
// long job that started yesterday; the hourly counter only needs its window
// plus slack. Both far shorter than the 7-day per-call ledger in llm.ts.
const TOTAL_TTL_S = 48 * 3600;
const CUSTOM_TTL_S = 3 * 3600;

const DEFAULT_DAILY_CAP_USD = 300;
const DEFAULT_HOURLY_CUSTOM_CAP_USD = 10;
// Trip the daily pause at 90% of the cap. The remaining 10% is headroom for
// jobs already past the gate when the latch trips (see file header).
const DAILY_SAFETY_FACTOR = 0.9;
const HOUR_MS = 3_600_000;

type UsageWithCost = (TokenUsage & { cost?: number }) | null | undefined;

interface PauseLatch {
  until: number;
  reason: string;
  spentUsd: number;
}

export interface BudgetDecision {
  ok: boolean;
  scope?: BudgetScope;
  /** Epoch ms when the pause lifts (next hour for custom, next UTC midnight for all). */
  until?: number;
  reason?: string;
}

function positiveNum(s: string | undefined, fallback: number): number {
  const n = s == null ? NaN : Number(s);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function dailyCap(env: BudgetEnv): number {
  return positiveNum(env.DAILY_BUDGET_USD, DEFAULT_DAILY_CAP_USD);
}
function dailyTrip(env: BudgetEnv): number {
  return dailyCap(env) * DAILY_SAFETY_FACTOR;
}
function hourlyCustomCap(env: BudgetEnv): number {
  return positiveNum(env.HOURLY_CUSTOM_BUDGET_USD, DEFAULT_HOURLY_CUSTOM_CAP_USD);
}

function dayBucket(now: number): string {
  // "2026-05-27T19:43:27.000Z" -> "20260527"
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
}
function hourBucket(now: number): string {
  // "2026-05-27T19:43:27.000Z" -> "2026052719"
  return new Date(now).toISOString().slice(0, 13).replace(/[-T]/g, '');
}
function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** USD for one call: billed cost wins, else list-price estimate, else 0. */
export function computeSpendUsd(model: string | null | undefined, usage: UsageWithCost): number {
  const billed = usage?.cost;
  if (typeof billed === 'number' && billed >= 0) return billed;
  const est = costUsd(model, usage);
  return typeof est === 'number' && est >= 0 ? est : 0;
}

async function readCounter(cache: KVNamespace, key: string): Promise<number> {
  const raw = await cache.get(key);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function bumpCounter(cache: KVNamespace, key: string, delta: number, ttlS: number): Promise<number> {
  // Best-effort read-add-write. Under concurrency a lost write undercounts,
  // delaying (never falsely tripping) the pause -- checkBudget's defensive
  // re-derivation closes that gap before the next call spends.
  const prev = await readCounter(cache, key);
  const next = prev + delta;
  await cache.put(key, String(next), { expirationTtl: ttlS });
  return next;
}

async function readLatch(cache: KVNamespace, key: string, now: number): Promise<PauseLatch | null> {
  const raw = await cache.get(key);
  if (!raw) return null;
  try {
    const l = JSON.parse(raw) as PauseLatch;
    if (l && typeof l.until === 'number' && l.until > now) return l;
  } catch {
    /* corrupt latch -> treat as absent */
  }
  return null;
}

async function armLatch(cache: KVNamespace, key: string, latch: PauseLatch, now: number): Promise<void> {
  const ttl = Math.max(60, Math.ceil((latch.until - now) / 1000));
  await cache.put(key, JSON.stringify(latch), { expirationTtl: ttl });
}

/** Best-effort: send a spend alert, swallowing any failure. A send needs a
 *  verified destination (see ALERT_TO) — until then it just logs and returns. */
async function sendBudgetAlert(env: BudgetEnv, subject: string, text: string): Promise<void> {
  const email = env.EMAIL;
  if (!email) return;
  try {
    await email.send({ from: ALERT_FROM, to: ALERT_TO, subject, text });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[budget] alert email failed:', err);
  }
}

/** Send `subject`/`text` at most once per window. Sets the dedup flag BEFORE
 *  sending so a concurrent crosser skips; under KV's ~60s consistency a burst
 *  may still emit a couple duplicate alerts, which is acceptable. */
async function alertOnce(
  cache: KVNamespace, flagKey: string, ttlS: number, env: BudgetEnv, subject: string, text: string,
): Promise<void> {
  if (await cache.get(flagKey)) return;
  await cache.put(flagKey, '1', { expirationTtl: ttlS });
  await sendBudgetAlert(env, subject, text);
}

/**
 * Record a completed call's spend. Bumps the daily total (always) and the
 * hourly custom bucket (when custom), arming the matching pause latch when a
 * counter crosses its trip point. Never throws -- a ledger hiccup must not fail
 * a call that already succeeded.
 */
export async function recordSpend(
  env: BudgetEnv,
  args: { model: string | null | undefined; usage: UsageWithCost; custom: boolean },
  now: number = Date.now(),
): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;
  const usd = computeSpendUsd(args.model, args.usage);
  if (usd <= 0) return; // unpriced (@cf/*) calls don't move the needle
  try {
    const total = await bumpCounter(cache, `${TOTAL_BUCKET}${dayBucket(now)}`, usd, TOTAL_TTL_S);
    if (total >= dailyTrip(env)) {
      const until = nextUtcMidnight(now);
      await armLatch(cache, PAUSE_ALL, {
        until,
        reason: `daily spend $${total.toFixed(2)} reached trip $${dailyTrip(env).toFixed(2)} (cap $${dailyCap(env)})`,
        spentUsd: total,
      }, now);
      await alertOnce(
        cache, `${ALERTED_DAILY}${dayBucket(now)}`, Math.max(60, Math.ceil((until - now) / 1000) + 300), env,
        `[talmud] Daily LLM spend paused — $${total.toFixed(2)}`,
        `Daily LLM spend reached $${total.toFixed(2)} (trip $${dailyTrip(env).toFixed(2)}, hard cap $${dailyCap(env)}).\n` +
        `ALL AI generation is now paused until the next UTC midnight (${new Date(until).toISOString()}).\n\n` +
        `If this is unexpected, check for runaway/abusive usage.\n\n` +
        `Budget status: ${APP_URL}/api/admin/budget\nUsage dashboard: ${APP_URL}/usage\n`,
      );
    }
    if (args.custom) {
      const spent = await bumpCounter(cache, `${CUSTOM_BUCKET}${hourBucket(now)}`, usd, CUSTOM_TTL_S);
      if (spent >= hourlyCustomCap(env)) {
        await armLatch(cache, PAUSE_CUSTOM, {
          until: now + HOUR_MS,
          reason: `custom-question spend $${spent.toFixed(2)} reached cap $${hourlyCustomCap(env)} this hour`,
          spentUsd: spent,
        }, now);
        await alertOnce(
          cache, `${ALERTED_CUSTOM}${hourBucket(now)}`, 3600 + 300, env,
          `[talmud] Hourly custom-question spend cap hit — $${spent.toFixed(2)}`,
          `Custom-question spend hit $${spent.toFixed(2)} (cap $${hourlyCustomCap(env)}) within the hour ${hourBucket(now)} UTC.\n` +
          `Custom Q&A is paused for the rest of the hour. A sudden hit here often means someone is hammering custom questions to use the LLM.\n\n` +
          `Budget status: ${APP_URL}/api/admin/budget\nUsage dashboard: ${APP_URL}/usage\n`,
        );
      }
    }
  } catch {
    /* best-effort accounting */
  }
}

/**
 * Decide whether a call may proceed. The daily 'all' pause overrides everything;
 * the hourly 'custom' pause only blocks custom-question calls. Reads the sticky
 * latches first (O(1)), then defensively re-derives from the bucket counter so a
 * lost latch write still blocks before the next call spends. Fail-open only when
 * there is no cache binding at all.
 */
export async function checkBudget(
  env: BudgetEnv,
  args: { custom: boolean },
  now: number = Date.now(),
): Promise<BudgetDecision> {
  const cache = env.CACHE;
  if (!cache) return { ok: true };

  const all = await readLatch(cache, PAUSE_ALL, now);
  if (all) return { ok: false, scope: 'all', until: all.until, reason: all.reason };

  if (args.custom) {
    const cust = await readLatch(cache, PAUSE_CUSTOM, now);
    if (cust) return { ok: false, scope: 'custom', until: cust.until, reason: cust.reason };
  }

  // Defensive: a latch write may have been lost while the bucket counter still
  // shows over-cap. Re-derive and re-arm so we never blow past the cap just
  // because one KV write dropped.
  const total = await readCounter(cache, `${TOTAL_BUCKET}${dayBucket(now)}`);
  if (total >= dailyTrip(env)) {
    const latch: PauseLatch = {
      until: nextUtcMidnight(now),
      reason: `daily spend $${total.toFixed(2)} over trip $${dailyTrip(env).toFixed(2)} (cap $${dailyCap(env)})`,
      spentUsd: total,
    };
    await armLatch(cache, PAUSE_ALL, latch, now).catch(() => {});
    return { ok: false, scope: 'all', until: latch.until, reason: latch.reason };
  }
  if (args.custom) {
    const spent = await readCounter(cache, `${CUSTOM_BUCKET}${hourBucket(now)}`);
    if (spent >= hourlyCustomCap(env)) {
      const latch: PauseLatch = {
        until: now + HOUR_MS,
        reason: `custom-question spend $${spent.toFixed(2)} over cap $${hourlyCustomCap(env)} this hour`,
        spentUsd: spent,
      };
      await armLatch(cache, PAUSE_CUSTOM, latch, now).catch(() => {});
      return { ok: false, scope: 'custom', until: latch.until, reason: latch.reason };
    }
  }
  return { ok: true };
}

/** Read-only snapshot for /api/admin/budget. */
export async function budgetStatus(env: BudgetEnv, now: number = Date.now()): Promise<{
  now: number;
  daily: { spentUsd: number; capUsd: number; tripUsd: number; bucket: string };
  customHourly: { spentUsd: number; capUsd: number; bucket: string };
  pause: { all: { until: number; reason: string } | null; custom: { until: number; reason: string } | null };
}> {
  const cache = env.CACHE;
  const total = cache ? await readCounter(cache, `${TOTAL_BUCKET}${dayBucket(now)}`) : 0;
  const customHour = cache ? await readCounter(cache, `${CUSTOM_BUCKET}${hourBucket(now)}`) : 0;
  const pauseAll = cache ? await readLatch(cache, PAUSE_ALL, now) : null;
  const pauseCustom = cache ? await readLatch(cache, PAUSE_CUSTOM, now) : null;
  return {
    now,
    daily: { spentUsd: round(total), capUsd: dailyCap(env), tripUsd: round(dailyTrip(env)), bucket: dayBucket(now) },
    customHourly: { spentUsd: round(customHour), capUsd: hourlyCustomCap(env), bucket: hourBucket(now) },
    pause: {
      all: pauseAll ? { until: pauseAll.until, reason: pauseAll.reason } : null,
      custom: pauseCustom ? { until: pauseCustom.until, reason: pauseCustom.reason } : null,
    },
  };
}

/** Manual un-pause: drop both latches (counters keep accruing in their bucket). */
export async function clearPauses(env: BudgetEnv): Promise<{ cleared: BudgetScope[] }> {
  const cache = env.CACHE;
  const cleared: BudgetScope[] = [];
  if (!cache) return { cleared };
  await cache.delete(PAUSE_ALL);
  cleared.push('all');
  await cache.delete(PAUSE_CUSTOM);
  cleared.push('custom');
  return { cleared };
}

/** Thrown from runLLM when a budget pause is active. Status 429, classified
 *  NEITHER so it surfaces immediately (not retried, not failed over to another
 *  model). */
export class BudgetPausedError extends LLMError {
  readonly scope: BudgetScope;
  readonly until?: number;
  constructor(scope: BudgetScope, until?: number, reason?: string) {
    super(429, `paused:${scope}${reason ? ` (${reason})` : ''}`, { cls: NEITHER });
    this.name = 'BudgetPausedError';
    this.scope = scope;
    this.until = until;
  }
}

export function isBudgetPaused(err: unknown): err is BudgetPausedError {
  return err instanceof BudgetPausedError;
}
