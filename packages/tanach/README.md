# tanach

The Tanach reader at [tanach.dev](https://tanach.dev): a scroll view and a Mikraot Gedolot view, in English and Hebrew, on the same engine as the Talmud reader.

It exists partly as proof that the engine is not Talmud-specific. It uses the same `runProducer` from `@corpus/core/run` with no queue and no KV-defined registry.

## Layout

| Path | What is in it |
| --- | --- |
| `src/client` | The Solid app: `App.tsx`, `MikraotGedolot.tsx`, the parsha drawer and map, the inspector, the usage page. |
| `src/worker` | The Hono API. `run-ports.ts` supplies the engine's ports (cache keys here are literal templates, not derived from a version), `spines.ts` the spines, `producers/` the recipes, `gazetteer.ts` the place data, `parsha-calendar.ts` the weekly reading. |
| `src/lib` | Books, commentators, Hebrew helpers, parsha logic, sources, and the shared page layout (`daf-render`). |
| `tests` | Vitest, Node only. |
| `scripts/build-gazetteer.mjs` | Rebuilds the gazetteer. |

## Checks

```bash
pnpm --filter tanach typecheck
pnpm --filter tanach test
pnpm --filter tanach build
pnpm dev:tanach   # from the repository root
```

## Docs

The shared docs live at the repository root: [`docs/README.md`](../../docs/README.md). The worked example of how an app adopts the engine is the tanach section of [`docs/framework.md`](../../docs/framework.md).
