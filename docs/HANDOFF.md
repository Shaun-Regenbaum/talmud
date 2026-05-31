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

**Track A (backend) is functionally complete** — A1, A2, A3, A1b, A4 are all
done and live as a stacked PR chain (none merged yet; owner admin-merges
top-to-bottom):

| PR  | Increment | Base |
|-----|-----------|------|
| #45 | A1 — unified verbatim placer | master |
| #49 | A2 — check layer wired into the runners | #45 |
| #50 | A3 — soft integrity checks (anchor-verbatim / partition-clean / edge-integrity) | #49 |
| #51 | A1b — rabbi-evidence anchoring onto the placer | #50 |
| #52 | A4 — cross-daf anchor coordinate | #51 |

Totals on the tip branch (`framework-crossdaf-coord`): **61 test files, 1292
tests passing**; typecheck clean. **Your immediate task is to merge the stack**
(owner) — then the only Track A work left is *promoting* a soft A3 check to
`hard` once you've watched it on real traffic (needs observation data first, so
it can't be done blind). After that it's Track B (render/DX) and Track C
(section typing). See "YOUR IMMEDIATE TASK" + "REMAINING ROADMAP".

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
- **Live API**: production `POST /api/run` (cache hits → 200, else 202 + poll `/api/run-status/{runId}?k=`) is open/read. **It blocks the default Python `urllib` user-agent (403)** — set a browser `User-Agent` header. `bypass_cache`/`model_override` need the `x-studio-secret` header (we don't have it). A budget guard ($10/hr, $300/day) caps spend at the `runLLM` chokepoint.
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

### A2 — standardized check layer (committed on `framework-check-layer`, NOT yet PR'd)
**Increment 1 — the registry library:**
- `src/lib/check/postcheck.ts` — `PostCheck` registry + `runChecks(ids, parsed, ctx)`. Two phases: `transform` (mutates parsed — the re-anchorers are registered as `reanchor-argument` etc.) and `validate` (returns `CheckIssue[]` with `severity: 'hard'|'soft'` — the linters `lintSynthesis`/`lintHalachaParsed` are registered as `hebrew-excerpt`/`hebrew-gloss`). `runChecks` runs transforms (in order) then validators.
- `tests/check/postcheck.test.ts` (8 cases) — transforms resolve anchors identically to the direct re-anchorer; validators flag a calque / English-only pasuk; phases ordered; unknown ids tolerated.

**Increment 2 — wired into the runners (commit `45317c2`):**
- Added `checks?: string[]` to `MarkDefinition`/`EnrichmentDefinition` in BOTH `studio-schema.ts` and `studio-registry.ts` (the runner's enrichment def is the *registry* type, not the schema one — `adaptCodeEnrichment` now copies `checks` across). Excluded from `def_hash`/the cache key (cache keys use only `id`+`cache_version`; `def_hash` is a literal, never recomputed from the def — verified).
- Declared checks on the code defs (`code-marks.ts`): argument/argument-move/pesukim/aggadata → `reanchor-*`; pesukim.synthesis → `hebrew-excerpt`; halacha.{codification,practical,disputes,synthesis} → `hebrew-gloss`. Threaded `checks` through `makeEnrichment`/`makeSynthesis`.
- `runMarkOnce`: the `if (def.id===…)` re-anchor chain is replaced by one `runChecks(def.checks, …)` call (fetches the gemara slice once). rabbi/places stay special-cased. The 4 inline `postProcessArgument/…` wrappers are DELETED (golden tests import the pure re-anchorers directly, not the wrappers).
- `runEnrichmentOnce`: the two lint if-blocks are replaced by `runChecks`; gating now keys on `hardIssueCount` (all current validator issues are `hard`, so identical to the old `!lint_issues`). `lint_issues` still stored on `RunResult` (now `CheckIssue[]`; `summarizeIssue` output is unchanged since `match` is always present). `postProcessRabbiEvidence` unchanged (A1b).
- `tests/check/wiring.test.ts` (5 cases) — locks the declared checks to the registry; proves `keyForMark`/`keyForEnrichment` are invariant to `checks`.

Current totals: 58 test files, **1258 tests passing** (A2 tip).

### A3 — soft integrity checks (PR #50, on `framework-checks-a3`)
Three observe-only validators in `src/lib/check/postcheck.ts`, all `severity: 'soft'` (never gate, no `cache_version` bump):
- `anchor-verbatim` — resolved excerpt literally present (normalized) in its anchored segment. On argument/argument-move/pesukim/aggadata.
- `partition-clean` — inverted ranges, exact-duplicate instances, and (argument only) overlapping section ranges. On argument/argument-move.
- `edge-integrity` — argument.voices graph: edges to unknown voices, self-loops, opposes+supports on one pair. On argument.voices.
Surfaced via a new `check_issues` field on `RunResult` (marks attach all; enrichments split `hard`→`lint_issues`/gating, full set→`check_issues`). Tests: `tests/check/soft-checks.test.ts`.

### A1b — rabbi-evidence onto the placer (PR #51, on `framework-rabbi-evidence`)
`reanchorRabbiEvidence` in `src/lib/place/reanchor.ts` (excerpt at the entry top level, whole-daf search) registered as the `reanchor-rabbi-evidence` transform; the two evidence enrichments opt in; `runEnrichmentOnce` drops the `postProcessRabbiEvidence` special-case and feeds `runChecks` the real gemara slice (so enrichment transforms get the segment grid); the inline fn is deleted. Byte-identical (`findExcerpt` ≡ the old loop). Tests: `tests/place/reanchor-rabbi-evidence.test.ts`. (Remaining A1b: the fuzzier `hbAlign.findExact/findFuzzy` + `rabbi-observations.resolveSegIdxs` — DIFFERENT normalization, converge behind their own coverage, NOT a byte-identical merge.)

### A4 — cross-daf coordinate (PR #52, on `framework-crossdaf-coord`)
`src/lib/context/coord.ts`: `AnchorCoord {tractate,page,seg}` + `AnchorSpan` + helpers (`coordForSeg`, `localSeg`, `sameDaf`/`isCrossDaf`, `normalizeSpan`, `spanByDaf`, `coordFromTarget` bridging the unused `CrossDafAnchor`). Optional `coord?` added to `SegMatch`/`ContextItem`/`Placement`; `placementOf(it, currentDaf?)` derives a `cross-daf` level only when a daf is supplied AND the coord is off it (single-arg callers unchanged). `applyMatches` carries the coord. Purely additive, no cache bump. Tests: `tests/context-coord.test.ts`. Unblocks the cross-page sugya map.

## YOUR IMMEDIATE TASK — merge the Track A stack, then promote a check

1. **Merge the stack** (owner admin-merge, top-to-bottom): #45 → #49 → #50 → #51 → #52. Each becomes mergeable once its base lands. Then `pnpm ship` from a worktree to deploy (all of it is byte-identical / additive — no cache bump, so deploy is safe).
2. **Promote one A3 soft check to `hard`** — but only AFTER watching it on real traffic. The soft issues ride in `RunResult.check_issues`; you need a way to observe their rate (extend `/api/usage` to roll up `check_issues`, or sample cached outputs) BEFORE flipping a check to `hard`. Promotion = change that check's `severity` to `'hard'` for one mark and bump THAT mark's `cache_version` once (full-shas re-warm ≈ $1000 — never bump broadly).

## REMAINING ROADMAP

- **Observe → promote soft checks** (see immediate task #2). Blocked on an observation surface for `check_issues`.
- **A1b leftovers** — converge `hbAlign.findExact/findFuzzy` (`src/client/hbAlign.ts`) + `rabbi-observations.resolveSegIdxs`. These use DIFFERENT normalization (final-letter folding, fuzzy/abbrev tolerance), so converge carefully behind their own golden coverage, NOT a byte-identical merge.
- **Use A4** — build the cross-page sugya map on `coord.ts` (`spanByDaf` is the consumer shape); have a matcher/citation resolver populate `SegMatch.coord`.
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
