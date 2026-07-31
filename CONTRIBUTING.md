# Contributing

Thanks for helping make Talmud.dev a better place to study. Contributions are welcome across the reader, corpus model, source integrations, accessibility, documentation, and tests.

## Find a useful first change

- Look through issues labeled [`good first issue`](https://github.com/Shaun-Regenbaum/talmud/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/Shaun-Regenbaum/talmud/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
- If you found a bug or have a focused improvement, [open an issue](https://github.com/Shaun-Regenbaum/talmud/issues/new) before investing in a large change.
- For product or data-model work, read [`docs/framework.md`](docs/framework.md) first. It explains the spine, anchor, artifact, and producer model that new behavior should extend.

Small documentation fixes do not need an issue first.

## Set up the workspace

Use Node.js 22+ and pnpm 9.12.1. From a fresh clone:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

The repository is a pnpm workspace. Run commands from the repository root, or target one app with `pnpm --filter talmud <script>`.

To run the Talmud reader locally, authenticate Wrangler and start Vite:

```bash
pnpm exec wrangler login
pnpm dev
```

The reader's development configuration uses remote Cloudflare bindings for Workers AI and email, so a Wrangler session is required for a fully working local API. Project secrets are only needed for generation, administration, and production operations.

## Work in an isolated branch

This repository is often changed concurrently. Start each change in its own worktree from the latest `origin/master`:

```bash
scripts/worktree-new.sh your-branch-name
cd .claude/worktrees/your-branch-name
```

The helper creates the branch, installs workspace dependencies, and keeps unrelated work out of your commit.

## Make the change

- Prefer a small pull request with one clear purpose.
- Preserve source provenance and confidence when adding generated or imported content.
- Prefer a coarse or omitted anchor over a confident-looking wrong placement.
- Do not silently replace a human correction with a generated value.
- Register new external study sources by following [`docs/sources.md`](docs/sources.md).
- Add or update tests when behavior changes.

Before opening a pull request, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Integration tests target a running worker and are separate:

```bash
pnpm --filter talmud test:int
```

## Open the pull request

Explain what changed, why it belongs in the reader, and how it was validated. Screenshots are useful for visible UI changes. CI runs lint, typechecking, unit tests, and builds; merges to `master` deploy the production apps after those checks pass.

Once a pull request is merged, remove its worktree from the main checkout:

```bash
scripts/worktree-done.sh your-branch-name
```
