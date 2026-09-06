/** Provider charges scoped to the deployed application key. The shared
 * account balance is used only by fetchOpenRouterBalance. */

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
  /** Current application key usage (from /key), including today. */
  lifetimeUsd?: number;
  scope?: 'application-key';
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
  OPENROUTER_API_KEY?: string;
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

/** Completed UTC days, independent of which days have activity. */
export function billingWindow(now = new Date()): {
  windowStart: string;
  windowEnd: string;
  days: number;
} {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = 86_400_000;
  return {
    windowStart: new Date(midnight - 30 * day).toISOString().slice(0, 10),
    windowEnd: new Date(midnight - day).toISOString().slice(0, 10),
    days: 30,
  };
}

/** The API's api_key_hash filter is the SHA-256 of the inference credential.
 * Keep it server-side; no credential or hash belongs in a dashboard response. */
export async function applicationKeyHash(key: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchOpenRouterCost(env: OrEnv): Promise<OrCost> {
  const token = env.OPENROUTER_PROVISIONING_KEY;
  const inferenceKey = env.OPENROUTER_API_KEY;
  if (!token || !inferenceKey) {
    return {
      configured: false,
      ok: false,
      error: 'Application billing credentials are not configured',
    };
  }
  try {
    const hash = await applicationKeyHash(inferenceKey);
    const window = billingWindow();
    const signal = AbortSignal.timeout(10_000);
    const [activity, keyInfo] = await Promise.all([
      fetchJson(`${BASE}/activity?api_key_hash=${hash}`, token, signal),
      fetchJson(`${BASE}/key`, inferenceKey, signal).catch(() => ({
        ok: false,
        status: 0,
        json: null,
      })),
    ]);
    if (!activity.ok) {
      return {
        configured: true,
        ok: false,
        error: `Application activity query failed (HTTP ${activity.status})`,
      };
    }
    const data = (activity.json as { data?: unknown } | null)?.data;
    if (
      !Array.isArray(data) ||
      data.some(
        (row) =>
          !row ||
          typeof row.date !== 'string' ||
          typeof row.usage !== 'number' ||
          !Number.isFinite(row.usage),
      )
    ) {
      return { configured: true, ok: false, error: 'Unexpected application activity response' };
    }
    const rows = (data as OrActivityRow[]).filter((r) => {
      const date = r.date!.slice(0, 10);
      return date >= window.windowStart && date <= window.windowEnd;
    });
    const agg = aggregateActivity(rows);
    const lifetime = keyInfo.ok
      ? (keyInfo.json as { data?: { usage?: number } } | null)?.data?.usage
      : undefined;
    return {
      configured: true,
      ok: true,
      ...agg,
      ...window,
      scope: 'application-key',
      lifetimeUsd: typeof lifetime === 'number' && Number.isFinite(lifetime) ? lifetime : undefined,
    };
  } catch {
    return { configured: true, ok: false, error: 'Application billing query unavailable' };
  }
}
