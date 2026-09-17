# @corpus/core

The engine both readers share. It knows nothing about the Talmud or the Tanach in particular: a text with addresses (a spine), a typed note (an artifact), where the note sits (an anchor), and the recipe that makes it (a producer). The full reference is [`docs/framework.md`](../../docs/framework.md).

It ships raw TypeScript. There is no build step; the apps bundle it with Vite, and `tsc` resolves `@corpus/core/*` through the path alias in `tsconfig.base.json`.

## Layout

| Directory | What is in it |
| --- | --- |
| `src/model` | The four primitives, provenance, placement lifecycle, and `compat.ts`, which projects the legacy vocabularies losslessly onto them |
| `src/store` | `ArtifactStore` (get, stale-while-revalidate, put with the human-edit guard, staleness), the envelope format, key schemes |
| `src/run` | `resolveInputs` (the dependency walk) and `runProducer` (one orchestration for every producer kind) |
| `src/cache` | The frozen cache key grammar (`keys.ts`) |
| `src/registry` | The producer dependency graph and its validator |
| `src/context` | Context items, coordinates, links, matching, and selection for prompts |
| `src/llm` | The model client, the budget guard, spend reservations, pricing, provider status |
| `src/telemetry` | Usage, billing, and run-tree records |
| `src/sefaria` | The Sefaria HTTP client |
| `src/sidebar` | The card recipe DSL |

Each subpath is exported as `@corpus/core/<dir>/<module>` (see `exports` in `package.json`).

## Checks

```bash
pnpm --filter @corpus/core typecheck
pnpm --filter @corpus/core test
```

Tests are in `tests/`. Several are characterization tests that pin the cache keys and the run contract; a change that alters their output is a change to the cache, and needs saying so in the pull request.
