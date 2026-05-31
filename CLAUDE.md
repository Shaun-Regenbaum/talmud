# Working in this repo

Talmud study app: Hono on Cloudflare Workers (`src/worker`) + Solid.js/Vite client (`src/client`), shared logic in `src/lib`. Package manager is **pnpm**. TypeScript strict.

## Framework direction — read `docs/framework.md` first

The app is being unified onto one model: **the Talmud covered in "smart notes" (pieces) pinned to "texts" (spines).** A piece knows where it sits (an anchor), what it's built from, how it was made, and how sure we are; pieces compose; views are generated from them. External study-aids are just notes on other texts, *linked* to the right spot. This is a **unification of what already exists** (marks, enrichments, the rabbi registry, flow/bridges, Q&A, context) — adopt it **incrementally, each step retiring a bespoke behaviour**, never a speculative engine.

Principles: deterministic rules grow over time but **AI keeps final say**; context sources are pluggable per piece; pick models by **benchmark** on a fixed 15–30 daf set; **precision over recall** for placement (a wrong anchor is worse than "whole daf"); **human edits/​corrections outrank AI and are never silently overwritten**; **review changes with Codex** (`codex exec --sandbox read-only`) as you go.

### Migration roadmap (remaining, smallest-first; each its own PR)
1. ✅ **Revach refs** (PR #88) — capture study-aid cross-references as real links + the `refs` contract + coord-aware rendering.
2. **Revach section placer** — conservatively align Revach entries to the daf's `argument` sections (English↔English, ordered) → fill `anchors`; place-or-omit. Wire `select.ts`/`placement.ts` to read `anchors`.
3. **Enrichment rollout** — bump `argument.background` (v4→5) + `argument-overview.synthesis` (v2→3), re-warm, with **stale-while-revalidate** (serve previous cached value while the new computes; label it; never clobber a human edit).
4. **Generic sidebar** — render a piece's enrichments from a declared render hint (retire bespoke `*Body` components). *Started:* `SidebarHint` + pure `resolveSidebarHint` + generic `<SidebarPanelFromHint>` adapter in `src/client/sidebar/primitives.tsx`; first slice retired `PlaceBody` (now `PLACES_HINT` + `PlaceChips` over the adapter). Next: convert RabbiBody/HalachaBody/etc.; then move the hint onto the mark definition in `code-marks.ts` (registry-driven, so the client needs no per-mark wiring) + add `flip`/`titleLang` hint options for rabbi/pasuk headings.
5. **Entity pieces** (lift "global" rabbi/place), **link pieces** (unify flow/bridge/voice-edges/citations), **user pieces** (highlights/notes). *Started:* `src/lib/context/link.ts` — `Link{relation}` with two relations so far: `'cites'` (`citationLink`, retired the `citesLabel` side channel) and `'continues'` (`continuationLink`, the tractate-continuity/bridge edge, surfaced additively on `/api/bridge` as `link`). `LinkRelation` now covers the FULL flow-graph relation set (`cites`/`continues`/`resolves`/`depends-on`/`parallels`/`contrasts`/`generalizes`) + `isLinkRelation` guard + `flowLinks(edges, coordOf)` (the argument-overview flow graph → `{source, link}[]`). So every edge in the system expresses as a Link; the data layer is built ahead of the unified link view that will consume it. Voice edges next. (NOTE: the recommended foundational `cache-keys.ts` centralization is in-flight in the `cache-cleanup` worktree; do not duplicate.)
6. **Tractate-continuous + commentary spines** (wire the reserved `external` anchor); **content-hash freshness + reverse-dependency index**. *Started:* source-cache KV keys centralised into `cache-keys.ts` (`keyForHebrewBooks`/`keyForSefariaBundle`/`keyForSefariaSegments`/`keyForRishonim`/`keyForHalachaRefs`/`keyForDafTopics`/`keyForMishnaBundle`/`keyForSaCommentary`), byte-exact (raw `tractate:page`, NOT slug — a slug switch cold-misses all of Shas; locked by `tests/source-cache-keys.test.ts`). Fixed a discovered drift: `warm-cron.ts` was probing `sefaria-bundle:v2` while the reader uses v5. Then centralised the multi-site `index.ts` keys (`keyForRabbiEnriched`/`keyForRabbiWikidata`/`keyForRabbiWikiBio`/`keyForAnalyzeSkeleton`/`keyForRegion`/`keyForMesorah` — 15 sites, each built independently 2-4× = the same drift hazard), byte-exact. Then centralised the commentary-spine + bridge keys (`keyForCommentaryWorks`/`keyForCommentaryText`/`keyForReferences`/`keyForBridge` — note bridge slug-normalises, a third shape). Centralising ALL keys is the prerequisite for the **reverse-dependency index** (this same roadmap item): you can't enumerate producer keys for re-warm if they're scattered through index.ts. Remaining single-site keys (pasuk ×2, ctx-match, translate, hebraize, rabbi-bio's two shapes, rabbi-obs) are the last batch. **Reverse-dependency index built** (`src/lib/registry/depGraph.ts`: `producerNodesFrom`/`reverseDependencyIndex`/`transitiveDependents` over the `dependencies` DAG; read-only `GET /api/dependents/:id` returns the re-warm cascade) — computes the bump cascade reasoned by hand all along (e.g. `argument.background` → `argument.synthesis` → …). The other freshness half — store+compare `recipeHash` (#104) to make staleness automatic — remains. (The `cache-cleanup`/`remove-legacy-2` worktrees were confirmed ABANDONED — uncommitted work untouched since 2026-05-13, ~190 commits behind — and superseded.)
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
