# The MCP server and the API

talmud.dev serves the same corpus to machines that it serves to people. This page is for someone connecting an assistant, and for someone who wants to extend what the assistant can reach.

## Connect

```bash
claude mcp add --transport http talmud https://talmud.dev/mcp
```

For a client that takes a JSON configuration:

```json
{
  "mcpServers": {
    "talmud": { "url": "https://talmud.dev/mcp" }
  }
}
```

The endpoint is open and read-focused. No key is needed for reading. The live connect guide is [talmud.dev/#mcp](https://talmud.dev/#mcp).

## What the server is

It is a Cloudflare "code mode" MCP server, built in `packages/talmud/src/worker/mcp.ts`. Instead of one MCP tool per endpoint, it exposes two:

- `search` lets the model query the OpenAPI document (`packages/talmud/src/worker/mcp-openapi.ts`) to find the endpoints and their shapes.
- `execute` runs TypeScript the model wrote inside a throwaway isolate. That code can call the endpoints, chain them, and poll, and only its return value comes back. One round trip instead of many.

The isolate has no secrets and no network. Its only way out is a bridge into this same app, and the bridge accepts only `/api/*` paths (the `/mcp` route in `packages/talmud/src/worker/index.ts`). If a caller sends `x-studio-secret`, the bridge forwards it, so a trusted operator can reach the gated routes; everyone else gets the public subset.

One `execute` call may run for 90 seconds. The number lives in `mcp-limits.ts` and nowhere else, so the limit the executor enforces and the limit the spec tells the model cannot drift. `tests/mcp-spec.test.ts` pins that.

## Cold pages are reported, not waited for

A daf nobody has opened has no notes, and generating them takes minutes. The API tells the truth about that instead of hanging:

- `GET /api/daf-view/:tractate/:page` is the one-shot read: every cached note for a daf in one response. When it is partial it carries `status`, `generating`, `checkUrl`, `readerUrl`, `retryAfterSeconds`, `etaMinutes`, and a one-sentence `hint`.
- `GET /api/daf-view/:tractate/:page?generate=1` reads what exists and starts generation for the rest, in one call.
- Pending `POST /api/run` and `GET /api/run-status/:runId` answers carry `checkUrl`, `retryAfterSeconds`, `etaSeconds`, and a `hint`.

The rule the spec gives the model: return what you have, say the rest is generating, and read `checkUrl` later. Do not spin in a loop inside `execute`.

## The worked example

```ts
async () => {
  const view = await codemode.request({
    method: 'GET',
    path: '/api/daf-view/Berakhot/2a',
    query: { generate: '1' },
  });
  if (view.complete) return view;
  return { partial: true, cached: view.cached, stillCold: view.cold, checkUrl: view.checkUrl, hint: view.hint };
}
```

## Endpoints worth knowing

All of these are described in `mcp-openapi.ts`; `search` finds them. A few that answer most questions:

| Path | Returns |
| --- | --- |
| `GET /api/daf-view/:t/:p` | Every cached note for a daf, one call |
| `GET /api/daf/:t/:p` | The segmented text: Gemara, Rashi, Tosafot, Hebrew and English |
| `GET /api/pesukim/:t/:p` | Every verse the daf quotes, with explanations |
| `GET /api/links/:t/:p` | The daf's link graph: what it cites, continues, resolves, parallels |
| `GET /api/spine-coverage/:tractate` | Which producers have a cached note on each daf of a tractate |
| `GET /api/sages-index`, `GET /api/rabbi/:slug` | The sage registry and one sage's entry |
| `GET /api/rabbi-observations/:slug` | Every daf a sage appears on, with what was observed |
| `GET /api/marks`, `GET /api/enrichments` | The producer registry as deployed |
| `GET /api/dependents/:id` | What must be regenerated when a producer changes |
| `GET /api/stale/:id/:t/:p` | Whether a cached note was made with the current recipe |

## Adding or changing an endpoint

1. Add the route in `packages/talmud/src/worker/index.ts`. Keep it read-only unless it must write, and gate writes with `isTrustedRequest`.
2. Describe it in `mcp-openapi.ts`: path, parameters, response shape, and a plain sentence about what it is for and when it is partial. The description is the only guidance the model gets; write it for a model that has never seen the app.
3. If the change affects how a model should behave on a cold page, update the `info.description` block at the top of the spec and the test in `tests/mcp-spec.test.ts`.
4. Add a unit test next to the existing ones in `packages/talmud/tests`. The worker is importable in Node; the Cloudflare runtime is stubbed.
5. Keep the connect page (`packages/talmud/src/client/McpPage.tsx`) in step if the worked example changes.

## Ideas for contributions

- A tool-shaped wrapper for the commonest question ("explain this daf") that hides the polling.
- Better response shapes for the sage endpoints, so an assistant can answer "who is this, and where else does he speak" in one call.
- An MCP server for the Tanach reader, on the same code-mode pattern.
- Examples for clients other than Claude Code.
