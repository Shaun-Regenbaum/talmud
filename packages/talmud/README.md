# talmud

The Talmud reader at [talmud.dev](https://talmud.dev). A Solid client, a Hono API on Cloudflare Workers, and the shared logic between them.

## Layout

| Path | What is in it |
| --- | --- |
| `src/client` | The Solid app. `App.tsx` routes by URL hash (`#daf`, `#about`, `#sages`, `#argument`, `#howitworks`, `#mcp`, `#usage`, `#tutorial`). `DafViewer.tsx` is the reader. `i18n.ts` is the EN/HE string catalog. |
| `src/worker` | The API. `index.ts` holds the routes and the `DafWarmWorkflow`; `code-marks.ts` declares every producer; `mcp.ts` and `mcp-openapi.ts` are the MCP server and its spec; `daf-view.ts` assembles the one-shot read. |
| `src/lib` | Shared logic: context sources, the sage registry and data, section typing, the Vilna page layout (`daf-render`, a port of daf-renderer), terms. |
| `static` | Fonts, icons, the PWA manifest, one daf of study aids with its NOTICE. |
| `tests` | About 2,800 Vitest tests. Node tests are `*.test.ts`; jsdom client tests are `*.test.tsx`; `tests/integration` runs against a live worker. |
| `scripts` | Data builders and warmers (see `package.json` scripts). |
| `wrangler.toml`, `wrangler.generator.toml` | The reader worker and the generation worker. Both bind the same KV namespace. |
| `migrations` | The D1 billing schema. |

## Checks

```bash
pnpm --filter talmud typecheck
pnpm --filter talmud test
pnpm --filter talmud test:int   # against a running worker
pnpm --filter talmud build
```

`pnpm dev` from the repository root starts this app; see [`docs/local-dev.md`](../../docs/local-dev.md) for what it needs.

## Docs

- How the pieces fit: [`docs/architecture.md`](../../docs/architecture.md)
- The engine: [`docs/framework.md`](../../docs/framework.md)
- Adding a study source: [`docs/sources.md`](../../docs/sources.md)
- The MCP server and API: [`docs/mcp.md`](../../docs/mcp.md)
