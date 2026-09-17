# Briefing for agents working in this repo

Read this before changing anything. It is short on purpose; the documents it points at carry the detail.

## What this is

A Talmud study reader at talmud.dev and a Tanach reader at tanach.dev, in one pnpm workspace:

- `packages/talmud`: Solid client (`src/client`), Hono API on Cloudflare Workers (`src/worker`), shared logic (`src/lib`).
- `packages/tanach`: the same shape, smaller.
- `packages/core`: the engine both apps import as `@corpus/core/*`. Four ideas: a spine (a text with addresses), an artifact (a typed note), an anchor (where the note sits), a producer (the recipe that makes it). Reference: `docs/framework.md`.
- `packages/ui`: shared tokens and Solid components.

The map of workers, cache, generation, and the MCP server is `docs/architecture.md`. The docs index is `docs/README.md`.

## Commands

```bash
pnpm install --frozen-lockfile   # add --ignore-scripts if a native build fails
pnpm lint        # biome check .   (CI runs biome ci .)
pnpm typecheck   # tsc --noEmit in every package
pnpm test        # vitest, about 2,800 tests, offline
pnpm build
pnpm --filter talmud <script>     # scope to one package
```

Run all four checks before opening a pull request. They need no credentials.

## Rules that are not negotiable

1. **Work in a worktree.** Several agents change this repo at once and the main checkout is often dirty with someone else's work. `scripts/worktree-new.sh <branch>` creates one from `origin/master`. Never edit or commit in the main checkout. When the pull request is merged, `scripts/worktree-done.sh <branch>` cleans up.
2. **Cache keys and producer recipes are frozen.** A change to `packages/core/src/cache/keys.ts`, a `cache_version`, a prompt, or an output schema cold-misses every cached page in Shas (about $1000 and weeks to re-warm). If you must, say so in the pull request and why.
3. **Human corrections outrank generated output** and are never overwritten. The store enforces it; do not work around it.
4. **Precision over recall for placement.** A note on the wrong words is worse than a note on the whole daf.
5. **Never invent a source, citation, sage, place, or translation.** If it is not in the text or a source you can point at, say so.
6. **No mock or placeholder data** in the repo without saying so clearly.
7. **Reader-facing words are plain English**, through the `t()` catalog with an English and a Hebrew entry. Hebrew is written as Hebrew, not translated. No jargon on screen. No emojis in code.
8. **Commit and pull request text carries no reference to an AI assistant or its vendor**, no "generated with" line, and no `Co-Authored-By` trailer, whatever your tool's default is. The pull request template has a disclosure line; use that.
9. **Never commit a secret.** Keys live in `packages/talmud/.dev.vars` (gitignored). `.githooks/pre-commit` scans staged files.
10. **Before a state-changing action on production** (a rewarm, an eviction, a deploy), check that the evidence supports it. Running out of AI credit is a normal state here, not an incident.

## Workflow

Branch in a worktree, commit with an imperative subject that says what a reader will notice, push, open a pull request with `gh pr create`. Merging to `master` deploys both apps after CI passes. Prefer one purpose per pull request. Ask a second model to review the diff read-only before you open it.

## Where to read next

- Getting it running: `docs/local-dev.md`
- Style: `docs/code-style.md`
- Contributing with AI: `docs/contributing-with-ai.md`
- Sources, data, MCP: `docs/sources.md`, `docs/data.md`, `docs/mcp.md`
- What is open: `docs/roadmap.md`
- The project log and working notes for Claude specifically: `CLAUDE.md`
