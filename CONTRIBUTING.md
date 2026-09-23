# Contributing

Thanks for helping make Talmud.dev a better place to study. Contributions are welcome across the reader, the engine, study sources, the data, the MCP server, accessibility, documentation, and tests. This page is the workflow. The docs index at [docs/README.md](docs/README.md) has everything else.

## Find something to do

- The [roadmap](docs/roadmap.md) lists open work, with a "good first issues" section that names the files to start from.
- Issues labeled [`good first issue`](https://github.com/Shaun-Regenbaum/talmud/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and [`help wanted`](https://github.com/Shaun-Regenbaum/talmud/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) are ready to pick up.
- Found a generated note that is wrong, misplaced, or mistranslated? That is a content report, not a bug: use the [wrong-note template](https://github.com/Shaun-Regenbaum/talmud/issues/new?template=content_issue.yml) and include a source we can check. [docs/data.md](docs/data.md) explains what can be fixed directly in the repo.
- For anything large, open an issue first so we can agree on the shape. Small documentation fixes do not need one.

Labels: `bug`, `content`, `enhancement`, `documentation`, `question` say what kind of thing it is. `area: reader`, `area: engine`, `area: mcp-api`, `area: data`, `area: tanach`, `area: ops` say where. `good first issue`, `help wanted`, and `needs source` are for triage.

## Set up the workspace

Node.js 22+ and pnpm 9.12.1. From a fresh clone:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

That is enough for documentation, UI, engine, and test changes. Running the reader itself needs a Wrangler login; [docs/local-dev.md](docs/local-dev.md) walks through each level.

## Work in a worktree

Several people and agents change this repository at once, and the main checkout is often dirty with someone else's work. Start every change in its own worktree from the latest `origin/staging`:

```bash
scripts/worktree-new.sh your-branch-name
cd .claude/worktrees/your-branch-name
```

## Make the change

- One purpose per pull request. Small is easier to review and to revert.
- Follow [docs/code-style.md](docs/code-style.md). Biome and `tsc --strict` enforce most of it.
- Add or update tests when behavior changes. Tests live in `packages/<pkg>/tests`.
- Reader-facing text goes through the `t()` catalog with an English and a Hebrew entry, in plain words.
- Preserve provenance and confidence on anything generated or imported. Prefer a coarse anchor over a confident-looking wrong one. Never replace a human correction with a generated value.
- Cache keys and producer recipes are frozen. If you touch one, say which and why in the pull request; a change cold-misses every cached page.
- New external sources follow [docs/sources.md](docs/sources.md).
- Using an AI assistant is welcome. [docs/contributing-with-ai.md](docs/contributing-with-ai.md) says how to do it well and what the assistant must never do.

Before opening the pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Integration tests run against a live worker and are separate: `pnpm --filter talmud test:int`.

## Open the pull request

The template asks for what changed and why, how you checked it, and three things a reviewer needs to know: cache keys or recipes touched, generated data touched, and whether AI helped and what you verified yourself. Screenshots for anything visible.

What a reviewer looks for:

- Does it do one thing, and is that thing worth doing?
- Do the tests cover the change, and do the four checks pass?
- Is the cache-key and recipe impact stated?
- Are the reader's words plain, and in both languages?
- Is the AI disclosure honest? The pull request is judged as your work either way.

Commit messages have an imperative subject that says what a reader or caller will notice. They carry no reference to an AI assistant or its vendor and no `Co-Authored-By` trailer; the pull request template's disclosure line is the place for that.

Open the pull request against `staging`, the default branch. CI runs lint, typecheck, tests, and build. A maintainer merges it into `staging`, which deploys both readers to staging.talmud.dev and staging.tanach.dev for review. Production follows after the maintainer approves that version ([docs/deployment.md](docs/deployment.md)). Once merged, clean up from the main checkout:

```bash
scripts/worktree-done.sh your-branch-name
```

## Conduct and security

Everyone here is expected to follow the [code of conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md), not a public issue.
