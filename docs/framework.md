# The framework: four primitives

> How both apps are built, in the vocabulary of the code. The plain-English
> version is "the text covered in smart notes"; this is the same thing with the
> types and file paths. The engine lives in `packages/core` (imported as
> `@corpus/core/*`; a citation like `@corpus/core/model/anchor` is the file
> `packages/core/src/model/anchor.ts`); app code is cited as
> `packages/talmud/...` / `packages/tanach/...`. Every type and path below is
> real.

The engine is **four primitives**, consolidated in PRs #356–#364 and used by
both apps:

| Primitive | One line | Module |
|---|---|---|
| **Spine** | an addressable text (or entity space) artifacts pin to | `@corpus/core/model/spine` |
| **Anchor** | THE one shape for "where a piece sits" | `@corpus/core/model/anchor` |
| **Artifact** | one produced piece: typed body + anchors + provenance | `@corpus/core/model/artifact` |
| **Producer** | the registry entry that makes artifacts | `@corpus/core/model/producer` |

Everything else is derived: **placement** is the lifecycle by which an anchor
is earned (not a fifth primitive), the **store** is where artifacts live, the
**runtime** is the one function that runs a producer, and the legacy
vocabularies (marks, enrichments, context items, the seven studio anchor
shapes) are **lossless projections** of these four, bridged in
`@corpus/core/model/compat`.

## 1. Spine — `@corpus/core/model/spine`

A spine is an addressable space artifacts pin to. Text spines are ordered
(reading order); entity spines are not.

```ts
interface SpineDef {
  id: string;                 // 'bavli', 'tanach', 'rashi', 'entity:rabbi'
  kind: 'text' | 'entity';
  levels: string[];           // address levels, outermost first
  ordered?: boolean;          // defaults: text=true, entity=false (isOrderedSpine)
  normalizePath?: (path: RefPart[]) => RefPart[];   // slugging, alias folding
}
createSpineRegistry(defs): SpineRegistry   // get / list / ref(spineId, path)
```

A reference INTO a spine is a path of components, one per level, and **may stop
early**: a truncated path names the containing division. `['Berakhot', '2a']`
is the whole daf — this is what retires the `DAF_SEG = -1` sentinel in the new
model. `SpineRegistry.ref` validates depth (1..levels.length) and applies the
spine's `normalizePath` hook.

Instantiated spines today:

- **tanach** — `packages/tanach/src/worker/spines.ts`: `createSpineRegistry`
  with levels `['book','chapter','verse']`; `normalizePath` grounds the book
  against the BOOKS registry so a misspelled book fails at ref-construction
  time instead of producing an unreachable cache key.
- **bavli** — the talmud app's spine is the *implicit default*: the
  `BAVLI_SPINE = 'bavli'` constant in `model/compat.ts` (levels
  tractate/page/seg by convention; a spine-less `AnchorCoord` addresses it).
  Commentary works ride as their own spine ids via `AnchorCoord.spine`
  (`'Rashi'`, …).
- **entity spines** — designed (`kind: 'entity'`, e.g. `'entity:rabbi'` with
  one level, the entity id) but not yet instantiated; lifting the `global`
  rabbi/place enrichments onto them is future work.

## 2. Anchor — `@corpus/core/model/anchor`

THE one shape for "where a piece sits". Every legacy placement vocabulary maps
into it (see the subsumption table below).

```ts
interface AnchorPoint { path: RefPart[]; tokens?: [number, number]; excerpt?: string }
interface AnchorRange { start: AnchorPoint; end: AnchorPoint }
type Span = (AnchorPoint | AnchorRange)[]

type AnchorPrecision = 'token' | 'segment' | 'division' | 'unit' | 'work' | 'external'

interface Anchor {
  spine: string;              // spine id (model/spine.ts)
  span: Span;
  precision: AnchorPrecision;
  via?: string;               // how it was earned: 'tosfos-dh' | 'ai' | 'human' | …
  confidence?: number;        // 0..1 (AI-earned anchors carry this)
}
```

Two deliberate non-features:

- **'cross-daf' is NOT a precision.** Whether a span is cross-daf is DERIVED at
  render time by comparing the span's unit path (e.g. `[tractate, page]`) to
  the unit in view; the anchor itself just says where it sits.
- **Whole-daf is a truncated path** (`[tractate, page]`, precision `'unit'`) —
  not a sentinel value.

Precision is ranked (finer = higher): `token 5 > segment 4 > division 3 >
unit 2 > work 1 > external 0` (`precisionRank` / `comparePrecision`). Identity
is location-only: `anchorKey(a)` hashes spine + precision + the normalized span
(`normalizeAnchor` dedupes + sorts deterministically); `via`/`confidence`/
`excerpt` are provenance/display, not identity. `pointsOf(span)` expands
numeric same-parent ranges to points (bounded; token-carrying endpoints survive
verbatim).

### Subsumption: old anchor vocabulary → Anchor

