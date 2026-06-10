# Working in this repo

Talmud study app: Hono on Cloudflare Workers + Solid.js/Vite client, in a **pnpm workspace**. The app lives in `packages/talmud` (`src/worker`, `src/client`, `src/lib`); corpus-agnostic engine code shared with sibling apps lives in `packages/core` (imported as `@corpus/core/*`). Package manager is **pnpm**. TypeScript strict. Run workspace scripts from the repo root (`pnpm typecheck`/`pnpm test` delegate via `pnpm -r`) or scope one app with `pnpm --filter talmud <script>`.

## Framework direction — read `docs/framework.md` first

The model has landed: the engine is **four primitives** in `@corpus/core`, used by BOTH apps — **Spine** (an addressable text or entity space; `model/spine.ts`), **Anchor** (THE one shape for "where a piece sits"; `model/anchor.ts`), **Artifact** (a typed body pinned to anchors with full provenance; `model/artifact.ts` + `store/envelope.ts`), **Producer** (one registry shape behind both Mark and EnrichmentDefinition; `model/producer.ts`). Provenance is the **build manifest** ({authority human|rule|ai, producerId, recipeHash, inputs with content hashes, model, cost, …}), stamped on every fresh cache write. **Placement is a lifecycle, not a fifth primitive** (anchors are earned: coarse → deterministic → AI → human; `model/placement.ts`). The legacy vocabularies (AnchorCoord, ContextItem, SegMatch, the 7 studio anchor shapes, Mark/EnrichmentDefinition) are **lossless projections** of the four, bridged in `model/compat.ts` — which `studio-schema.ts` now merely re-exports. `docs/framework.md` is the full reference (shapes, subsumption tables, the store, the runtime, the tanach worked example).

Principles: deterministic rules grow over time but **AI keeps final say**; context sources are pluggable per piece; pick models by **benchmark** on a fixed 15–30 daf set; **precision over recall** for placement (a wrong anchor is worse than "whole daf"); **human edits/​corrections outrank AI and are never silently overwritten — now ENFORCED at `ArtifactStore.put` (a `provenance.authority === 'human'` entry is never clobbered by rule/AI output) and in `applyRefinements` (a `via:'human'` anchor is never replaced)**; **review changes with Codex** (`codex exec --sandbox read-only`) as you go.

### Four-primitive consolidation — LANDED (PRs #356–#364)

Each stage its own PR, characterization-tested first, zero observable change (cache keys byte-frozen throughout — a derivation change cold-misses all of Shas, ~$1000/~17 days to re-warm):

- ✅ **#356** characterization suite (producer-key-golden, run-contract, resolve-deps-characterization, envelope-roundtrip, …) pinned before any move.
- ✅ **#357** the four-primitive core model + the compat bridges.
- ✅ **#358** `ArtifactStore` (`@corpus/core/store`): get/getSWR(accept)/getWithAliases/put/evict/staleness(fresh|stale-recipe|stale-inputs|unknown); key schemes — `talmudLegacyKeyScheme` delegating to the frozen `cache/keys.ts` contract (incl. the mark he-collapse rule), `templateKeyScheme` for tanach literals. The `mark:`/`enrich:` key families are PERMANENT.
- ✅ **#359** unified producer registry (`src/worker/producer-registry.ts`): one KV-over-code resolution behind both legacy loaders, projected through `Producer` losslessly.
- ✅ **#360** `resolveInputs` (the dependency walk) into core, app specifics via source-resolver ports (`run-sources.ts`).
- ✅ **#361** ONE `runProducer` orchestration for both kinds (ports + id-keyed hooks); the provenance build manifest stamped on every fresh write (verified live in prod — e.g. `argument-overview.synthesis` carries inputs [argument-overview.flow, argument, rabbi]).
- ✅ **#362** run lifecycle onto the ArtifactStore; the **human-edit guard goes live** at the write chokepoint.
- ✅ **#363** anchor types: core is the single source of truth (`studio-schema.ts` re-exports compat's Legacy* shapes).
- ✅ **#364** tanach onto the shared runtime (`packages/tanach/src/worker/run-ports.ts` + `spines.ts` + `producers/defs.ts`) — queue-less, registry-less, same core function = the corpus-agnosticism proof. Legacy tanach values serve through a read-side envelope wrapper (zero regeneration); `translate` stays bespoke (raw string + TTL, documented).

