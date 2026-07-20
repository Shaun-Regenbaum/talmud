/**
 * Authoritative spend straight from OpenRouter — what we are ACTUALLY billed.
 *
 * Why this exists (and why it is the real "Total spent"): the Cloudflare AI
 * Gateway `cost` figure (aigw-analytics.ts) is computed from CF's own per-model
 * price table, which uses each model's canonical/listed price. But our DeepSeek
 * calls route under `{ sort: 'price', require_parameters: true }`, so OpenRouter
 * picks whatever qualifying provider is cheapest at call time — frequently a
 * third party that bills well ABOVE the listed first-party rate. The gateway is
 * blind to that, so it under-reports DeepSeek spend by multiples (V4 Pro was
 * shown at ~$326 against ~$1,148 actually billed). OpenRouter's own activity
 * ledger is the ground truth — it is the number on the invoice.
 *
 * `/api/v1/activity` returns one row per (day, model, endpoint) with the real
 * `usage` (USD billed). It requires a MANAGEMENT/provisioning key, not the
 * inference key — so this reads `OPENROUTER_PROVISIONING_KEY` (set via
 * `wrangler secret put OPENROUTER_PROVISIONING_KEY`). `/api/v1/credits` gives
 * the account lifetime total.
 *
 * Degrades gracefully: with no provisioning key, returns { configured:false }
 * so the dashboard falls back to the gateway figure and says the real number
 * isn't wired up, rather than fabricating one.
 */

export interface OrModelRow {
  model: string;
  requests: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

export interface OrDayRow {
  date: string;
  costUsd: number;
}

export interface OrCost {
  /** Do we have a provisioning key. */
  configured: boolean;
  /** Did the query succeed. */
  ok: boolean;
  error?: string;
  windowStart?: string;
  windowEnd?: string;
  /** Distinct UTC days the activity ledger covered. */
  days?: number;
  requests?: number;
  /** Billed USD over the activity window — authoritative. */
  costUsd?: number;
  /** Account lifetime billed USD (from /credits), independent of the window. */
  lifetimeUsd?: number;
  byModel?: OrModelRow[];
  byDay?: OrDayRow[];
}

/** One `/api/v1/activity` row (the fields we use; the API sends more). */
export interface OrActivityRow {
  date?: string;
  model?: string;
  model_permaslug?: string;
  usage?: number;
  requests?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OrEnv {
  OPENROUTER_PROVISIONING_KEY?: string;
}

const BASE = 'https://openrouter.ai/api/v1';

/**
 * Aggregate raw activity rows into window totals + per-model + per-day. Pure, so
 * it is unit-tested directly against a captured response. `costUsd` is summed
 * from each row's `usage` (the real billed amount). The model label prefers the
 * dated `model_permaslug` (what actually served) and falls back to `model`.
 */
export function aggregateActivity(rows: OrActivityRow[]): {
  requests: number;
  costUsd: number;
  byModel: OrModelRow[];
  byDay: OrDayRow[];
  windowStart?: string;
  windowEnd?: string;
  days: number;
} {
  let requests = 0;
  let costUsd = 0;
  const byModel = new Map<string, OrModelRow>();
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const usd = typeof r.usage === 'number' ? r.usage : 0;
    const reqs = typeof r.requests === 'number' ? r.requests : 0;
    const tin = typeof r.prompt_tokens === 'number' ? r.prompt_tokens : 0;
    const tout = typeof r.completion_tokens === 'number' ? r.completion_tokens : 0;
    requests += reqs;
    costUsd += usd;
    const day = (r.date ?? '').slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + usd);
    const model = r.model_permaslug || r.model || '(unknown)';
    const m = byModel.get(model) ?? { model, requests: 0, costUsd: 0, tokensIn: 0, tokensOut: 0 };
    m.requests += reqs;
    m.costUsd += usd;
    m.tokensIn += tin;
    m.tokensOut += tout;
    byModel.set(model, m);
  }
  const days = [...byDay.keys()].sort();
  return {
    requests,
    costUsd,
    byModel: [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd),
    byDay: days.map((date) => ({ date, costUsd: byDay.get(date) ?? 0 })),
    windowStart: days[0],
    windowEnd: days[days.length - 1],
    days: days.length,
  };
}

async function fetchJson(
  url: string,
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* leave null */
  }
  return { ok: res.ok, status: res.status, json };
}

export interface OrBalance {
  /** Do we have a provisioning key. */
  configured: boolean;
  /** Did the query succeed (a usable `remaining` is present). */
  ok: boolean;
  error?: string;
  /** Spendable USD right now: `total_credits - total_usage`. */
  remaining?: number;
}

/**
 * Lean spendable-balance probe — just `/credits`, no activity ledger — for the
 * AI-paused gate on the cold-generation entry paths. Kept separate from
 * `fetchOpenRouterCost` (which also pulls the multi-KB `/activity` ledger for
 * the /usage dashboard) so a request-path caller makes one small call with a
 * short timeout. Degrades to `{ ok:false }` (unknown) on any failure — the
 * caller must treat unknown as "don't block", never as "down".
 */
export async function fetchOpenRouterBalance(env: OrEnv): Promise<OrBalance> {
  const token = env.OPENROUTER_PROVISIONING_KEY;
  if (!token) return { configured: false, ok: false, error: 'not configured' };
  try {
    const { ok, status, json } = await fetchJson(
      `${BASE}/credits`,
      token,
      AbortSignal.timeout(2500),
    );
    if (!ok) {
      const msg = (json as { error?: { message?: string } })?.error?.message ?? `HTTP ${status}`;
      return { configured: true, ok: false, error: String(msg).slice(0, 200) };
    }
    const d = (json as { data?: { total_credits?: number; total_usage?: number } })?.data;
    if (!d || typeof d.total_credits !== 'number' || typeof d.total_usage !== 'number')
      return { configured: true, ok: false, error: 'unexpected /credits shape' };
    return { configured: true, ok: true, remaining: d.total_credits - d.total_usage };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: String((err as Error)?.message ?? err).slice(0, 200),
    };
  }
}

export async function fetchOpenRouterCost(env: OrEnv): Promise<OrCost> {
  const token = env.OPENROUTER_PROVISIONING_KEY;
  if (!token) {
    return {
      configured: false,
      ok: false,
      error: 'not configured (missing OPENROUTER_PROVISIONING_KEY)',
    };
  }
  try {
    const [activity, credits] = await Promise.all([
      fetchJson(`${BASE}/activity`, token),
      fetchJson(`${BASE}/credits`, token),
    ]);
    if (!activity.ok) {
      const msg =
        (activity.json as { error?: { message?: string } })?.error?.message ??
        `HTTP ${activity.status}`;
      return { configured: true, ok: false, error: String(msg).slice(0, 300) };
    }
    const rows = ((activity.json as { data?: OrActivityRow[] })?.data ?? []) as OrActivityRow[];
    const agg = aggregateActivity(rows);
    const lifetimeUsd = (credits.json as { data?: { total_usage?: number } })?.data?.total_usage;
    return {
      configured: true,
      ok: true,
      windowStart: agg.windowStart,
      windowEnd: agg.windowEnd,
      days: agg.days,
      requests: agg.requests,
      costUsd: agg.costUsd,
      lifetimeUsd: typeof lifetimeUsd === 'number' ? lifetimeUsd : undefined,
      byModel: agg.byModel,
      byDay: agg.byDay,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: String((err as Error)?.message ?? err).slice(0, 300),
    };
  }
}
