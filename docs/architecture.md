# How the system fits together

This is the map one level above [framework.md](framework.md). It names the
workers, the cache, the generation path, the machine interface, and the cost
controls, with the file that owns each. Read it once before your first change.

## One repository, four packages

| Package | What it holds |
| --- | --- |
| `packages/talmud` | The Talmud reader at talmud.dev. `src/client` is the Solid front end, `src/worker` is the Hono API on Cloudflare Workers, `src/lib` is shared logic (context sources, the rabbi registry, section typing, the Vilna page layout). |
| `packages/tanach` | The Tanach reader at tanach.dev. Same shape, smaller, on the same engine. |
| `packages/core` | The engine both apps import as `@corpus/core/*`: the four-primitive model, the artifact store, the producer runtime, cache keys, the LLM client with budget guards, telemetry. Ships raw TypeScript, no build step. |
| `packages/ui` | Design tokens, per-app themes, and Solid components both readers share (the map, the run tree, the usage page, the "AI paused" banner). |

Root scripts run across all packages: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint`. Scope to one app with `pnpm --filter talmud <script>`.

## What a daf is made of

The engine is four ideas. The full reference is [framework.md](framework.md); this is the short version.

- A **spine** is an addressable text: a daf and its segments, a chapter and its verses, or a set of people. `packages/core/src/model/spine.ts`.
- An **artifact** is one typed note about the spine: a background note, an argument map, a halacha, a sage. `packages/core/src/model/artifact.ts`.
- An **anchor** is where the artifact sits on the spine. It starts as "the whole daf" and is narrowed only when a rule, a model, or a person is sure. `packages/core/src/model/anchor.ts` and `placement.ts`.
- A **producer** is the recipe that makes an artifact: which sources it reads, which model runs, what shape comes back. `packages/core/src/model/producer.ts`.

Every artifact is stored with its provenance: who made it (a human, a rule, or a model), the producer's recipe hash, the content hashes of its inputs, the model, and the cost. That record is what lets the system tell a stale note from a fresh one.

The producers themselves are declared in `packages/talmud/src/worker/code-marks.ts`, a large file of prompts, output schemas, dependencies, and cache versions. `producer-registry.ts` next to it resolves those code definitions together with any overrides stored in KV. `/#howitworks` in the reader draws this registry live.

## Reading a warm daf

The reader asks for one thing: `GET /api/daf-view/:tractate/:page`. The handler in `packages/talmud/src/worker/index.ts` reads every cached artifact for that daf from KV and returns them in one response. `daf-view.ts` assembles the payload. The response is edge-cached, so a warm daf costs one request and no model call.

The client then renders the Vilna page (`packages/talmud/src/lib/daf-render`, a port of daf-renderer) and lays the notes over it, driven by what the view returned.

## Generating a cold daf

A daf nobody has opened has no artifacts. The reader calls `POST /api/daf-generate/:tractate/:page` (or `GET /api/daf-view/...?generate=1`, which reads what exists and starts the rest). That starts `DafWarmWorkflow`, a Cloudflare Workflow that runs the producers in dependency tiers, in parallel where the graph allows. A whole cold daf takes about eight minutes and costs real money.

The Workflow class lives in `index.ts`, but it runs on a second worker, `talmud-gen`, deployed from `packages/talmud/wrangler.generator.toml`. The reader worker only triggers it, through the cross-script `[[workflows]]` binding in `wrangler.toml`.

Why two workers: Cloudflare runs concurrent invocations of one script in shared 128 MB isolates. When generation and the reader shared a script, one memory-hungry generation job could kill the isolate and every reader request on it, which surfaced as `error code: 1101` in the reader. Moving all generation to its own script means a generation crash retries its own job and cannot touch a reader. The long comment above `[[workflows]]` in `wrangler.toml` records the evidence.

The generator also hosts the queue consumer for `enrichment-jobs` (single producer runs enqueued by `POST /api/run`) and the cron jobs in `warm-cron.ts` and `yomi-cron.ts`.

