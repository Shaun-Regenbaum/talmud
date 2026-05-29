# Handoff — Framework standardization (anchoring + checks)

You're picking up a multi-step refactor of the Talmud app's content pipeline.
This doc is self-contained: it assumes no prior context. Read it top to bottom,
then read the two companion docs:
- **The full plan**: `~/.claude/plans/how-does-our-current-jazzy-globe.md` (the approved roadmap — current architecture + target + all phases).
- **The section-typing design**: `docs/section-typing.md` (Track C, depends on this work).

## TL;DR — where we are

Goal: the pipeline does the same jobs (anchor content to text, post-process LLM
output) several different ways. We're converging them onto **one anchoring
layer** and **one post-LLM check layer**, then building section-typing on top.
Work is split into Track A (backend, leading) → B (render/DX) → C (typing).

Done & shippable: **A1** (unified verbatim placer) = **PR #45** (open, needs owner review/merge).
In progress: **A2** (standardized check layer) — the library exists + is tested,
but is **not yet wired into the runners**. That wiring is your immediate task.

## Repo + how to work in it (IMPORTANT)

- Stack: Hono on Cloudflare Workers (`src/worker`) + Solid.js client (`src/client`) + shared logic (`src/lib`). Package manager **pnpm**, TypeScript strict.
- **Multiple agents work this repo in parallel. NEVER edit/commit the main checkout** (`/Users/shaunie/Documents/Code/talmud`). Work in a git worktree on a branch.
- Commands: `pnpm test` (vitest), `pnpm typecheck` (`tsc --noEmit`), `pnpm ship` (build + wrangler deploy to talmud.shaunregenbaum.com).
- Commit rules (from CLAUDE.md): **no self-reference, no `Co-Authored-By` trailer**, no "Generated with" footer in PR bodies.
- Merge flow: PR → `gh pr merge <n> --squash --admin` is owner-authorized (GitHub blocks self-approval). **Do not self-merge**; leave PRs for the owner unless told otherwise.

### Current worktree / branch state (exact)

- Worktree dir: `/Users/shaunie/Documents/Code/talmud/.claude/worktrees/section-typing-design`
  - **Note the dir name is stale**: it currently has branch **`framework-check-layer`** checked out (not `section-typing-design`). `git branch --show-current` to confirm.
- Branch **`section-typing-design`** = `origin/master` + 1 commit `2eef12c` (A1). → **PR #45**, base `master`, OPEN.
- Branch **`framework-check-layer`** = `2eef12c` (A1) + `11f4f6c` (A2 layer). Pushed to origin. **No PR yet.** This is where you continue A2.
- Both branches were cut from `origin/master` (which is ahead of the stale main checkout — always branch from `origin/master`).

### Environment gotchas (will bite you)

