/**
 * Read side of surface telemetry (see @corpus/core/telemetry/surface): the
 * Usage page's "MCP" tab. Queries each worker's Analytics Engine dataset
 * through the account-level SQL API and answers, per app: requests that reached
 * the worker by surface (app / mcp / api) per day, and for the MCP: calls,
 * distinct callers, connects, per-tool outcomes and latency, the routes MCP
 * code calls most, and the latest failures.
 *
 * Requires CF_ANALYTICS_TOKEN ("Account Analytics: Read" — the same token the
 * AI Gateway cost query uses) and CLOUDFLARE_ACCOUNT_ID. A dataset with no rows
 * yet (or a worker not yet deployed with the binding) reports ok:false with
 * the API's message; the page says so instead of inventing numbers.
 *
 * Edge cache hits never reach the worker, so `app` here undercounts human
 * reads of warm dapim — the Traffic tab (zone analytics) has the true total.
 * MCP and direct API calls always reach the worker, so those are exact
 * (modulo Analytics Engine sampling, which _sample_interval corrects for).
 */

import type { Surface } from '@corpus/core/telemetry/surface';

const SQL_URL = (account: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`;

export const SURFACE_DATASETS = { talmud: 'talmud_surface', tanach: 'tanach_surface' } as const;
export type SurfaceApp = keyof typeof SURFACE_DATASETS;

export interface Window3 {
  day: number;
  week: number;
  month: number;
}

export interface SurfaceDayRow {
  date: string; // YYYY-MM-DD (UTC)
  app: number;
  mcp: number;
  api: number;
}

export interface McpDayRow {
  date: string;
  calls: number;
  errors: number;
  timeouts: number;
}

export interface McpToolRow {
  tool: string;
  calls: number;
  ok: number;
  errors: number;
  timeouts: number;
  p50Ms: number;
  p95Ms: number;
}

export interface McpRouteRow {
  route: string;
  hits: number;
  errors: number;
  p95Ms: number;
}

export interface McpErrorRow {
  ts: string;
  tool: string;
  outcome: string;
  error: string;
}

export interface AppSurfaceUsage {
  ok: boolean;
  error?: string;
  byDay: SurfaceDayRow[];
  hits: Record<Surface, Window3>;
  mcp: {
    calls: Window3;
    errors: Window3;
    timeouts: Window3;
    connects: Window3;
    clients: Window3;
    byDay: McpDayRow[];
    byTool: McpToolRow[];
    topRoutes: McpRouteRow[];
    recentErrors: McpErrorRow[];
  };
}

export interface SurfaceUsage {
  configured: boolean;
  ok: boolean;
  error?: string;
  windowDays: number;
  apps: Record<SurfaceApp, AppSurfaceUsage>;
}

interface SurfaceEnv {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
}

type Row = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const dayOf = (v: unknown): string => str(v).slice(0, 10);

// ---------------------------------------------------------------------------
// SQL (Analytics Engine dialect). Kept as functions of the dataset name so the
// same six queries serve both workers.
// ---------------------------------------------------------------------------

export const SQL = {
  hitsByDay: (ds: string, days: number) =>
    `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob2 AS surface, SUM(_sample_interval) AS hits ` +
    `FROM ${ds} WHERE index1 = 'hit' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY day, surface ORDER BY day`,
  mcpByDay: (ds: string, days: number) =>
    `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob2 AS method, blob4 AS outcome, SUM(_sample_interval) AS calls ` +
    `FROM ${ds} WHERE index1 = 'mcp' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY day, method, outcome ORDER BY day`,
  mcpTools: (ds: string, days: number) =>
    `SELECT blob3 AS tool, blob4 AS outcome, SUM(_sample_interval) AS calls, ` +
    `quantileWeighted(0.5)(double1, _sample_interval) AS p50, quantileWeighted(0.95)(double1, _sample_interval) AS p95 ` +
    `FROM ${ds} WHERE index1 = 'mcp' AND blob2 = 'tools/call' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY tool, outcome`,
  mcpClients: (ds: string, days: number) =>
    `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob7 AS client ` +
    `FROM ${ds} WHERE index1 = 'mcp' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY day, client LIMIT 5000`,
  mcpRoutes: (ds: string, days: number) =>
    `SELECT blob3 AS route, blob5 AS status, SUM(_sample_interval) AS hits, quantileWeighted(0.95)(double1, _sample_interval) AS p95 ` +
    `FROM ${ds} WHERE index1 = 'hit' AND blob2 = 'mcp' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY route, status ORDER BY hits DESC LIMIT 200`,
  mcpErrors: (ds: string) =>
    `SELECT timestamp, blob3 AS tool, blob4 AS outcome, blob8 AS error ` +
    `FROM ${ds} WHERE index1 = 'mcp' AND blob4 <> 'ok' AND timestamp > NOW() - INTERVAL '7' DAY ORDER BY timestamp DESC LIMIT 20`,
};

// ---------------------------------------------------------------------------
// Pure aggregation over the SQL rows (tested).
// ---------------------------------------------------------------------------

export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Sum a per-day series into today / last 7 / last 30 windows. */
export function windowSums(
  rows: Array<{ date: string; value: number }>,
  now: number = Date.now(),
): Window3 {
  const today = utcDay(now);
  const weekStart = utcDay(now - 6 * 86_400_000);
  const monthStart = utcDay(now - 29 * 86_400_000);
  const w: Window3 = { day: 0, week: 0, month: 0 };
  for (const r of rows) {
    if (r.date === today) w.day += r.value;
    if (r.date >= weekStart) w.week += r.value;
    if (r.date >= monthStart) w.month += r.value;
  }
  return w;
}

export function aggregateHitsByDay(rows: Row[]): SurfaceDayRow[] {
  const byDay = new Map<string, SurfaceDayRow>();
  for (const r of rows) {
    const date = dayOf(r.day);
    if (!date) continue;
    const row = byDay.get(date) ?? { date, app: 0, mcp: 0, api: 0 };
    const s = str(r.surface) as Surface;
    if (s === 'app' || s === 'mcp' || s === 'api') row[s] += num(r.hits);
    byDay.set(date, row);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Per-day MCP tool calls + errors + timeouts, and connects (initialize). */
export function aggregateMcpByDay(rows: Row[]): {
  byDay: McpDayRow[];
  connects: Array<{ date: string; value: number }>;
} {
  const byDay = new Map<string, McpDayRow>();
  const connects = new Map<string, number>();
  for (const r of rows) {
    const date = dayOf(r.day);
    if (!date) continue;
    const method = str(r.method);
    const calls = num(r.calls);
    if (method === 'initialize') {
      connects.set(date, (connects.get(date) ?? 0) + calls);
      continue;
    }
    if (method !== 'tools/call') continue;
    const row = byDay.get(date) ?? { date, calls: 0, errors: 0, timeouts: 0 };
    row.calls += calls;
    const outcome = str(r.outcome);
    if (outcome === 'timeout') row.timeouts += calls;
    else if (outcome !== 'ok') row.errors += calls;
    byDay.set(date, row);
  }
  return {
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    connects: [...connects].map(([date, value]) => ({ date, value })),
  };
}

export function aggregateTools(rows: Row[]): McpToolRow[] {
  const byTool = new Map<string, McpToolRow>();
  for (const r of rows) {
    const tool = str(r.tool) || '(none)';
    const row = byTool.get(tool) ?? {
      tool,
      calls: 0,
      ok: 0,
      errors: 0,
      timeouts: 0,
      p50Ms: 0,
      p95Ms: 0,
    };
    const calls = num(r.calls);
    const outcome = str(r.outcome);
    row.calls += calls;
    if (outcome === 'ok') {
      row.ok += calls;
      row.p50Ms = num(r.p50);
      row.p95Ms = num(r.p95);
    } else if (outcome === 'timeout') row.timeouts += calls;
    else row.errors += calls;
    byTool.set(tool, row);
  }
  return [...byTool.values()].sort((a, b) => b.calls - a.calls);
}

export function aggregateRoutes(rows: Row[]): McpRouteRow[] {
  const byRoute = new Map<string, McpRouteRow>();
  for (const r of rows) {
    const route = str(r.route) || '(unknown)';
    const row = byRoute.get(route) ?? { route, hits: 0, errors: 0, p95Ms: 0 };
    const hits = num(r.hits);
    const status = str(r.status);
    row.hits += hits;
    if (status === '4xx' || status === '5xx') row.errors += hits;
    else row.p95Ms = Math.max(row.p95Ms, num(r.p95));
    byRoute.set(route, row);
  }
  return [...byRoute.values()].sort((a, b) => b.hits - a.hits).slice(0, 25);
}

/** Distinct MCP callers today / last 7 / last 30 days (union of per-day sets). */
export function distinctClients(rows: Row[], now: number = Date.now()): Window3 {
  const today = utcDay(now);
  const weekStart = utcDay(now - 6 * 86_400_000);
  const monthStart = utcDay(now - 29 * 86_400_000);
  const day = new Set<string>();
  const week = new Set<string>();
  const month = new Set<string>();
  for (const r of rows) {
    const date = dayOf(r.day);
    const client = str(r.client);
    if (!date || !client) continue;
    if (date === today) day.add(client);
    if (date >= weekStart) week.add(client);
    if (date >= monthStart) month.add(client);
  }
  return { day: day.size, week: week.size, month: month.size };
}

export function recentErrors(rows: Row[]): McpErrorRow[] {
  return rows.map((r) => ({
    ts: str(r.timestamp),
    tool: str(r.tool),
    outcome: str(r.outcome),
    error: str(r.error),
  }));
}

export function assembleApp(
  q: {
    hits: Row[];
    mcp: Row[];
    tools: Row[];
    clients: Row[];
    routes: Row[];
    errors: Row[];
  },
  now: number = Date.now(),
): AppSurfaceUsage {
  const byDay = aggregateHitsByDay(q.hits);
  const { byDay: mcpByDay, connects } = aggregateMcpByDay(q.mcp);
  const series = (pick: (d: SurfaceDayRow) => number) =>
    byDay.map((d) => ({ date: d.date, value: pick(d) }));
  const mseries = (pick: (d: McpDayRow) => number) =>
    mcpByDay.map((d) => ({ date: d.date, value: pick(d) }));
  return {
    ok: true,
    byDay,
    hits: {
      app: windowSums(
        series((d) => d.app),
        now,
      ),
      mcp: windowSums(
        series((d) => d.mcp),
        now,
      ),
      api: windowSums(
        series((d) => d.api),
        now,
      ),
    },
    mcp: {
      calls: windowSums(
        mseries((d) => d.calls),
        now,
      ),
      errors: windowSums(
        mseries((d) => d.errors),
        now,
      ),
      timeouts: windowSums(
        mseries((d) => d.timeouts),
        now,
      ),
      connects: windowSums(connects, now),
      clients: distinctClients(q.clients, now),
      byDay: mcpByDay,
      byTool: aggregateTools(q.tools),
      topRoutes: aggregateRoutes(q.routes),
      recentErrors: recentErrors(q.errors),
    },
  };
}

// ---------------------------------------------------------------------------
// Fetch.
// ---------------------------------------------------------------------------

async function runSql(account: string, token: string, sql: string): Promise<Row[]> {
  const res = await fetch(SQL_URL(account), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
    body: sql,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { data?: Row[] };
  return json.data ?? [];
}

const EMPTY_APP = (error: string): AppSurfaceUsage => ({
  ok: false,
  error,
  byDay: [],
  hits: {
    app: { day: 0, week: 0, month: 0 },
    mcp: { day: 0, week: 0, month: 0 },
    api: { day: 0, week: 0, month: 0 },
  },
  mcp: {
    calls: { day: 0, week: 0, month: 0 },
    errors: { day: 0, week: 0, month: 0 },
    timeouts: { day: 0, week: 0, month: 0 },
    connects: { day: 0, week: 0, month: 0 },
    clients: { day: 0, week: 0, month: 0 },
    byDay: [],
    byTool: [],
    topRoutes: [],
    recentErrors: [],
  },
});

async function fetchApp(
  account: string,
  token: string,
  ds: string,
  days: number,
): Promise<AppSurfaceUsage> {
  try {
    const [hits, mcp, tools, clients, routes, errors] = await Promise.all([
      runSql(account, token, SQL.hitsByDay(ds, days)),
      runSql(account, token, SQL.mcpByDay(ds, days)),
      runSql(account, token, SQL.mcpTools(ds, days)),
      runSql(account, token, SQL.mcpClients(ds, days)),
      runSql(account, token, SQL.mcpRoutes(ds, days)),
      runSql(account, token, SQL.mcpErrors(ds)),
    ]);
    return assembleApp({ hits, mcp, tools, clients, routes, errors });
  } catch (err) {
    return EMPTY_APP(err instanceof Error ? err.message : String(err));
  }
}

export async function fetchSurfaceUsage(env: SurfaceEnv, days = 30): Promise<SurfaceUsage> {
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CF_ANALYTICS_TOKEN;
  if (!account || !token) {
    const missing = [!token && 'CF_ANALYTICS_TOKEN', !account && 'CLOUDFLARE_ACCOUNT_ID']
      .filter(Boolean)
      .join(', ');
    const err = `not configured (missing: ${missing})`;
    return {
      configured: false,
      ok: false,
      error: err,
      windowDays: days,
      apps: { talmud: EMPTY_APP(err), tanach: EMPTY_APP(err) },
    };
  }
  const [talmud, tanach] = await Promise.all([
    fetchApp(account, token, SURFACE_DATASETS.talmud, days),
    fetchApp(account, token, SURFACE_DATASETS.tanach, days),
  ]);
  const ok = talmud.ok || tanach.ok;
  return {
    configured: true,
    ok,
    ...(ok ? {} : { error: talmud.error ?? tanach.error }),
    windowDays: days,
    apps: { talmud, tanach },
  };
}