**What remains:**

- **PR-10 cleanup** — delete the legacy shims/shapes that are now pure indirection (the re-export layers, dead intermediate types) once nothing imports them.
- **Deferred items:** a human-edit UI/API path (the guard is live but nothing writes `authority:'human'` yet); a `producer-defs:v1` unified KV namespace (defs still live in `mark-defs:v2:*` / `enrichment-defs:v2:*`); `collectContext` as a producer (the context pool is still assembled live, not an artifact); `validateEnrichment` accepting `scope:'spine'` (the schema + key scheme support it, the CRUD validator only allows global|local); the rabbi admin pipeline onto the store; the tanach `translate` cache onto the envelope (if ever worth it).

### Migration roadmap (historical; superseded items marked)
1. ✅ **Revach refs** (PR #88) — capture study-aid cross-references as real links + the `refs` contract + coord-aware rendering.
2. ✅ **Revach section placer** (PRs #89, #91) — deterministic `matchRevach` + cached AI gap-fill, place-or-omit. The "fill a plural `anchors` field" forward shape is SUPERSEDED by the core `Anchor` model (#357/#363).
3. ✅ **Enrichment rollout + SWR** — shipped; stale-while-revalidate is now generalized into `ArtifactStore.getSWR` (previous-version key + accept predicate), and never-clobber-a-human-edit is enforced at `ArtifactStore.put`.
4. **Generic sidebar** — render a piece's enrichments from a declared render hint (retire bespoke `*Body` components). *Started:* the sidebar is being redesigned to a RECIPE model — a card = header + an ordered `SectionSpec[]` (tags|prose|synthesis|explainer|qa|special); `SidebarCardFromHint` (primitives.tsx) renders it, custom content is a NAMED block in a `specialBlocks` registry (uniform {deps,instance,tractate,page} contract) so nothing is freeform. Converted: PlaceBody (#105) + AggadataPanel (recipe + AggadataParallels block). PR order: Aggadata done -> Pasuk -> Halacha -> Rabbi (+tag formatters) -> rest -> move recipes into code-marks.ts (registry-driven).
5. **Entity pieces / link pieces / user pieces** — *links DONE:* `@corpus/core/context/link.ts` covers the full flow-graph relation set (`cites`/`continues`/`resolves`/`depends-on`/`parallels`/`contrasts`/`generalizes`) with `citationLink`/`continuationLink`/`flowLinks`; `dafLinks` → `GET /api/links/:t/:p`; reader-facing Cross-references in `ArgumentOverviewBody`. A `kind:'link'` artifact body exists in core (`LinkBody`). (Voices are below coord granularity — not Links.) *Remaining:* **entity pieces** — lift the "global" rabbi/place enrichments onto entity spines (`SpineDef kind:'entity'`, e.g. `entity:rabbi`, is designed in core but not yet instantiated) — and **user pieces** (highlights/notes; blocked on the human-edit write path above).
6. ✅ **Content-hash freshness + reverse-dependency index** — DONE and absorbed into the four primitives. Key centralization shipped (`cache-keys.ts` source keys, byte-exact, locked by `tests/source-cache-keys.test.ts`; producer keys now the frozen `@corpus/core/cache/keys` contract). Reverse-dependency index in `@corpus/core/registry/depGraph.ts` (`GET /api/dependents/:id`; `validateProducerGraph` CI-guarded). Freshness loop closed: `recipe_hash` stamped at generation, `GET /api/stale/:id/:t/:p[?lang=he]` detects (now via `ArtifactStore.staleness`, extended with a stale-inputs leg over `provenance.inputs` content hashes), `POST /api/admin/rewarm/:id/:t/:p` acts (evict-cascade + warm-deep; `evictCascadeEntries`, not `bypass_cache`). Rewarm scope: EN whole-daf + EN per-section exact; HE per-section / `.qa`-qualified / KV-defined regenerate on demand. *Still open from this item:* tractate-continuous + commentary spines (wire the reserved `external` anchor — `precision:'external'` exists in core; no spine consumes it yet).
7. ✅ **Cruft + DX** — DONE. dead `filterFlowConnections` removed (flow graph's inline `edges()` filter subsumes it); orphaned sugya-assembly removed (`/api/studio/sugya` route + `SUGYA_WINDOW_CAP` + `typing/assemble.ts` + `typing/sugya.ts` + `readFlowConnections`); `docs/framework.md` SDK-grade rewrite; **`/api/studio/*` prefix dropped to `/api/*`** (run, run-status, marks, enrichments, checks, bridge, type-profiles), `mcp-openapi.ts` kept in sync. Internal `studio` tokens kept on purpose: the `x-studio-secret` header, `studio-schema.ts`/`studio-registry.ts` filenames, and the `studio-mark`/`studio-enrichment` usage-telemetry labels (a stored taxonomy, not the URL).

Cross-cutting always: typed piece bodies, resilient anchors, provenance/confidence, eval-gated producer promotion.

### Open problem — place/era granularity (future)

`rabbi.location` infers **one place per rabbi per daf**, and the `RabbiPlacesTimeline` "you are here" marker shows that single daf-level verdict (deduped to one row in PR #180). But a daf is not one place — **and neither is a sugya**: sugyot routinely span generations and locales, quoting tannaim and amoraim across centuries and academies. So "where (place) and when (era/generation)" is properly a property of an individual **statement / voice anchored to a text range**, not of a daf or even a sugya. The same coarseness affects generation *coloring* (a daf/sugya can legitimately contain reds and blues at once). The real fix makes location + era per-statement and anchored — aligned with the smart-notes anchor model above — and is a benchmark-gated producer change. Fine to leave daf-scoped for now; revisit when the anchor model reaches entity/voice pieces.

- `pnpm test` — Vitest unit suite. `pnpm test:int` — integration (hits a running worker).
- `pnpm typecheck` — `tsc --noEmit`. Run it plus `pnpm test` before any PR.
- `pnpm ship` — `vite build && wrangler deploy`, behind `scripts/ship-guard.sh`: it refuses to deploy unless the tracked tree is clean and HEAD's content matches `origin/master` (so prod can't silently diverge from master; a later deploy from another agent once clobbered shipped-but-unmerged work). Merge first, then ship. `SHIP_FORCE=1 pnpm ship` overrides when a divergent deploy is deliberate. Production is the custom domain **talmud.shaunregenbaum.com**. wrangler is authenticated in this environment.

## Multiple agents work this repo at once — isolate in a worktree

This repo is routinely worked by several agents in parallel (it is normal to see many `.claude/worktrees/*`). The shared main checkout is frequently dirty with another agent's uncommitted work. **Do not edit or commit code in the main checkout** — you will corrupt their work or sweep it into your commit. A real collision has happened here (two agents editing `src/worker/llm.ts` at once broke the build).

Instead, for any code change:

1. **Branch in a worktree first.** Run `scripts/worktree-new.sh <branch>` — it creates the worktree under `.claude/worktrees/<branch>` branched from `origin/master` (excluding others' uncommitted work — that is the point) and runs `pnpm install` there (fast — hardlinks from the shared store — and, unlike symlinking `node_modules` from the main tree, it creates the workspace links for `@corpus/core` that vite/vitest need).
2. **Run from the worktree.** `pnpm typecheck` and `pnpm test` before any PR; `pnpm lint` too — CI gates on Biome (`biome ci .`).
3. **PR → merge.** Commit on the branch, push, open a PR (`gh pr create`), and merge it (`gh pr merge <n> --squash --admin`). GitHub blocks self-approval, so the repo owner authorizes admin-merge.
4. **Expect master to move.** Other agents push often. If a PR won't merge, `git merge origin/master` in the worktree, resolve, push (GitHub recomputes mergeability a few seconds later).
5. **Deploys are automatic.** Merging to master triggers the CI `deploy` job, which deploys both workers after checks pass (so prod always equals master). Manual `pnpm ship` from the worktree still works as a fallback when CI deploy is broken or you can't wait — ship-guard enforces the same content==master invariant.
6. **Clean up.** Run `scripts/worktree-done.sh <branch>` from the main checkout — it verifies the PR merged, then deletes the remote branch, removes the worktree, and deletes the local branch (the work lives on master via the squash).

## Commit / PR text

No self-reference and no `Co-Authored-By` trailer in commit messages. Omit any "Generated with …" footer from PR bodies too, since a squash-merge folds the PR body into the master commit message.
