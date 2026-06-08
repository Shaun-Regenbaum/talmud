/**
 * Code-mode MCP server for the Talmud app.
 *
 * Instead of exposing ~30 endpoints as ~30 MCP tools, this exposes Cloudflare's
 * "code mode" surface — two tools, `search` and `execute`:
 *   - `search`  lets the model query the OpenAPI spec (src/worker/mcp-openapi.ts)
 *               to discover endpoints.
 *   - `execute` runs model-written TypeScript in an isolated Worker (spun up via
 *               env.LOADER) that can call those endpoints and chain/poll in one
 *               round trip, returning only the final result.
 *
 * The sandbox has no env/secrets and no outbound network: its only access to the
 * outside is the host-side `request` bridge passed in by the caller (the /mcp
 * route in index.ts), which proxies to our own /api/* routes. Auth headers never
 * enter the sandbox.
 */

import { DynamicWorkerExecutor } from '@cloudflare/codemode';
import { openApiMcpServer, type RequestOptions } from '@cloudflare/codemode/mcp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TALMUD_OPENAPI } from './mcp-openapi';

export interface CodeModeMcpOptions {
  /** wrangler.toml `worker_loaders` binding — the sandbox runtime. */
  loader: WorkerLoader;
  /** Host-side bridge the sandbox calls; proxies to our own /api/* routes. */
  request: (options: RequestOptions) => Promise<unknown>;
}

/** Build the search+execute MCP server. One per request (stateless). */
export function buildCodeModeMcpServer(opts: CodeModeMcpOptions): McpServer {
  const executor = new DynamicWorkerExecutor({ loader: opts.loader });
  return openApiMcpServer({
    spec: TALMUD_OPENAPI,
    executor,
    request: opts.request,
    name: 'talmud',
    version: '1.0.0',
  });
}