While a daf is cold, the API says so honestly: `daf-view` carries `status`, `generating`, `checkUrl`, `retryAfterSeconds`, `etaMinutes`, and a one-sentence `hint`. Clients, including MCP clients, are told to return what exists and come back later rather than block.

## The cache

Generated artifacts live in one KV namespace per app (`CACHE` in `wrangler.toml`), shared byte-for-byte between the reader and the generator. The key grammar is frozen in `packages/core/src/cache/keys.ts`:

```
mark:{id}:{cache_version}:{work}:{ref}
enrich:{id}:{cache_version}:{instance_id}                 (global scope)
enrich:{id}:{cache_version}:{instance_id}:{work}:{ref}    (local scope)
```

A change to how a key is derived misses every cached page in Shas at once. Re-warming everything costs on the order of $1000 and two to three weeks. That is why the key builders are covered by golden tests (`packages/talmud/tests/producer-key-golden.test.ts` and `source-cache-keys.test.ts`) and why a pull request that touches a key or a producer recipe must say so.

Freshness: each artifact carries the recipe hash it was made with. `GET /api/stale/:id/:t/:p` compares it with the current recipe. `GET /api/dependents/:id` lists what else must be regenerated when a producer changes (`packages/core/src/registry/depGraph.ts`). `POST /api/admin/rewarm/...` acts on both.

Human edits: `ArtifactStore.put` in `packages/core/src/store/artifact-store.ts` refuses to overwrite an entry whose provenance says a person wrote it. Nothing in the app writes such entries yet; the guard is there for when it does.

## The machine interface

`POST /mcp` on talmud.dev is an MCP server built on Cloudflare's code mode (`packages/talmud/src/worker/mcp.ts`). It exposes two tools. `search` lets a model query the OpenAPI document in `mcp-openapi.ts` to find endpoints. `execute` runs model-written TypeScript in a throwaway isolate that can call those endpoints and chain or poll them in one round trip. The isolate has no secrets and no network; its only exit is a bridge back into this same app, limited to `/api/*` paths. One call may run for 90 seconds (`mcp-limits.ts`). `tests/mcp-spec.test.ts` pins that number and the cold-daf wording to what the spec tells the model. [mcp.md](mcp.md) has the details.

## Cost controls

Every model call goes through `packages/core/src/llm/llm.ts`, which:

- checks the budget in `budget.ts`: an hourly cap and a daily cap, set by `HOURLY_CUSTOM_BUDGET_USD` and `DAILY_BUDGET_USD` in `wrangler.toml`;
- reserves spending room before the call (`spend-reservations.ts`) so concurrent requests cannot overshoot together;
- records the charge in the `corpus-billing` D1 database (`packages/core/src/telemetry/billing.ts`, migrations in `packages/talmud/migrations`). [cost-accounting.md](cost-accounting.md) explains what is and is not recorded.

Two gates stop doomed work before it starts. `ai-down.ts` is a short-lived sentinel written after a provider failure. `ai-credits.ts` checks the actual prepaid balance at the cold-generation entry points so an empty account is known before a Workflow is spawned. Both feed the shared "AI paused" banner (`packages/ui/src/AiStatusBanner.tsx`). `PAUSED_PRODUCERS` in `wrangler.toml` turns off individual expensive producers on cold pages.

Running out of credit is a normal state for this project, not an incident. The banner says so.

## The Tanach reader on the same engine

`packages/tanach` uses the same four primitives and the same `runProducer` from `@corpus/core/run`, without a queue or a KV-defined registry: `src/worker/run-ports.ts` supplies the ports, `spines.ts` the spines, `producers/defs.ts` the recipes. It exists partly as proof that the engine is not Talmud-specific. Its cache keys are literal templates in `run-ports.ts`, not derived from `cacheVersion`.

## Deploys

The Release workflow (`.github/workflows/release.yml`) runs Biome, typecheck, tests, and build on every pull request. A merge into `staging` deploys both apps to staging. After Shaun approves that run, it moves `master` to the same commit and deploys production: the generator worker first (the reader's binding depends on it), then the reader, then Tanach. Production always equals `master`. `scripts/ship-guard.sh` enforces the same rule for a manual `pnpm ship`. See [deployment.md](deployment.md).