All bridges live in `@corpus/core/model/compat` and are exercised by core's
`anchor-compat` tests. `packages/talmud/src/worker/studio-schema.ts` no longer
owns the seven studio anchor shapes — it **re-exports** the `Legacy*`
structural types from compat.

| Old shape | Bridge | Resulting Anchor |
|---|---|---|
| `AnchorCoord {tractate,page,seg}` | `anchorFromCoord` | segment point `[t,p,seg]`, precision `segment`; `seg = DAF_SEG` → truncated `[t,p]`, precision `unit`. Exact inverse: `coordFromAnchor` (null when not coord-representable) |
| `AnchorSpan` (coord list) | `anchorFromSpan` | one normalized multi-point anchor; `unit` if any coord is daf-level, else `segment` |
| `ContextItem.segs` | `anchorFromContextItem` | one segment point per seg, `via`/`confidence` carried |
| `ContextItem.amud` (only) | `anchorFromContextItem` | truncated daf path at `division` — lossy on purpose (WHICH amud stays recoverable from `item.amud`) |
| `ContextItem` placed whole-daf (`via` set, no segs) | `anchorFromContextItem` | `[t,p]` at `unit`; a simply-unplaced item → `null` |
| `ContextItem.coord` (cross-daf home) | `anchorsFromContextItem` | a SECOND anchor alongside the placement anchor |
| `SegMatch` (matcher output) | `refinementFromSegMatch` | a `kind:'anchor-refinement'` **artifact** targeting the placed item; precedence wholeDaf → segs → coord; an unplaced match throws (a no-op, not a refinement) |
| studio `SegmentAnchor` | `anchorsFromAnchorOutput` | `[t,p,segIdx]` at `segment` |
| studio `SegmentRangeAnchor` | `anchorsFromAnchorOutput` | one `AnchorRange` at `segment` |
| studio `PhraseAnchor` | `anchorsFromAnchorOutput` | `token` when both token bounds exist, `segment` when only segIdx, `unit` when the phrase floated free |
| studio `MultiAnchor` | `anchorsFromAnchorOutput` | one anchor per sub-anchor |
| studio `CrossDafAnchor` | `anchorsFromAnchorOutput` | TWO anchors: the source here + the target there |
| studio `ExternalAnchor` | `anchorsFromAnchorOutput` | TWO anchors: the source + `{spine: 'external:<kind>', precision: 'external'}` |
| studio `WholeDafAnchor` | `anchorsFromAnchorOutput` | `[t,p]` at `unit` |

## 3. Artifact — `@corpus/core/model/artifact` + `provenance` + `store/envelope`

```ts
interface Artifact<Body = unknown> {
  id: string;
  kind: string;        // 'mark-instance' | 'enrichment' | 'context-item' |
                       // 'link' | 'anchor-refinement' | app-defined (open string)
  anchors: Anchor[];
  body: Body;
  provenance: Provenance;
}
```

Marks' instances, enrichment outputs, context items, links, and anchor
refinements are all artifacts. A `kind:'link'` artifact's body is
`{ relation }` — `anchors[0]` is the source, the rest are targets
(`LinkRelation` stays the flow-graph set in `@corpus/core/context/link`).

**Provenance is the build manifest** (`@corpus/core/model/provenance`) —
exactly how this artifact was made:

```ts
type Authority = 'human' | 'rule' | 'ai'

interface Provenance {
  authority: Authority;          // who decided (authorityForTransport: LLM
                                 // transports → 'ai', else 'rule')
  producerId: string;
  recipeHash?: string;           // content hash of the recipe at generation
  inputs: InputRef[];            // { artifactId? , sourceKey?, contentHash? }
  confidence?: number;
  model?: string; transport?: string; usage?: unknown;
  cost?: CostStamp | null;       // the permanent per-entry cost ledger
  createdAt: string; updatedAt?: string;
}
```

Stamped on **every fresh cache write** since #361 (`writeWithProvenance` in
the runtime), and synthesizable from any legacy stored entry via
`provenanceOf(stored, producerId)` — so nothing needs re-generation to enter
the new model. `authorityForTransport` is the ONE place the llm-vs-rule split
lives (`workers-ai` / `openrouter-gateway` → `'ai'`; `'computed'`, `'graph'`,
`'lookup'`, … → `'rule'`).

**StoredArtifact** (`@corpus/core/store/envelope`) is the KV value envelope:
byte-compatible with the legacy stored `RunResult` (every legacy field —
`content`, `parsed`, `model`, `usage`, `recipe_hash`, `cost`,
`deps_resolved`, `section_range`, … — stays at TOP level so existing entries
parse unchanged); `provenance` and `anchors` are two optional additive fields
old readers ignore. `total_ms`/`stale`/`refreshing` are deliberately excluded
(response-time injections, never written to KV). `authorityOf(stored)` reads
the authority from native entries or derives it for legacy ones.

## 4. Producer — `@corpus/core/model/producer`

One shape behind both legacy definition families (MarkDefinition /
EnrichmentDefinition). A producer declares what it makes, from what, how, where
its outputs sit, how many it makes, and how its outputs cache:

