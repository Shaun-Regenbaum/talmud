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

It is a Cloudflare "code mode" MCP server, built in `packages/core/src/mcp/code-mode.ts`. Instead of one MCP tool per endpoint, it exposes two:

- `search` lets the model query the OpenAPI document (`packages/talmud/src/worker/mcp-openapi.ts`) to find the endpoints and their shapes.
- `execute` runs TypeScript the model wrote inside a throwaway isolate. That code can call the endpoints, chain them, and poll, and only its return value comes back. One round trip instead of many.

The isolate has no secrets and no network. Its only way out is a bridge into this same app, and the bridge accepts only `/api/*` paths (the `/mcp` route in `packages/talmud/src/worker/index.ts`). If a caller sends `x-studio-secret`, the bridge forwards it, so a trusted operator can reach the gated routes; everyone else gets the public subset.

One `execute` call may run for 90 seconds. The number lives in `packages/core/src/mcp/code-mode.ts` and is re-exported by `mcp-limits.ts`, so the limit the executor enforces and the limit the spec tells the model cannot drift. `tests/mcp-spec.test.ts` pins that.

## Cold pages are reported, not waited for

A daf nobody has opened has no notes, and generating them takes minutes. The API tells the truth about that instead of hanging:

- `GET /api/daf-view/:tractate/:page` is the one-shot read: every cached note for a daf in one response. When it is partial it carries `status`, `generating`, `checkUrl`, `readerUrl`, `retryAfterSeconds`, `etaMinutes`, and a one-sentence `hint`.
- `GET /api/daf-view/:tractate/:page?generate=1` reads what exists and requests generation for missing pieces. Check `generating` and `hint` to see whether work started.
- A pending `POST /api/run` answer carries `checkUrl`, `retryAfterSeconds`, `etaSeconds`, and a `hint`. Keep that URL: a pending `GET /api/run-status/:runId` answer may only repeat the status and retry delay.

The rule the spec gives the model: return what you have, report whether generation started, and read `checkUrl` later. Do not spin in a loop inside `execute`.

## The worked example

```ts
async () => {
  const view = await codemode.request({
    method: 'GET',
    path: '/api/daf-view/Berakhot/2a',
    query: { generate: '1' },
  });
  if (view.error || view.complete) return view;
  return { partial: true, pieces: view.pieces, missing: view.cold, generating: view.generating, checkUrl: view.checkUrl, hint: view.hint };
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

1. Add the route in the file under `packages/talmud/src/worker/routes/` that owns its group, or in `index.ts` if it does not belong to one. Keep it read-only unless it must write, and gate writes with `isTrustedRequest` (`request-guards.ts`). Route order is behaviour in Hono, so a new route also goes in the list in `tests/worker-route-table.test.ts`.
2. Describe it in `mcp-openapi.ts`: path, parameters, response shape, and a plain sentence about what it is for and when it is partial. The description is the only guidance the model gets; write it for a model that has never seen the app.
3. If the change affects how a model should behave on a cold page, update the `info.description` block at the top of the spec and the test in `tests/mcp-spec.test.ts`.
4. Add a unit test next to the existing ones in `packages/talmud/tests`. The worker is importable in Node; the Cloudflare runtime is stubbed.
5. Keep the connect page (`packages/talmud/src/client/McpPage.tsx`) in step if the worked example changes.

## Ideas for contributions

- A tool-shaped wrapper for the commonest question ("explain this daf") that hides the polling.
- Better response shapes for the sage endpoints, so an assistant can answer "who is this, and where else does he speak" in one call.
- More worked examples for the Tanach reader, which already uses the shared MCP server.
- Examples for clients other than Claude Code.

## Protocol compatibility and waiting

The transport supports the initialization handshake through protocol version
`2025-11-25`. Clients using `2026-07-28` must fall back to the older protocol.
An unsupported version returns HTTP 400 with the supported versions. It does not
mean the server crashed. The usage page shows the request method and HTTP status.

Return from `execute` when a run is pending, even for one piece. Use its
`checkUrl` in a later call. Generation can exceed the 90-second script limit.
A missing piece is not necessarily being generated: check `generating` and
relay `hint`. Credit limits, paused producers, and unavailable services can
prevent work from starting. Keep paused, skipped, and error responses intact.
