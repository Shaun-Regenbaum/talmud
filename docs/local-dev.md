# Running the code locally

Most contributions need no credentials at all. This page says what works at each level and what to expect.

## Level 0: build, typecheck, test, lint

Needs Node.js 22 or newer, pnpm 9.12.1, and Git. Nothing else.

```bash
git clone https://github.com/Shaun-Regenbaum/talmud.git
cd talmud
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm test` runs about 2,800 unit tests in the Talmud package plus the Core and Tanach suites, in about ten seconds. They stub the Cloudflare runtime (`packages/talmud/tests/stubs/cloudflare-workers.ts`) and never call a model or the network.

If `pnpm install` stops on a native build of `sharp` (a transitive dependency), rerun it with `--ignore-scripts`. Nothing in the checks needs the native module.

Work in a worktree, not the main checkout, because several people and agents change this repo at once: `scripts/worktree-new.sh <branch>` creates one from `origin/staging` and installs it.

## Level 1: the reader, with an empty cache

`pnpm dev` starts Vite with the Cloudflare plugin, which runs both workers in a local runtime: the reader (`packages/talmud/wrangler.toml`) and the generator (`wrangler.generator.toml`, wired in as an auxiliary worker in `packages/talmud/vite.config.ts`). The reader's Workflow binding points at the generator by script name, so the generator must be present or the runtime refuses to start with:

```
Worker "workflows:daf-warm-gen"'s binding "USER_WORKFLOW" refers to a service "core:user:talmud-gen", but no such service is defined.
```

Two of the bindings are remote (`[ai]` and `[[send_email]]` carry `remote = true`), so Wrangler needs a login:

```bash
pnpm exec wrangler login
pnpm dev
```

If your Cloudflare login has more than one account, set `CLOUDFLARE_ACCOUNT_ID` in the shell first, or the plugin cannot choose one. `pnpm dev` runs a pre-flight that checks the login and prints what to do if it has expired; `SKIP_WRANGLER_CHECK=1 pnpm dev` skips that check.

Once it is up, `http://localhost:5173/` serves the reader and `/api/health` answers `{"ok":true}`. The local KV namespace starts empty, so every daf is cold: `GET /api/daf-view/Berakhot/2a` returns `complete: false` with the full list of producers still to run. Everything that does not need generated notes works: the page layout, navigation, the tour, the About page, the how-it-works page's static parts.

## Level 2: generating notes locally

Generating a note calls a paid model through OpenRouter, and the cost gates in `packages/core/src/llm/budget.ts` apply. Put the key in `packages/talmud/.dev.vars` (gitignored):

```
OPENROUTER_API_KEY=...
```

Then a cold `POST /api/run` or `POST /api/daf-generate/:tractate/:page` runs for real, against your key and your local empty cache. Expect a whole daf to take several minutes and to cost real money. Most contributors never need this; a change to a prompt or a schema is usually checked with the unit tests and the fixtures under `packages/talmud/tests/fixtures`.

## What needs the shared secret

Routes that spend money on someone else's behalf or change stored content check `x-studio-secret` (or `Authorization: Bearer`) against `STUDIO_SECRET`, in `isTrustedRequest` in `packages/talmud/src/worker/index.ts`. Without the secret set, they return 403. That covers the `/api/admin/*` mutations (rewarm, cache eviction, registry edits) and the privileged knobs on `POST /api/run` (`ad_hoc`, `model_override`, `bypass_cache`). Ordinary reads, `POST /api/run` for a registered producer, and `POST /api/daf-generate` are public, because the reader itself calls them.

## UI-only work without the dev server

If you only need to look at a page that does not call the API, build the client and serve the output as static files:

```bash
cd packages/talmud
pnpm exec vite build
cd dist/client && python3 -m http.server 5199
```

Then open `http://127.0.0.1:5199/#about`. Pages that read from the API (`#howitworks`, the daf itself) will show their empty state.

## Production

Production is talmud.dev and tanach.dev. Merging to `master` deploys both after CI passes. `pnpm ship` from a worktree is the manual fallback and refuses to run unless the tree is clean and matches `origin/master` (`scripts/ship-guard.sh`). Deploys need the project's Cloudflare token; contributors do not need it.

## Integration tests

`pnpm --filter talmud test:int` runs `packages/talmud/tests/integration` against a live worker (`TALMUD_URL`, default `http://localhost:5173`). Some of those paths trigger generation on a cache miss, which is why the GitHub workflow for them is manual (`.github/workflows/integration.yml`).