```ts
interface Producer {
  id: string; label: string;
  kind: string;                          // 'mark-instance' | 'enrichment' | 'anchor-refinement' | …
  inputs: ProducerInput[];               // {source} | {producer, fanOut?} | {spine, select?}
  recipe: { extractor: unknown; render?: unknown };
  anchoring: {
    behavior: 'discovers' | 'inherits' | 'aggregates';
    precision?: AnchorPrecision;
    spine?: string;
    target?: string;                     // legacy target_mark
  };
  cardinality: 'one' | 'many' | 'per-input';
  scope: 'global' | 'local' | 'spine';
  key_shape: 'mark' | 'enrich';          // FROZEN legacy key family
  cacheVersion: string;
  passes?: string[];
  legacy?: Record<string, unknown>;      // lossless round-trip bag
}
```

`anchoring.behavior` is the unification of the old mark/enrichment split:
**discovers** (the extractor finds the anchors — mark extraction, anchor
refiners), **inherits** (outputs sit where their input instance sits —
per-instance enrichments), **aggregates** (one output over many inputs —
daf-level synthesis).

### Subsumption: MarkDefinition / EnrichmentDefinition → Producer

`producerFromMark` / `producerFromEnrichment` (and their exact inverses
`markFromProducer` / `enrichmentFromProducer`) in `model/compat.ts`. The
projections are **lossless**: every legacy field with no first-class home rides
VERBATIM in `Producer.legacy` (unknown/future fields in `legacy.rest`), and the
inverse rebuilds the original def deep-equal for every entry in the real
registry (`tests/producer-projection.test.ts`).

| Legacy field | Producer home |
|---|---|
| `id` / `label` / `description` / `category` | same names |
| mark (always) | `kind: 'mark-instance'`, `anchoring.behavior: 'discovers'`, `cardinality: 'many'`, `scope: 'local'`, `key_shape: 'mark'` |
| `anchor` (mark kind) | `anchoring.precision` via `mapAnchorKindToPrecision` (phrase→token, whole-daf→unit, the rest→segment); verbatim kind kept in `legacy.anchorKind` |
| `render` (mark) | `recipe.render` |
| `extractor` | `recipe.extractor` |
| `recipe` (mark sidebar recipe) | `legacy.sidebarRecipe` |
| `dependencies` | `inputs` (string→`{source}`, `{mark}`/`{enrichment}`→`{producer}`) + verbatim copy in `legacy.dependencies` (the mark-vs-enrichment flavor of a `{producer}` ref round-trips through the bag) |
| `target_mark` (enrichment) | `anchoring.target` |
| `mode` (enrichment) | `augment-content`→`inherits`; `refine-anchors`→`discovers` **+ `kind: 'anchor-refinement'`**; `aggregate`→`aggregates` |
| `scope` (enrichment) | `scope`; enrichments get `key_shape: 'enrich'`; `cardinality` is `'per-input'` when any dep declares `fanOut: true`, else `'one'` |
| `cache_version` | `cacheVersion` (the key still uses the same bytes) |
| `def_hash` | `legacy.def_hash` (vestigial hand-authored literal; `recipeHash` is its computed successor) |
| `passes` / `status` / `experimental` / `source` / `updated_at` | same (camelCased `updatedAt`) |

`rawDependenciesOf(p)` projects back to the legacy `'gemara' | {mark} |
{enrichment}` grammar byte-identical to the original — which is exactly what
the dependency graph (`registry/depGraph.ts`) is fed.

### The talmud registry adapter — `packages/talmud/src/worker/producer-registry.ts`

ONE resolution of "what is producer `id`?" over the two definition stores
(runtime-mutable KV defs + code defs in `code-marks.ts`) and the two flavors,
projected into `Producer`. KV wins over code; the run path uses the
shape-pinned `loadProducerOfShape(env, id, 'mark'|'enrich')`; `loadProducer`
is the unified lookup (safe because mark and enrichment ids never collide —
asserted in tests); `listProducers` lists everything projected. The legacy
loaders `loadMarkDef` / `loadEnrichmentDef` are now thin projections over the
same resolution (resolve → Producer → project back), byte-identical to the old
index.ts implementations (`tests/producer-registry.test.ts`). **KV-over-code is
preserved** — the registry stays runtime-mutable.

## Placement is a lifecycle, not a primitive

`@corpus/core/model/placement` — the lifecycle by which an anchor is **earned**.
A piece may start coarse (`unit`), get refined to a `segment` by a
deterministic matcher, then to `token`s by AI, then corrected by a human; each
step is a `kind:'anchor-refinement'` **artifact** (matchers are just producers
of anchor-refinement artifacts), and `applyRefinements` is the one writer that
folds refinements onto their targets. Rules, in order of authority:

- a human-earned anchor (`via: 'human'`) is **NEVER** replaced;
- a refinement applies only when the target has no anchor on that spine, or it
  is **STRICTLY finer** than everything there (never silently downgrade).

