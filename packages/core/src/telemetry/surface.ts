/**
 * Surface telemetry: which SURFACE a request came through — the app (browser),
 * the MCP bridge, or a direct API client — plus one record per MCP request
 * (method, tool, outcome, latency). Written to a Workers Analytics Engine
 * dataset (one per worker) so the Usage page can answer "how many people use
 * the MCP, what do they call, how often does it time out" without the app
 * keeping counters in KV. Read back through the account-level SQL API.
 *
 * Row layout (one dataset, `index1` = record kind):
 *   hit: blobs [kind='hit', surface, route, method, statusClass, uaFamily, client]
 *        doubles [ms, 1]
 *   mcp: blobs [kind='mcp', jsonrpcMethod, tool, outcome, statusClass, uaFamily,
 *               client, errorSnippet]   doubles [ms, 1, httpStatus]
 * `client` is a truncated hash of (ip, user-agent): enough to count distinct
 * callers per day, not enough to identify anyone.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { matchedRoutes } from 'hono/route';
import { type McpEvent, VIA_HEADER, VIA_MCP } from '../mcp/code-mode';

export type Surface = 'app' | 'mcp' | 'api';
export const SURFACES: readonly Surface[] = ['app', 'mcp', 'api'];

/** The minimal Analytics Engine surface (the binding satisfies this). */
export interface SurfaceSink {
  writeDataPoint(event?: AnalyticsEngineDataPoint): void;
}

interface HeaderReader {
  get(name: string): string | null | undefined;
}

/**
 * mcp = came through the MCP bridge (it stamps x-corpus-via). app = a browser
 * on our own site (Sec-Fetch-Site same-origin/same-site, or a typed URL).
 * api = everything else: curl, a server backend, another site's browser code.
 */
export function classifySurface(h: HeaderReader): Surface {
  if ((h.get(VIA_HEADER) ?? '').toLowerCase() === VIA_MCP) return 'mcp';
  const site = (h.get('sec-fetch-site') ?? '').toLowerCase();
  if (site === 'same-origin' || site === 'same-site' || site === 'none') return 'app';
  return 'api';
}

/** Coarse client family from a User-Agent: 'browser', 'claude-code', 'node',
 *  'python-requests', … — the product token before the version. */
export function uaFamily(ua: string | null | undefined): string {
  if (!ua) return 'none';
  if (/mozilla\//i.test(ua)) return 'browser';
  const m = ua.match(/^([A-Za-z][A-Za-z0-9._-]{0,30})/);
  return (m?.[1] ?? 'other').toLowerCase();
}

/** 12 hex chars of SHA-256(ip|ua): a per-caller key for distinct counts. */
export async function clientHash(
  ip: string | null | undefined,
  ua: string | null | undefined,
): Promise<string> {
  const data = new TextEncoder().encode(`${ip ?? ''}|${ua ?? ''}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

/** The registered route pattern that handled the request, e.g.
 *  '/api/daf-view/:tractate/:page' — bounded cardinality, unlike the raw path. */
export function routeLabel(c: Context): string {
  try {
    const routes = matchedRoutes(c);
    for (let i = routes.length - 1; i >= 0; i--) {
      const p = routes[i]?.path;
      if (p && !p.endsWith('*')) return p;
    }
  } catch {
    /* no match result (e.g. synthetic request): fall through */
  }
  return `${c.req.path.split('/').slice(0, 3).join('/')}/*`;
}

export interface HitRecord {
  surface: Surface;
  route: string;
  method: string;
  status: number;
  ms: number;
  ua: string;
  client: string;
}

export function hitDataPoint(r: HitRecord): AnalyticsEngineDataPoint {
  return {
    indexes: ['hit'],
    blobs: ['hit', r.surface, r.route, r.method, statusClass(r.status), r.ua, r.client],
    doubles: [r.ms, 1],
  };
}

export type McpOutcome = 'ok' | 'error' | 'timeout' | 'http-error';

export function mcpOutcome(ev: Pick<McpEvent, 'timedOut' | 'error' | 'status'>): McpOutcome {
  if (ev.timedOut) return 'timeout';
  if (ev.error) return 'error';
  if (ev.status >= 400) return 'http-error';
  return 'ok';
}

export function mcpDataPoint(ev: McpEvent, ua: string, client: string): AnalyticsEngineDataPoint {
  return {
    indexes: ['mcp'],
    blobs: [
      'mcp',
      ev.method,
      ev.tool ?? '',
      mcpOutcome(ev),
      statusClass(ev.status),
      ua,
      client,
      (ev.error ?? '').slice(0, 120),
    ],
    doubles: [ev.ms, 1, ev.status],
  };
}

/**
 * Hono middleware for `/api/*`: after the handler runs, write one `hit` row.
 * Telemetry never affects the response (errors are swallowed) and is a no-op
 * when the worker has no dataset binding (local dev, the generator script).
 */
export function surfaceMiddleware<B extends object>(
  getSink: (env: B) => SurfaceSink | undefined,
): MiddlewareHandler<{ Bindings: B }> {
  return async (c, next) => {
    const t0 = Date.now();
    await next();
    const sink = getSink(c.env);
    if (!sink) return;
    try {
      const h = c.req.raw.headers;
      const ua = h.get('user-agent');
      sink.writeDataPoint(
        hitDataPoint({
          surface: classifySurface(h),
          route: routeLabel(c),
          method: c.req.method,
          status: c.res.status,
          ms: Date.now() - t0,
          ua: uaFamily(ua),
          client: await clientHash(h.get('cf-connecting-ip'), ua),
        }),
      );
    } catch {
      /* never let telemetry break a response */
    }
  };
}

/** Write one `mcp` row for an MCP HTTP request (wire to `serveCodeModeMcp`'s
 *  onEvent, inside waitUntil). */
export async function recordMcpEvent(
  sink: SurfaceSink | undefined,
  req: Request,
  ev: McpEvent,
): Promise<void> {
  if (!sink) return;
  try {
    const ua = req.headers.get('user-agent');
    sink.writeDataPoint(
      mcpDataPoint(ev, uaFamily(ua), await clientHash(req.headers.get('cf-connecting-ip'), ua)),
    );
  } catch {
    /* swallow */
  }
}