- **node_modules**: the worktree symlinks the main tree's `node_modules` (`ln -s <repo>/node_modules ./node_modules`). It predates PR #32, so `@hono/mcp`, `@cloudflare/codemode`, `@modelcontextprotocol/sdk` are **missing** → `tsc` reports 3-4 "Cannot find module" errors in `src/worker/mcp.ts` + `index.ts:~460`. **These are pre-existing and unrelated — ignore them.** Filter with `npx tsc --noEmit 2>&1 | grep -v "@hono/mcp\|@cloudflare/codemode\|@modelcontextprotocol"`.
- **Live API**: production `POST /api/studio/run` (cache hits → 200, else 202 + poll `/api/studio/run-status/{runId}?k=`) is open/read. **It blocks the default Python `urllib` user-agent (403)** — set a browser `User-Agent` header. `bypass_cache`/`model_override` need the `x-studio-secret` header (we don't have it). A budget guard ($10/hr, $300/day) caps spend at the `runLLM` chokepoint.
- **Sandbox**: throwaway scripts go in `/Users/shaunie/Documents/Code/Sandbox/` (not in-repo). The capture/regen scripts used for A0 are there: `capture_golden_anchors.py`, `regen_stale_aggadata.ts` (run with `npx tsx`).

## The pipeline (just enough to orient)

Seven stages; canonical anchor coordinate = **0-based Sefaria segment index** within a `(tractate, page)`:
SOURCE (fetch HB+Sefaria, segment) → PLACE (attach context to segments) → EXTRACT (marks) → ENRICH (LLM passes on mark instances) → CHECK (post-LLM) → SYNTHESIZE → RENDER (gutter/sidebar/maps).

Key engine files in `src/worker/index.ts`:
- `runMarkOnce` — runs a mark extractor; **had** a hardcoded `if (def.id===…)` post-process chain (now partly delegated, see below).
- `runEnrichmentOnce` — runs an enrichment; has its own `if (def.id===…)` chain for the linters + rabbi-evidence anchor resolution, plus cache-write gating via `noteLintAttempt` / `MAX_LINT_ATTEMPTS=3` (`src/worker/lint-failures.ts`).
- `resolveDependencies` — resolves `'gemara'|'commentaries'|'mishna'|'context'` + `{mark:id}`/`{enrichment:id}` into prompt template vars.
- `getGemaraSlice(env, tractate, page, false)` → `{ segments_he, ... }` is THE segment grid (Sefaria segments mapped through `stripHtmlServer`). Same as the `ctx:gemara:v1:` KV key.
- Definitions are declarative in `src/worker/code-marks.ts` (`MarkDefinition`/`EnrichmentDefinition`, shape in `src/worker/studio-schema.ts`). `def_hash = sha256(JSON.stringify(extractor) + JSON.stringify(render))` (studio-schema.ts ~line 569) — this is part of the cache key, so changing it busts the LLM cache.

## What's DONE

### A0 — golden fixtures (committed on `section-typing-design`/PR #45)
`tests/fixtures/golden-anchors/`: captured `{ raw, expected }` (raw = pre-postProcess LLM output; expected = resolved/cached output) for 4 dapim (Gittin 67b, Gittin 68a, Berakhot 2a, Sanhedrin 59b) × marks (argument, argument-move, pesukim, aggadata, rabbi), plus `gemara_<t>_<p>.json` (the segment grid). All captured as cache hits (no LLM cost).

### A1 — unified verbatim placer (PR #45)
- `src/lib/place/verbatim.ts` — the ONE DOM-free matcher: `normalizeHebrew` (strip nikud/punct/bidi, collapse ws), `buildVerbatimGrid`, `prefixTries`, `findExcerpt(grid, excerpt, fromSeg, toSeg, {last?, fullMatchLen?})`. Options capture the only real differences between the old copies (matched-prefix vs full-excerpt `matchLen`; first vs last occurrence).
- `src/lib/place/reanchor.ts` — four pure functions (`reanchorArgument/ArgumentMove/Pesukim/Aggadata`) that replicate the old `postProcessX` orchestration on top of the shared matcher. Each MUTATES + returns the parsed object. `reanchorArgument` uses `partitionSections` from `src/lib/argumentMoves.ts`.
- `src/worker/index.ts` — the four `postProcessArgument/ArgumentMove/Pesukim/Aggadata` are now **thin delegations**: guard → `getGemaraSlice` → `reanchorX(parsed, slice.segments_he)`. ~500 lines of duplicated matcher code deleted.
- **Proven byte-identical** to production by `tests/golden-anchors.test.ts` (16 cases). **No `cache_version` bump** (output unchanged → live caches valid).
- Regression tests added: `tests/place/verbatim.test.ts` (matcher contract: normalization, prefix fallback, token offsets, matchLen, first/last), `tests/place/reanchor-invariants.test.ts` (idempotency + clean partition / in-bounds moves / ordered offsets).
- **Stale-cache finding**: 2 aggadata fixtures (Gittin 68a, Sanhedrin 59b) had production cache from an OLDER `postProcessAggadata` (1-word `endExcerpt` → old fallback painted to segment end; current code paints the start excerpt). Their `expected` was regenerated from current code and marked `_regeneratedFromCurrentCode` in-file. The other 14 stay anchored to live production.

### A2 — standardized check layer, INCREMENT 1 ONLY (committed on `framework-check-layer`, NOT yet PR'd)
- `src/lib/check/postcheck.ts` — `PostCheck` registry + `runChecks(ids, parsed, ctx)`. Two phases: `transform` (mutates parsed — the re-anchorers are registered as `reanchor-argument` etc.) and `validate` (returns `CheckIssue[]` with `severity: 'hard'|'soft'` — the linters `lintSynthesis`/`lintHalachaParsed` are registered as `hebrew-excerpt`/`hebrew-gloss`). `runChecks` runs transforms (in order) then validators.
- `tests/check/postcheck.test.ts` (8 cases) — transforms resolve anchors identically to the direct re-anchorer; validators flag a calque / English-only pasuk; phases ordered; unknown ids tolerated.
- **This layer is additive and NOT used by the runners yet.** Nothing imports `runChecks` in `index.ts`.

Current totals: 57 test files, **1253 tests passing**; typecheck clean except the unrelated MCP-module errors.

## YOUR IMMEDIATE TASK — A2 increment 2: wire `runChecks` into the runners

Goal: replace the two hardcoded `if (def.id===…)` post-process chains with `runChecks`, driven by a new declarative `checks?: string[]` on each definition. Must stay byte-identical (golden suite green) and **must not bump `def_hash`**.

Steps:
1. **Add `checks?: string[]`** to `MarkDefinition` and `EnrichmentDefinition` in `src/worker/studio-schema.ts`.
2. **Exclude `checks` from `def_hash`.** Find the `def_hash` computation (sha256 over `extractor + render`, ~studio-schema.ts:569 and wherever it's computed for code/KV defs) and ensure `checks` is NOT included (checks are post-processing, not generation input). Verify a def with `checks` set produces the SAME `def_hash` as before → cache keys unchanged.
3. **Declare checks on the code defs** in `src/worker/code-marks.ts`: `argument` → `['reanchor-argument']`, `argument-move` → `['reanchor-argument-move']`, `pesukim` → `['reanchor-pesukim']`, `aggadata` → `['reanchor-aggadata']`, `pesukim.synthesis` → `['hebrew-excerpt']`, `halacha.*` → `['hebrew-gloss']`.
4. **Rewire `runMarkOnce`** (`src/worker/index.ts`): replace the `if (def.id==='argument') parsed = await postProcessArgument(...) else if …` chain with `const { parsed: checked, issues } = await runChecks(def.checks ?? [], parsed, { tractate, page, segmentsHe: slice.segments_he, defId: def.id, lang })`. You'll need the gemara slice available (the delegating wrappers fetch it; centralize one fetch). **Special cases that DON'T fit the segments-only transform yet:** `postProcessRabbi` (needs the daf Hebrew text, not segments — different signature) and `recordObservedPlacesFromMark` (a side effect, not a transform). Leave those as-is for now, or model them explicitly. Only the 4 verbatim re-anchorers move to `runChecks`.
5. **Rewire `runEnrichmentOnce`**: replace its `pesukim.synthesis`/`halacha.*` lint if-chain with `runChecks(def.checks ?? [], parsed, ctx)`. Keep `postProcessRabbiEvidence` as-is for now (it's a transform but not yet ported — see A1b). Feed the `hard` issues into the EXISTING cache-gating (`noteLintAttempt` / `MAX_LINT_ATTEMPTS`): pin on no hard issues; otherwise bounded-retry. Preserve `lint_issues` on `RunResult` (or alias to `check_issues` keeping the same JSON path so `/api/usage` `readLintFailures` and the dev tray keep working).
6. **Verify**: `pnpm test` (golden + all must stay green → proves the rewiring reproduces the if-chains exactly), filtered `tsc`. Then PR `framework-check-layer` with `--base section-typing-design` so the diff is just A2 (stacked on A1).

Risk: getting the cache-gating semantics or the synthesis-text extraction subtly wrong. The golden suite + `tests/check/postcheck.test.ts` are your safety net; add a test that a `hard` issue prevents the cache write.

## REMAINING ROADMAP (tasks already filed)

- **A3 — new checks, soft→hard.** Add `anchor-verbatim` (resolved excerpt actually present in its claimed segment — catches hallucinations like `אריגתא` where the daf says `כשורי`), `edge-integrity` (voices-graph edges: from/to ∈ voices, ordered ranges, no contradictory `opposes`+`supports` on one pair), `partition-clean` (no gaps/overlaps/dupes — catches the duplicated Rav Amram/Yalta moves). Ship `soft` first, observe via `GET /api/usage` (`readLintFailures`), promote to `hard` per-mark — and **only that promotion warrants a per-mark `cache_version` bump, one at a time** (full-shas re-warm is ~$1000, so never bump broadly).
- **A4 — cross-daf coordinate.** Add `src/lib/context/coord.ts` (`AnchorCoord {tractate,page,seg}`, `AnchorSpan = AnchorCoord[]`, bridge helpers); optional `coord?` on `SegMatch` (`src/lib/context/match.ts`) + `Placement` (`src/lib/context/placement.ts`); derive a `cross-daf` level. Purely additive (in-daf readers ignore it). `CrossDafAnchor` already exists unused in studio-schema.ts. Unblocks the cross-page "sugya map".
- **A1b — converge remaining matchers.** Port `postProcessRabbiEvidence` (`index.ts`) onto `verbatim.ts` (add a rabbi-evidence golden fixture). Then `hbAlign.findExact/findFuzzy` (`src/client/hbAlign.ts`) + `rabbi-observations.resolveSegIdxs` — these use DIFFERENT normalization (final-letter folding, fuzzy/abbrev tolerance), so converge carefully behind their own golden coverage, NOT a byte-identical merge.
- **Track B (render/DX)** and **Track C (section typing + coverage)** — see the plan file + `docs/section-typing.md`. Track C's key finding: most "uncategorized" daf segments are pure dialectic (שקלא וטריא) which no content mark models — so `argument` is the base type and halacha/aggadata/pesukim are overlays.

## Verify anything

```
cd <worktree>                       # the section-typing-design worktree dir
git branch --show-current           # expect framework-check-layer
[ -e node_modules ] || ln -s /Users/shaunie/Documents/Code/talmud/node_modules ./node_modules
npx vitest run                      # full suite (expect all green)
npx vitest run tests/place tests/check tests/golden-anchors.test.ts   # this work's tests
npx tsc --noEmit 2>&1 | grep -v "@hono/mcp\|@cloudflare/codemode\|@modelcontextprotocol"   # expect empty
```

## Key file map

- `src/lib/place/verbatim.ts`, `src/lib/place/reanchor.ts` — the unified placer (A1).
- `src/lib/check/postcheck.ts` — the check registry + `runChecks` (A2).
- `src/worker/index.ts` — `runMarkOnce`, `runEnrichmentOnce`, `resolveDependencies`, `getGemaraSlice`, the (now-thin) `postProcessArgument/ArgumentMove/Pesukim/Aggadata`, plus `postProcessRabbi`/`postProcessRabbiEvidence`/`recordObservedPlacesFromMark` (not yet ported).
- `src/worker/code-marks.ts` — mark/enrichment definitions (where `checks:` will be declared).
- `src/worker/studio-schema.ts` — definition types + `def_hash` (add `checks?`, exclude from hash).
- `src/lib/synthesisLint.ts`, `src/lib/halachaLint.ts`, `src/worker/lint-failures.ts` — the linters (wrapped) + bounded-retry gating.
- `tests/place/*`, `tests/check/*`, `tests/golden-anchors.test.ts`, `tests/fixtures/golden-anchors/*` — the regression nets.