Predicates: `isLocated` (token/segment), `isAiEarned` (`'ai'` or `'ai-*'`),
`isHumanEarned`. The legacy in-pool flow is unchanged: a matcher emits
`SegMatch[]` and `applyMatches` (`@corpus/core/context/match`) is the only
writer of placement onto `ContextItem`s; `refinementFromSegMatch` is the bridge
into the artifact world, mirroring `applyMatches` precedence exactly.

**The standing placement rules are unchanged.** Deterministic first, AI only to
fill the gaps it leaves. **Precision over recall** — a wrong anchor is worse
than "whole daf" because the LLM treats the label as fact; leave unplaced when
unsure. Parsing/refs must not depend on placement; a placer takes the spine's
sections in and returns matches out.

## The two DAGs

The system has two dependency graphs — one about *definitions*, one about
*what actually happened*:

1. **Static (the registry DAG)** — `@corpus/core/registry/depGraph`:
   `producerNodesFrom` / `forwardSubgraph` / `reverseDependencyIndex` /
   `transitiveDependents` over producer `dependencies`. Answers "if this
   producer changes, what must re-warm?" — served read-only at
   `GET /api/dependents/:id`. `validateProducerGraph` (dangling-dep + cycle
   detection) guards the live registry in CI
   (`tests/dep-graph-validate.test.ts`).

2. **Dynamic (the provenance DAG)** — `provenance.inputs` per artifact. Exact
   and per-entry: not "what the recipe declares" but "what THIS artifact was
   actually built from", each input fingerprinted. One InputRef per resolved
   dependency: `sourceKey` is the dep id as it appears in
   `deps_resolved`/`anchors_resolved` (depends first, then anchors, id-sorted
   so the manifest is stable run-to-run), `contentHash` fingerprints the
   resolved VALUE (`provenanceInputRefs` in `run/run-producer.ts`).

A real stamped entry (the shape `argument-overview.synthesis` writes — its def
declares `dependencies: ['gemara', 'context', 'incoming',
{enrichment: 'argument-overview.flow'}, {mark: 'argument'}, {mark: 'rabbi'}]`;
source texts feed the prompt but only producer-made inputs enter the manifest):

```jsonc
"provenance": {
  "authority": "ai",
  "producerId": "argument-overview.synthesis",
  "recipeHash": "…",                       // same hash as top-level recipe_hash
  "inputs": [
    { "sourceKey": "argument-overview.flow", "contentHash": "…" },
    { "sourceKey": "argument",               "contentHash": "…" },
    { "sourceKey": "rabbi",                  "contentHash": "…" }
  ],
  "model": "…", "transport": "openrouter-gateway",
  "usage": { … }, "cost": { … },
  "createdAt": "2026-06-…"
}
```

Together they close the freshness loop: `recipeHash` + `staleness` detect *when*
stale (`GET /api/stale/:id/:t/:p`), `/api/dependents` enumerates *what else*,
and `POST /api/admin/rewarm/:id/:t/:p` (trusted) acts — enqueues a warm-deep
job scoped to the cascade; the consumer EVICTS the cascade's entries
(`evictCascadeEntries`, not `bypass_cache`, so unchanged deps cache-hit instead
of re-paying) and regenerates.

## The store — `@corpus/core/store`

`ArtifactStore` is the ONE KV surface for producer outputs. It wraps a minimal
structural KV (a Cloudflare KVNamespace satisfies it) with a pluggable
`KeyScheme`:

- `get(key)` — legacy read semantics byte-for-byte: null on miss, null on
  unparseable JSON (a corrupt entry reads as a miss and regenerates).
- `getWithAliases(p, addr)` — canonical key first, then scheme-declared legacy
  alias keys; the returned key is ALWAYS canonical (an alias hit migrates on
  its next write).
