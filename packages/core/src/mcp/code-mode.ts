/**
 * Code-mode MCP server, shared by the talmud and tanach workers.
 *
 * Instead of exposing N endpoints as N MCP tools, each app exposes Cloudflare's
 * "code mode" surface — two tools, `search` and `execute`:
 *   - `search`  lets the model query the app's OpenAPI spec to discover routes.
 *   - `execute` runs model-written TypeScript in an isolated Worker (spun up via
 *               the app's `worker_loaders` binding) that can call those routes
 *               and chain/poll in one round trip, returning only the result.
 *
 * The sandbox has no env/secrets and no outbound network: its only way out is
 * the host-side `request` bridge (`apiRequestBridge`), which re-enters the
 * app's own Hono router in-process for `/api/*` paths. Auth headers never
 * enter the sandbox.
 *
 * Everything runtime-heavy (`@cloudflare/codemode` imports `cloudflare:workers`,
 * which only resolves inside workerd) is imported LAZILY inside
 * `serveCodeModeMcp`, so this module is safe to import from code that node
 * unit tests load.
 */

import type { RequestOptions } from '@cloudflare/codemode/mcp';
import type { Context, Hono } from 'hono';

export type { RequestOptions };

/**
 * Wall-clock budget for one `execute` (or `search`) call. The codemode default
 * is 30 s, which is shorter than a single cold enrichment (talmud p95 ~2 min),
 * so a model polling one piece hit "Execution timed out" instead of an answer.
 * 90 s lets one cold piece finish; a whole cold daf (~8 min) is deliberately
 * NOT covered — each app's spec tells the model to return early and be honest.
 */
export const DEFAULT_EXECUTE_TIMEOUT_MS = 90_000;

/** Header the bridge stamps on every proxied API call, so the app can tell an
 *  MCP-originated request from the browser or a direct API client. */
export const VIA_HEADER = 'x-corpus-via';
export const VIA_MCP = 'mcp';

/** One MCP HTTP request, for the app's observability hook. */
export interface McpEvent {
  /** JSON-RPC method ('initialize', 'tools/list', 'tools/call', 'notifications/…')
   *  or 'unknown' when the body was not a JSON-RPC message (e.g. a GET stream). */
  method: string;
  /** For tools/call: the tool name ('search' | 'execute'). */
  tool?: string;
  /** For tools/call: how long the sandbox ran the code. Otherwise: the whole
   *  HTTP request. */
  ms: number;
  /** HTTP status of the response. */
  status: number;
  /** The tool ran code and it failed (sandbox error, thrown error, or timeout). */
  error?: string;
  timedOut: boolean;
}

export interface CodeModeMcpOptions {
  /** wrangler `worker_loaders` binding — the sandbox runtime. */
  loader: WorkerLoader;
  /** The curated OpenAPI 3.1 document the `search` tool queries. */
  spec: Record<string, unknown>;
  /** MCP server name (e.g. 'talmud', 'tanach'). */
  name: string;
  version?: string;
  /** Host-side bridge the sandbox calls; see `apiRequestBridge`. */
  request: (options: RequestOptions) => Promise<unknown>;
  timeoutMs?: number;
  /** Fired once per MCP HTTP request, after the response is built. */
  onEvent?: (ev: McpEvent) => void;
}

interface JsonRpcPeek {
  method: string;
  tool?: string;
}

/** Read the JSON-RPC envelope without consuming the body: Hono caches
 *  `c.req.json()`, so the transport's own read gets the same parsed value. */
async function peekJsonRpc(c: Context): Promise<JsonRpcPeek> {
  if (c.req.method !== 'POST') return { method: c.req.method === 'GET' ? 'stream' : 'unknown' };
  try {
    const body = (await c.req.json()) as unknown;
    const msg = Array.isArray(body) ? body[0] : body;
    if (
      msg &&
      typeof msg === 'object' &&
      typeof (msg as { method?: unknown }).method === 'string'
    ) {
      const m = msg as { method: string; params?: { name?: unknown } };
      const tool = typeof m.params?.name === 'string' ? m.params.name : undefined;
      return { method: m.method, ...(tool ? { tool } : {}) };
    }
  } catch {
    /* not JSON: fall through */
  }
  return { method: 'unknown' };
}

