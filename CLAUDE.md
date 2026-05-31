# Working in this repo

Talmud study app: Hono on Cloudflare Workers (`src/worker`) + Solid.js/Vite client (`src/client`), shared logic in `src/lib`. Package manager is **pnpm**. TypeScript strict.

## Framework direction — read `docs/framework.md` first

The app is being unified onto one model: **the Talmud covered in "smart notes" (pieces) pinned to "texts" (spines).** A piece knows where it sits (an anchor), what it's built from, how it was made, and how sure we are; pieces compose; views are generated from them. External study-aids are just notes on other texts, *linked* to the right spot. This is a **unification of what already exists** (marks, enrichments, the rabbi registry, flow/bridges, Q&A, context) — adopt it **incrementally, each step retiring a bespoke behaviour**, never a speculative engine.

Principles: deterministic rules grow over time but **AI keeps final say**; context sources are pluggable per piece; pick models by **benchmark** on a fixed 15–30 daf set; **precision over recall** for placement (a wrong anchor is worse than "whole daf"); **human edits/​corrections outrank AI and are never silently overwritten**; **review changes with Codex** (`codex exec --sandbox read-only`) as you go.

### Migration roadmap (remaining, smallest-first; each its own PR)
1. ✅ **Revach refs** (PR #88) — capture study-aid cross-references as real links + the `refs` contract + coord-aware rendering.
2. **Revach section placer** — conservatively align Revach entries to the daf's `argument` sections (English↔English, ordered) → fill `anchors`; place-or-omit. Wire `select.ts`/`placement.ts` to read `anchors`.
3. **Enrichment rollout** — bump `argument.background` (v4→5) + `argument-overview.synthesis` (v2→3), re-warm, with **stale-while-revalidate** (serve previous cached value while the new computes; label it; never clobber a human edit).
4. **Generic sidebar** — render a piece's enrichments from a declared render hint (retire bespoke `*Body` components).
5. **Entity pieces** (lift "global" rabbi/place), **link pieces** (unify flow/bridge/voice-edges/citations), **user pieces** (highlights/notes). *Started:* `src/lib/context/link.ts` — citations are now a first-class `Link{relation:'cites'}` (retired the `citesLabel` side channel); flow/bridge/voice edges converge here next. (NOTE: the recommended foundational `cache-keys.ts` centralization is in-flight in the `cache-cleanup` worktree; do not duplicate.)
6. **Tractate-continuous + commentary spines** (wire the reserved `external` anchor); **content-hash freshness + reverse-dependency index**.
7. ✅ **Cruft + DX** — DONE. dead `filterFlowConnections` removed (flow graph's inline `edges()` filter subsumes it); orphaned sugya-assembly removed (`/api/studio/sugya` route + `SUGYA_WINDOW_CAP` + `typing/assemble.ts` + `typing/sugya.ts` + `readFlowConnections`); `docs/framework.md` SDK-grade rewrite; **`/api/studio/*` prefix dropped to `/api/*`** (run, run-status, marks, enrichments, checks, bridge, type-profiles), `mcp-openapi.ts` kept in sync. Internal `studio` tokens kept on purpose: the `x-studio-secret` header, `studio-schema.ts`/`studio-registry.ts` filenames, and the `studio-mark`/`studio-enrichment` usage-telemetry labels (a stored taxonomy, not the URL).

Cross-cutting always: typed piece bodies, resilient anchors, provenance/confidence, eval-gated producer promotion.

- `pnpm test` — Vitest unit suite. `pnpm test:int` — integration (hits a running worker).
- `pnpm typecheck` — `tsc --noEmit`. Run it plus `pnpm test` before any PR.
- `pnpm ship` — `vite build && wrangler deploy`. Production is the custom domain **talmud.shaunregenbaum.com**. wrangler is authenticated in this environment.

## Multiple agents work this repo at once — isolate in a worktree

This repo is routinely worked by several agents in parallel (it is normal to see many `.claude/worktrees/*`). The shared main checkout is frequently dirty with another agent's uncommitted work. **Do not edit or commit code in the main checkout** — you will corrupt their work or sweep it into your commit. A real collision has happened here (two agents editing `src/worker/llm.ts` at once broke the build).

Instead, for any code change:

1. **Branch in a worktree first.** Create a git worktree on a new branch before touching code. Worktrees branch from `origin/master`/HEAD, so they exclude others' uncommitted work — that is the point.
2. **Run from the worktree.** If `node_modules` is missing there, symlink it from the main tree (`ln -s <repo>/node_modules ./node_modules`) rather than reinstalling. Then `pnpm typecheck` and `pnpm test`.
3. **PR → merge.** Commit on the branch, push, open a PR (`gh pr create`), and merge it (`gh pr merge <n> --squash --admin`). GitHub blocks self-approval, so the repo owner authorizes admin-merge.
4. **Expect master to move.** Other agents push often. If a PR won't merge, `git merge origin/master` in the worktree, resolve, push (GitHub recomputes mergeability a few seconds later).
5. **Deploy from the worktree** with `pnpm ship` when the change should go live.
6. **Clean up.** Delete the remote branch and remove the worktree + local branch (the work lives on master via the squash).

## Commit / PR text

No self-reference and no `Co-Authored-By` trailer in commit messages. Omit any "Generated with …" footer from PR bodies too, since a squash-merge folds the PR body into the master commit message.