- `getSWR(p, addr, {accept?})` — stale-while-revalidate across a
  `cache_version` bump: canonical key first, on miss the previous-version key.
  `stale: true` means served from the previous version; the CALLER decides
  whether to enqueue a refresh. The `accept` predicate guards BOTH reads
  (production's `section_range` guard).
- `put(key, value)` — plain JSON, **NO TTL ever** — and the **HUMAN-EDIT
  GUARD, live at this chokepoint** since #362 (talmud) / #364 (tanach): if the
  existing entry is human-authored (`provenance.authority === 'human'`) and the
  incoming value is not, the write is refused
  (`{ok: false, reason: 'human-locked'}`). Human-over-human always writes;
  `force` can never launder a non-human value over a human one. (Known,
  accepted race: read-check-write, not CAS — the guard prevents the
  *systematic* clobber, a re-warm overwriting an edit.)
- `evict(key)`.
- `staleness(stored, producer, currentInputs?)` — `'fresh' | 'stale-recipe' |
  'stale-inputs' | 'unknown'`: no stored hash → unknown; stored ≠ current
  recipe hash → stale-recipe; any input pair whose contentHashes both exist
  and differ → stale-inputs; else fresh.

### Key schemes — `@corpus/core/store/key-schemes`

Two schemes, one rule: **keys are byte-frozen.**

- `talmudLegacyKeyScheme()` **DELEGATES** to the frozen contract in
  `@corpus/core/cache/keys` (`keyForMark` / `keyForEnrichment` /
  `previousVersionKey`) — it never re-implements the key shape. Includes the
  **mark he-collapse rule**: a `lang='he'` mark request keys onto the `:he`
  namespace ONLY when the def declares a Hebrew system prompt, otherwise it
  collapses to the English key; enrichments always key by requested lang.
  Derive `ProducerKeyInfo` via `producerKeyInfo(p)` (it reads `hasHePrompt`
  off the recipe's extractor) — hand-setting it wrong cold-misses or orphans
  entries.
- `templateKeyScheme(templates)` — per-producer-id **literal** key templates
  for apps whose keys are hand-built strings (tanach), copied byte-exactly
  from the app's legacy code.

The frozen shapes (`@corpus/core/cache/keys`):

```
mark:{id}:{cache_version}[:he]:{work}:{ref}
enrich:{id}:{cache_version}[:he]:{instance_id}                (scope=global)
enrich:{id}:{cache_version}[:he]:{instance_id}:{work}:{ref}   (scope=local)
```

The two key families (`mark:` / `enrich:`) are **permanent** — `key_shape` on
Producer is frozen for cache compatibility. Why the bytes are sacred: entries
have **no TTL** (outputs are deterministic per key; expiry would silently rot
warmed pages), and the cold-miss economics are brutal — full-Shas warming costs
~$1000 and ~17 days, so a derivation change (even a slug switch) that
cold-misses every warmed entry re-pays all of it. Byte parity is locked by
`tests/store-key-parity.test.ts` + `tests/producer-key-golden.test.ts` (which
also pins `cacheKeyForRunBody` parity) and core's `key-schemes` tests.

Talmud wiring: `artifactStore(env)` in `packages/talmud/src/worker/index.ts` —
`readCachedResult` / `writeCachedResult` route through it, so **every run-path
write passes the human-edit guard**. Source-cache keys (`ctx:*`,
`sefaria-bundle:*`, …) and `job:{runId}` records are NOT artifacts and stay on
direct KV. Tanach wiring: `tanachArtifactStore(env)` with byte-exact templates
(`events:v2:{book}:{chapter}`, `note:v1:{b}:{c}:{start}-{end}`,
`synthesis:v1:{b}:{c}:{verse}`, `midrash-synth:v1:{b}:{c}:{verse}`);
pre-migration tanach values are raw response payloads, not envelopes, so the
read side wraps them in a synthetic envelope (model/transport
`'legacy-cache'`) and serves them as cache hits — **zero regeneration cost**;
fresh writes store real envelopes with provenance.

Invalidation is still `cache_version` (manual bump → old key unreachable; GC
sweeps by version), with `recipeHash` as the computed staleness detector — it
is deliberately NOT in the key.

## The runtime — `@corpus/core/run`

### `resolveInputs` (the dependency walk, #360) — `run/producer-run.ts`

Walks a producer's `dependencies` and assembles four buckets: `vars` (template
vars), `depends` (enrichment outputs, `{{depends.<id>}}` → stored as
`deps_resolved`), `anchors` (mark instance lists, `{{anchors.<id>}}` →
`anchors_resolved`), `sources` (bounded previews of the raw source texts, for
the inspector only — never on the cached result). Everything app-specific
enters through `ResolveInputsPorts`: source resolvers are injected closures
keyed by dependency token (`'gemara'`, `'chapter-verses'`, …, plus a
`defaultSource` applied when a producer declares no deps), and the recursive
producer runs (`runEnrichment` / `runMark`) are injected callbacks that close
through `runProducer`. The walk itself is corpus-agnostic: all deps resolve
concurrently, cycle detection at the enrichment boundary via `parentChain`,
error values are *stored* (never thrown — one bad dep degrades to an
`{error}` template var), `fanOut` runs a per-instance enrichment for every
instance of its target mark, and `sourcesOnly` gathers the transitive source
closure without running any model (the read-only `run-sources` inspector).
Behavior is locked by `tests/resolve-deps-characterization.test.ts`.

### `runProducer` (one orchestration for both kinds, #361) — `run/run-producer.ts`

The ONE producer-run skeleton, reproducing the two legacy bodies
(`runMarkOnce` + `runEnrichmentOnce`) with **zero observable change** (locked
by `tests/run-contract.test.ts`, `envelope-roundtrip`, `producer-key-golden`):

```
cache key (per-kind lang policy) → cache hit? return
  → [enrich] recipe_hash + preResolve short-circuits
  → resolveInputs (mark RESETS the cycle chain; enrichment EXTENDS it)
  → [enrich] postResolve (short-circuit / extra vars / input scoping)
  → prompt vars + the LLM call (he-prompt fallback selected in core;
     the host owns option construction + the mark fan-out)
  → parse → check layer (transforms + validators) → postParse hooks
  → envelope (per-kind field ORDER is part of the byte contract)
  → cache write, gated on hard issues with bounded lint retry
     → writeWithProvenance: stamp the provenance build manifest, write, return
```

The genuine per-kind divergences are preserved, not papered over: marks
namespace `:he` only with a Hebrew prompt (enrichments always key by lang);
`section_range` guard and `recipe_hash` stamping are enrichment-only; usage
attribution order differs; the stored-envelope field order differs per kind
(JSON.stringify preserves insertion order — part of the byte contract).

**The ports contract** (`RunProducerPorts<Ctx>`): everything app-specific —
`cacheRead`/`cacheWrite` (route through the ArtifactStore), `markKey`/
`enrichmentKey` (MUST be the same frozen derivation), `enrichmentRecipeHash`,
`sectionRange`, `resolveInputs`, `renderTemplate`, `markLLM`/`enrichmentLLM`
(the host owns model choice, fallbacks, tags, attribution, the fan-out),
`runChecks`, `lintGate`, `costStamp`, `recordUsage` — plus **id-keyed hooks**
cut (not copied) from the legacy bodies: `computedMark` (the deterministic
no-LLM branch), `markPostParse` (rabbi registry grounding, places backlog),
`enrichmentPreResolve` (rabbi graph/identity short-circuits),
`enrichmentPostResolve` (rabbi.observations short-circuit, pesukim prefetch
vars, argument move-scoping), `enrichmentPostParse` (concepts backlog).

### How an app adopts it — tanach, the worked example (#364)

Tanach is the corpus-agnosticism proof: a **queue-less, registry-less** app
running the IDENTICAL core function. The entire adoption is one file,
`packages/tanach/src/worker/run-ports.ts`:

1. **Spine** — `spines.ts`: `createSpineRegistry` with book/chapter/verse.
2. **Producers as data** — `producers/defs.ts`: the five producers expressed
   as core `Producer` objects (`events` discovers chapter-section anchors;
   `note` inherits from an events section; `synthesis` / `midrash-synthesis`
   per-verse; `translate` declared but deliberately bespoke — raw string +
   30-day TTL, outside the ArtifactStore, see `producers/translate.ts`).
   `key_shape` is nominal here — templateKeyScheme routes by id.
3. **Store** — `ArtifactStore` over `env.CACHE` with `templateKeyScheme`,
   templates byte-exact to the legacy hand-built keys; a read-side adapter
   wraps pre-envelope legacy values so nothing regenerates.
4. **Source resolvers** — five closures (`chapter-verses`, `section-verses`,
   `verse-text`, `commentaries`, `midrash-passages`) wrapping the existing
   Sefaria helpers; failures throw `TanachSourceError` so routes keep their
   legacy status codes.
5. **Ports** — the LLM port via the shared `runLLM` (same knobs + `tanach:*`
   cost tags), usage to the existing `usage:v1` ledger, no check layer
   (honest no-ops), one hook (`markPostParse` = the events producer's legacy
   output normalization).
6. **Routes call `runProducer` synchronously** — no queue, no KV registry,
   same core function. Locked by the tanach `producer-routes` /
   `producer-keys` / `producer-defs` tests.

That an app this differently-shaped (no queue, no registry, literal keys,
legacy raw-payload cache) runs the same `runProducer` and `resolveInputs`
unchanged is the test that the four primitives are real.

### Talmud wiring (for contrast)

`packages/talmud/src/worker/index.ts` defines `RESOLVE_PORTS` (source
resolvers in `run-sources.ts` — `'gemara'`, `'commentaries'`, `'context'`,
`'incoming'`, …) and `RUN_PORTS`; `runMarkOnce` / `runEnrichmentOnce` are now
thin shims over `runProducer`. The async run lifecycle around it is unchanged:
`POST /api/run` → cache hit / SWR-stale serve / 202 + `enrichment-jobs` queue
→ `GET /api/run-status/:runId`; budget gating at the `runLLM` chokepoint;
the client priority queue + `runResultCache`.

## Characterization safety net

The refactor was test-first (#356): the legacy behavior was pinned before any
move, and every stage kept the suite green.

| Test (packages/talmud/tests unless noted) | Pins |
|---|---|
| `producer-key-golden.test.ts` | golden cache keys for the whole registry + `cacheKeyForRunBody` parity |
| `run-contract.test.ts` | the observable run behavior (hits, gating, envelope) |
| `resolve-deps-characterization.test.ts` | the dependency walk (fanOut, cycles, error values, sourcesOnly) |
| `envelope-roundtrip.test.ts` | StoredArtifact byte compatibility with stored RunResults |
| `store-key-parity.test.ts` | ArtifactStore keys == legacy cache-keys bytes |
| `provenance-stamp.test.ts` | the build manifest on fresh writes |
| `human-edit-guard.test.ts` | the put() guard |
| `producer-projection.test.ts` | lossless Mark/Enrichment ↔ Producer round-trips over the real registry |
| `producer-registry.test.ts` | unified resolution == the old loaders, id non-collision |
| tanach `producer-routes` / `producer-keys` / `producer-defs` tests | route behavior, byte-exact template keys, def shapes |
| `packages/core/tests/*` | anchor, anchor-compat, placement, provenance, spine-registry, artifact-store, key-schemes |

## Corpus bindings

### Appendix A — the talmud binding

The legacy coordinate vocabulary is still the app's working currency (the
bridges make it equivalent to Anchors, so there's no rush to rewrite
consumers):

- **Coordinates** — `@corpus/core/context/coord`: `AnchorCoord
  {tractate, page, seg, spine?}` / `AnchorSpan` / `DafRef`; `DAF_SEG = -1` is
  the legacy whole-daf sentinel (readers branch on `seg < 0`); helpers
  `coordForSeg` · `dafCoord` · `spineCoord` · `coordsForSegs` · `coordKey` ·
  `sameDaf` · `localSeg` · `isCrossDaf` · `normalizeSpan` · `spanByDaf` ·
  `coordFromTarget`.
- **The note contract** — `@corpus/core/context/types`: `ContextItem` with
  `segs` (the in-daf anchor; `[]` = not localized), `amud` (coarse display
  locator), `coord` (cross-daf home), `refs` (citations — rendered as links,
  NEVER placement), `via`/`confidence`, and the client-only HebrewBooks word
  placement (`hbWords`/`hbVia`/`hbConfidence` — token-level positioning on the
  scanned daf, below coord granularity). Keeping "where it attaches" separate
  from "what it points at" remains the most load-bearing distinction.
- **Placement levels** — `@corpus/core/context/placement`: `PlacementLevel`
  (`cross-daf`/`words`/`segment`/`amud`/`daf`) + the `isLocated`/`isPrecise`/
  `isGrounded`/`isAiGrounded` predicates (the legacy-level view of what
  `AnchorPrecision` now ranks).
- **Matchers** — `packages/talmud/src/lib/context/anchor/{tosfos,bg-term,revach,yerushalmi,ai-prompt}.ts`,
  the AI placer in `src/worker/context-match.ts` + `revach-ai-place.ts`
  (floored at `MIN_AI_CONF = 0.6`, gap-fill only — never overrides a
  deterministic or human placement).
- **Assemble + select** — `collectContext`
  (`src/worker/context-providers.ts`) builds the live pool (LLM-free) and runs
  the deterministic matchers; `contextForAnchor` + `formatContextForPrompt`
  (`@corpus/core/context/select`) narrow + render the `{{context}}` block.
- **Links** — `@corpus/core/context/link` (`cites` · `continues` · `resolves`
  · `depends-on` · `parallels` · `contrasts` · `generalizes`; constructors
  `citationLink` / `continuationLink` / `flowLinks`), assembled per daf by
  `packages/talmud/src/lib/context/dafLinks.ts` → `GET /api/links/:t/:p`.
  (Voice edges are below coord granularity — not Links.)
- **Rendering** — `<Hebraized>` + `BidiText` (`src/client/Hebraized.tsx`,
  `hebraize.ts`); the client queue + `runResultCache`
  (`src/client/enrichmentQueue.ts`).
- **Source caches** — app-specific keys in `src/worker/cache-keys.ts`
  (`keyForGemara`, `keyForDafyomi`, `keyForSefariaBundle`, …); the
  corpus-agnostic producer keys re-export from `@corpus/core/cache/keys`.

### Appendix B — the tanach binding

- **Spine** — `packages/tanach/src/worker/spines.ts` (book/chapter/verse,
  book-validated).
- **Producers** — `producers/defs.ts` (`TANACH_PRODUCERS`: events / note /
  synthesis / midrash-synthesis / translate as core `Producer` objects;
  `markRunDefOf` / `enrichRunDefOf` project to the run shapes).
- **Runtime + store wiring** — `run-ports.ts` (everything in the worked
  example above); Sefaria fetch helpers in `sefaria-sources.ts`.
- **Bespoke by design** — `translate` (raw string + 30-day TTL; a
  selection-keyed utility, not a placed artifact) and the `midrash:v1:*` /
  `commentary:v1:*` SOURCE caches (inputs, not producer outputs) stay on
  direct KV.

## Concept → file map

| Concept | File |
|---|---|
| Spine / SpineRegistry | `packages/core/src/model/spine.ts` |
| Anchor (+ precision ranks, anchorKey) | `packages/core/src/model/anchor.ts` |
| Artifact / LinkBody | `packages/core/src/model/artifact.ts` |
| Provenance / Authority / CostStamp | `packages/core/src/model/provenance.ts` |
| Producer | `packages/core/src/model/producer.ts` |
| Placement lifecycle (`applyRefinements`) | `packages/core/src/model/placement.ts` |
| ALL legacy↔model bridges | `packages/core/src/model/compat.ts` |
| StoredArtifact envelope | `packages/core/src/store/envelope.ts` |
| ArtifactStore (SWR, human-edit guard, staleness) | `packages/core/src/store/artifact-store.ts` |
| Key schemes (talmud-legacy, template) | `packages/core/src/store/key-schemes.ts` |
| Frozen producer key derivation + `recipeHash` | `packages/core/src/cache/keys.ts` |
| Dependency walk (`resolveInputs`) | `packages/core/src/run/producer-run.ts` |
| Run orchestration (`runProducer`, provenance stamp) | `packages/core/src/run/run-producer.ts` |
| Static DAG (dependents, validation) | `packages/core/src/registry/depGraph.ts` → `GET /api/dependents/:id` |
| Legacy coordinates / note / matcher / select / links | `packages/core/src/context/{coord,types,match,placement,select,link}.ts` |
| Talmud producer registry (KV+code → Producer) | `packages/talmud/src/worker/producer-registry.ts` |
| Talmud producer definitions | `packages/talmud/src/worker/code-marks.ts` (schema: `studio-schema.ts`) |
| Talmud run wiring (RUN_PORTS / RESOLVE_PORTS / store) | `packages/talmud/src/worker/index.ts` + `run-sources.ts` |
| Talmud source-cache keys | `packages/talmud/src/worker/cache-keys.ts` |
| Post-LLM pass layer (transform + validate) | `packages/talmud/src/lib/check/passes.ts` |
| Run endpoint + SWR + queue | `packages/talmud/src/worker/index.ts` (`/api/run`, `/api/run-status`) |
| Freshness endpoints | `/api/stale/:id/:t/:p`, `POST /api/admin/rewarm/:id/:t/:p` |
| Budget gate | `packages/talmud/src/worker/budget.ts` |
| Tanach spine / producers / wiring | `packages/tanach/src/worker/{spines.ts,producers/defs.ts,run-ports.ts}` |
| Client queue + result cache | `packages/talmud/src/client/enrichmentQueue.ts` |
| Hebrew/bidi rendering | `packages/talmud/src/client/{Hebraized.tsx,hebraize.ts}` |
| MCP surface | `packages/talmud/src/worker/mcp-openapi.ts` |

## Recipes

### Add a new external source (no engine change)

The template is the *Revach l'Daf* pipeline — each step its own PR,
deterministic-first (refs #88 → deterministic placer #89 → AI fallback #91 →
version + re-warm with SWR #92):

1. **Parser** under `packages/talmud/src/lib/sefref/<source>/parse/*` →
   entries (+ `refs` via the shared `findDafRefs` / `resolveTractateName`).
   Must not depend on placement.
2. **Mapper** `from<Source>(...)` → `ContextItem[]` (set `source`, `kind`,
   `title`/`body`, `refs`) + its `SOURCE_META` entry in
   `src/lib/context/sources.ts`.
3. **Place** (optional) — a matcher `(items, …spineData) => SegMatch[]`
   applied via `applyMatches`. Start deterministic; add a cached AI placer
   only if recall is too low. **Precision over recall.**
4. **Wire** into `collectContext` (after the existing matchers).
5. **Source cache key** in `src/worker/cache-keys.ts`; bump its version if the
   parse shape changes (source keys are app-owned; only producer keys are the
   frozen core contract).

### Add a new producer

1. Add the definition to `code-marks.ts` (`extractor`, `render`,
   `dependencies`, `scope`, `cache_version`). It projects into the `Producer`
   shape automatically (losslessly — anything unknown rides in `legacy.rest`);
   cache keys derive through the frozen scheme — **never hand-build a key**.
2. If it depends on another producer, remember the **cascade**: bumping the
   dependency must bump this one too — `GET /api/dependents/:id` enumerates
   it, `validateProducerGraph` rejects typo'd ids and cycles in CI.
3. It runs through `/api/run` for free (queue, SWR, budget, provenance stamp,
   human-edit guard all apply); the client queue + `runResultCache` apply
   automatically.
4. Opt into post-generation checks via `passes: [...]`
   (`src/lib/check/passes.ts`): transforms mutate/repair, validators return
   issues; `hard` issues gate the cache write behind a bounded retry.
5. Keep `src/worker/mcp-openapi.ts` in sync if you add/rename an endpoint.

For a producer in a *new app*, the tanach worked example is the recipe: a
`Producer` object, a key template (byte-exact if there's a legacy cache),
source resolvers, and ports — no queue or registry required.

## Standing principles

- **Deterministic rules grow over time, but AI keeps final say** on semantic
  judgments; deterministic matchers run first and AI only gap-fills.
- **Precision over recall** for placement — a wrong anchor is worse than
  "whole daf"; leave unplaced when unsure.
- **Human edits outrank AI and are never silently overwritten** — no longer a
  standing rule but an **enforced invariant**: `ArtifactStore.put` refuses to
  overwrite a `provenance.authority === 'human'` entry with rule/AI output,
  and `applyRefinements` never replaces a `via: 'human'` anchor.
- **Keys are byte-frozen**; invalidate by `cache_version`, detect by
  `recipeHash`, act through the dependents cascade.
- **Benchmark-gated producer promotion** — pick models by benchmark on a fixed
  15–30 daf set; eval before promoting.
- **Every behavior move is characterization-tested first** — pin the legacy
  bytes, then move the code.