/** Handle one Streamable-HTTP MCP request. Stateless: a fresh server per call. */
export async function serveCodeModeMcp(c: Context, opts: CodeModeMcpOptions): Promise<Response> {
  const t0 = Date.now();
  const peek = await peekJsonRpc(c);
  const [{ StreamableHTTPTransport }, { DynamicWorkerExecutor }, { openApiMcpServer }] =
    await Promise.all([
      import('@hono/mcp'),
      import('@cloudflare/codemode'),
      import('@cloudflare/codemode/mcp'),
    ]);
  const inner = new DynamicWorkerExecutor({
    loader: opts.loader,
    timeout: opts.timeoutMs ?? DEFAULT_EXECUTE_TIMEOUT_MS,
  });
  const fire = (rest: Omit<McpEvent, 'method' | 'tool'>) =>
    opts.onEvent?.({ method: peek.method, ...(peek.tool ? { tool: peek.tool } : {}), ...rest });
  // A tools/call is reported from HERE, around the sandbox run: the transport
  // streams the HTTP response before the tool executes (the JSON-RPC result is
  // written into the SSE stream later), so the request-level timing below would
  // see a few ms and never a sandbox failure. This is where "Execution timed
  // out" and thrown errors are visible; the MCP response is still HTTP 200.
  const executor: typeof inner = Object.assign(Object.create(inner), {
    execute: async (...args: Parameters<typeof inner.execute>) => {
      const t = Date.now();
      const r = await inner.execute(...args);
      fire({
        ms: Date.now() - t,
        status: 200,
        ...(r.error ? { error: r.error } : {}),
        timedOut: /timed out/i.test(r.error ?? ''),
      });
      return r;
    },
  });
  const server = openApiMcpServer({
    spec: opts.spec,
    executor,
    request: opts.request,
    name: opts.name,
    version: opts.version ?? '1.0.0',
  });
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  let res: Response | undefined;
  let status = 500;
  try {
    res = (await transport.handleRequest(c)) ?? undefined;
    status = res?.status ?? 204;
    return res ?? c.body(null, 204);
  } finally {
    // Everything that is not a tool call (initialize, tools/list, pings,
    // notifications, malformed bodies) is reported per HTTP request.
    if (peek.method !== 'tools/call') fire({ ms: Date.now() - t0, status, timedOut: false });
  }
}

export interface ApiBridgeOptions<E extends object> {
  /** The app's own Hono router (re-entered in-process; no network hop). */
  app: Hono<{ Bindings: E }>;
  env: E;
  /** Keeps the underlying API call running after the sandbox gives up on it
   *  (e.g. a tanach route that generates inline and outlives the 90 s budget),
   *  so the work still lands in cache and the model's retry is instant. */
  waitUntil?: (p: Promise<unknown>) => void;
  /** Extra headers forwarded to every proxied call (e.g. a trusted operator's
   *  studio secret). Never visible inside the sandbox. */
  headers?: Record<string, string>;
  /** Fired per proxied call. */
  onRequest?: (ev: { method: string; path: string; ms: number; status: number }) => void;
}

/** The host-side `request` bridge: proxies `/api/*` (only) back into the app. */
export function apiRequestBridge<E extends object>(
  o: ApiBridgeOptions<E>,
): (options: RequestOptions) => Promise<unknown> {
  return async ({ method, path, query, body }) => {
    if (typeof path !== 'string' || !path.startsWith('/api/')) {
      return { error: 'request bridge only proxies /api/* paths' };
    }
    const u = new URL(path, 'http://internal');
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) u.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [VIA_HEADER]: VIA_MCP,
      ...(o.headers ?? {}),
    };
    const t0 = Date.now();
    try {
      const pending: Promise<Response> = Promise.resolve(
        o.app.request(
          u.pathname + u.search,
          {
            method,
            headers,
            body: body == null || method === 'GET' ? undefined : JSON.stringify(body),
          },
          o.env,
        ),
      );
      o.waitUntil?.(
        pending.then(
          () => undefined,
          () => undefined,
        ),
      );
      const res = await pending;
      o.onRequest?.({ method, path: u.pathname, ms: Date.now() - t0, status: res.status });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (err) {
      o.onRequest?.({ method, path: u.pathname, ms: Date.now() - t0, status: 0 });
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };
}
