# The framework, from the code

> How this app is built, in the vocabulary of the code — written so it can later
> be extracted as an SDK. The plain-English version is "the Talmud covered in
> smart notes"; this is the same thing with the types and file paths. Every type
> and path below is real; when something is still aspirational it says so.

## The shape

Three substances:

- **Spines** — continuous, addressable texts (the Gemara of a tractate, Tosafot,
  Tanach). A "page" (amud) is a window onto a spine. Today the Gemara spine is
  addressed per-amud; cross-spine / cross-daf coordinates already exist.
- **Entities** — referents that appear at many spans (a rabbi, a place). Today
  carried as `scope='global'` enrichments keyed by instance, not daf.
- **Pieces** — everything we author or derive (marks, enrichments, context
  items, links). The core unit.

A **piece** anchors to one or more **coordinates**, is built from declared
**inputs**, made by a **producer** (rule and/or AI), and cached with
**provenance** (how it was made, how sure we are). Pieces compose — a producer's
inputs can be other pieces — and **views are generated from pieces**, never
authored directly.

Two orthogonal questions every piece answers:

| Question | Field(s) | Notes |
|---|---|---|
| *Where does it sit?* | `segs` / `coord` | in-daf segments + an optional cross-daf anchor |
| *What does it cite?* | `refs` | external coordinates, rendered as links, **never** placement |

Keeping "where it attaches" separate from "what it points at" is the single most
load-bearing distinction in the model.

## Coordinates — `src/lib/context/coord.ts`

A coordinate is *the* address. Same-daf, sibling-amud, and other-tractate are all
just coordinates; the reader decides how to render each.

```ts
interface AnchorCoord { tractate: string; page: string; seg: number }  // one segment anywhere in Shas
type AnchorSpan = AnchorCoord[]                                          // an ordered, possibly cross-daf set
type DafRef     = { tractate: string; page: string }

const DAF_SEG = -1                       // sentinel: "the whole daf", not a real segment
coordForSeg(daf, seg)  ·  dafCoord(daf)  ·  coordsForSegs(daf, segs)
coordKey(c)  ·  sameDaf(a, b)  ·  localSeg(c, daf)  ·  isCrossDaf(c, daf)
normalizeSpan(span)  ·  spanByDaf(span)  ·  coordFromTarget(target)
```

`DAF_SEG = -1` is how a daf-level placement (or a daf-level `ref` like
"Pesachim 50a" with no segment) rides through the same `AnchorCoord` type as a
precise segment — readers branch on `seg < 0`.

## The note contract — `src/lib/context/types.ts`

All external study material (dafyomi.co.il, Sefaria commentary, Mishnayot…) maps
into one flat `ContextItem`. The fields that matter for the framework:

```ts
interface ContextItem {
  source; sourceLabel; kind; key;     // identity
  title?; body?; url?; table?;        // payload (table = structured Hebrew charts)

  // WHERE it sits:
  segs: number[];                     // in-daf segments; [] = not localized
  amud?: 'a' | 'b';                   // coarse locator (display only)
  coord?: AnchorCoord;                // cross-daf anchor (parallel sugya, citation home)

  // WHAT it cites:
  refs?: AnchorCoord[];               // external coords (daf-level uses seg = DAF_SEG)

  // PROVENANCE:
  via?: string;                       // 'pieceKeys' | 'mishnah' | 'tosfos-dh' | 'ai'
  confidence?: number;                // 0..1 (AI matches carry this)

  // client-only HB word placement (alignment workbench):
  hbWords?; hbVia?; hbConfidence?;
}
```

`segs` is *the* in-daf anchor. `coord` is the additive cross-daf anchor (the
cross-page sugya map reads it; the in-daf reader ignores it). A plural
`anchors?: AnchorCoord[]` — many first-class placements per item — is the
forward shape; it lands with the select/placement wiring that consumes it.

Rendering helpers: `rangeLabel(segs, amud)` (→ `[whole daf]` when unplaced) and
`coordLabel(c)` in `types.ts`; citations render through the **Link** piece
(`link.ts`) rather than a citation-only helper — see "Links" below.

## Placement — coordinates earned, conservatively

There is no separate "context" concept: a study-aid is **pieces on its own
spine**, and "grounding" is **links** into the Gemara. Placement is a distinct
layer with one contract — a matcher emits `SegMatch[]`, and **`applyMatches` is
the only writer** of placement onto items.

### The matcher contract — `src/lib/context/match.ts`

```ts
interface SegMatch {
  key: string;            // which ContextItem.key this places
  segs: number[];         // in-daf segments; [] = no-op unless wholeDaf/coord set
  coord?: AnchorCoord;    // cross-daf home (counts as a placement even if segs is empty)
  via: string;            // matcher id: 'tosfos-dh' | 'pieceKeys' | 'ai' | …
  confidence?: number;    // AI matchers set this; deterministic ones may omit
  quote?: string;         // verbatim Hebrew the item is about (client resolves to HB word positions)
  wholeDaf?: boolean;     // deliberate daf-level placement (a general note), not a failure
}

applyMatches(items, matches): number   // writes placements in place, returns count changed
```

A matcher is just `(items, …spineData) => SegMatch[]`. They are pure and
composable — `collectContext` runs several in sequence, each blind to the others,
all funnelling through `applyMatches`. Current matchers:

- `anchor/tosfos.ts` — Tosfos pieces by Sefaria pieceKey (deterministic, exact).
- `anchor/bg-term.ts` — background terms by Hebrew whole-word overlap.
- `anchor/revach.ts` — `matchRevach(items, sections)`: aligns English Revach
  prose to the daf's `argument` sections by content-word overlap, order-preserving
  (max-weight non-decreasing subsequence), place-or-omit.
- `anchor/ai-prompt.ts` + `src/worker/context-match.ts` — the AI placer.

### Levels — `src/lib/context/placement.ts`

```ts
type PlacementLevel = 'cross-daf' | 'words' | 'segment' | 'amud' | 'daf'
LEVEL_RANK = { 'cross-daf': -1, daf: 0, amud: 1, segment: 2, words: 3 }   // higher = more precise
placementOf(it, daf?)  ·  placementLevel(it)
isLocated · isPrecise · isGrounded · isAiGrounded   // predicates over an item
```

**Layering rule (load-bearing):** parsing/refs must NOT depend on placement; a
placer takes the spine's sections in and returns `SegMatch[]` out; consumers
choose anchored vs unplaced vs whole-daf. **Precision over recall** — a wrong
anchor is worse than `[whole daf]` because the LLM treats the label as fact;
leave unplaced when unsure. Deterministic first, AI only to fill the gaps it
leaves (see the worked example).

### Assemble + select

1. **Assemble.** `collectContext(env, tractate, page, opts?)` in
   `src/worker/context-providers.ts` builds the live pool (LLM-free) and runs the
   deterministic matchers. It's recomputed live — there is no context-pool cache.
2. **Select + render for a prompt.** `src/lib/context/select.ts` —
   `contextForAnchor(items, targetSegs)` narrows to what intersects the anchor,
   then `formatContextForPrompt(items)` produces the `{{context}}` block
   (placement via `rangeLabel`, citations appended via `linkLabel(citationLink(refs))`).

## Producers — `src/worker` (`studio-schema.ts`, `code-marks.ts`)

`studio-schema.ts` is the single source of truth for producer shape. Two kinds:

- **Mark** = an annotation layer on a daf, defined by `(anchor, render,
  extractor, dependencies)`. The first pass — finds *where* to attach instances.
- **Enrichment** = an operation on a mark's instances. Carries `scope` +
  `dependencies`.

```ts
// a Mark definition (abridged, from code-marks.ts)
{
  id: 'rabbi', label: 'Rabbis', category: 'canon',
  anchor: 'phrase',
  render:    { kind: 'inline', style: 'underline', hoverable: true },
  extractor: { kind: 'llm', system_prompt, user_prompt_template, output_schema },
  dependencies: ['gemara'],
  cache_version: '2', def_hash: 'rabbi-v2', status: 'promoted', source: 'code',
}
```

A producer opts into post-LLM passes via a `passes: string[]` field. Each named
pass is registered in `src/lib/check/passes.ts` and is one of two phases: a
**transform** (mutates/repairs the parsed output — re-anchorers, voice-edge
derivation) or a **validate** (returns `CheckIssue[]`; `hard` issues gate the
cache write via bounded retry; `soft` issues attach as quality signals but never
block). `runPasses` runs all transforms (in declaration order) then all
validators — DOM-free, unit-testable.

**`dependencies`** is the composition edge — it tells the runner what to feed the
prompt:

- `'gemara'` / `'commentaries'` — context slices for this daf.
- `{ enrichment: id }` — the output of another enrichment (forms a DAG; a bump to
  a dependency must cascade to its dependents — see Caching).
- `{ mark: id }` — instances of another mark on the same daf.

**`scope`** drives cacheability:

- `global` — same regardless of daf (a rabbi's bio). Keyed by instance only.
- `local` — computed in light of *this* daf (a synthesis). Keyed by instance + daf.

### Run lifecycle — `/api/run`

One endpoint runs any producer for a `(tractate, page, mark_input)`. It is async:

```
POST /api/run  →  { status: 'ok', result }                  // cache hit, immediate
                      →  { status: 'pending', runId, cacheKey? }   // enqueued (202); poll
                      →  { status: 'error', error }
GET  /api/run-status/:runId  →  same shape; poll until 'ok'
```

The cold path enqueues a `JobMessage` onto the `enrichment-jobs` Cloudflare
Queue (consumer at concurrency 50) and the client polls. Budget is gated at the
`runLLM` chokepoint (`src/worker/budget.ts`). The client side
(`src/client/enrichmentQueue.ts`) adds a bounded-concurrency priority queue (a
foreground click outranks background prefetch) and an in-session
`runResultCache` so re-opening an anchor is instant.

## Caching + freshness — `src/worker/cache-keys.ts`

- **Keys are auto-derived, never hand-built at call sites:** `keyForMark(...)`,
  `keyForEnrichment(def, instance_id, daf?, qualifier?, lang)`. Shape:
  `enrich:{id}:{cache_version}{:he?}:{instance_id}[:{tractate}:{page}][:q_{hash}]`.
  Source caches: `keyForGemara`, `keyForDafyomi` (`dafyomi:v5:{daf}`),
  `keyForCommentaries`. **No TTL.**
- **Invalidation today is `cache_version`** — a manual integer bump on the
  producer, part of the key, so the old entry becomes unreachable. (`def_hash`
  on a definition is a *vestigial hand-authored literal*, NOT in the key and not
  re-derived — see `recipeHash` below for its computed successor.) A bump must
  **cascade** to every producer that lists this one as a dependency, or the
  dependent cache-hits and readers never see the change — the cascade the
  reverse-dependency index now computes (below).
- **Stale-while-revalidate (shipped).** `previousVersionKey(key, id, version)`
  returns the prior version's key. On a version-bump miss `/api/run`
  serves the previous value tagged `{ stale: true, refreshing: true }` and
  enqueues the recompute, so a bump never makes a reader wait. The client
  (`MarkEnrichmentCards`) shows it with an "Updating…" badge, does **not** pin it
  in `runResultCache`, and re-fetches on a short backoff to swap in the fresh
  value in-tab. This is the framework's **immutable-versions + active-alias**
  idea arriving early; keep it generic and **never overwrite a human-authored
  piece**.
- **Content-hash freshness (in progress).** `recipeHash(def)` (`cache-keys.ts`)
  is the *computed* content hash of a producer's recipe — `extractor` (+ `render`
  for marks), field-order-insensitive — reproducing the documented `def_hash`
  contract but derived, so it can't drift. It is deliberately **NOT** in the
  cache key (GC sweeps by `cache_version`; keying on a content hash would orphan
  every entry in the TTL-less KV). The plan: store it with each cached run and
  compare on read to detect staleness automatically. Stale = a *candidate* for
  recompute, never a silent overwrite of a human correction.
- **Reverse-dependency index (shipped).** `src/lib/registry/depGraph.ts` inverts
  the producer `dependencies` DAG: `transitiveDependents(id)` is the full re-warm
  set when `id` changes, exposed read-only at `GET /api/dependents/:id`. So a
  `cache_version` bump enumerates exactly what to cascade (e.g.
  `argument.background` → `argument.synthesis` → the daf overview) instead of
  relying on memory. `validateProducerGraph` guards the graph in CI (no dangling
  dependency ids, no cycles).

## Provenance + confidence

Every placement records `via` (which matcher) and, for AI matches, `confidence`
(0..1). The AI placer floors at `MIN_AI_CONF = 0.6` and only **gap-fills** — it
never overrides a deterministic or human placement. Predicates in `placement.ts`
(`isAiGrounded`, `isPrecise`, …) let any consumer treat a confident exact match
differently from a hedged AI guess. The standing rule: **human edits outrank AI
and are never silently overwritten.**

## Client rendering contract — `src/client`

Views are generated from pieces, not authored. The two reusable primitives:

- **`<Hebraized text={…}>`** (`Hebraized.tsx` + `hebraize.ts`) — LLM-emitted
  English with parenthesized Hebrew is normalized (dict pass + lazy LLM pass,
  KV-cached), redundant all-Hebrew gloss echoes are stripped, and every Hebrew
  run is wrapped in `<bdi>` (`BidiText`) so surrounding English punctuation keeps
  its left-to-right position instead of being reordered by the bidi algorithm.
- **`runResultCache` + live-refresh** (`enrichmentQueue.ts`,
  `MarkEnrichmentCards.tsx`) — the in-session result memo plus the SWR
  observation described above.

## Worked example — un-flattening *Revach l'Daf*

*Revach l'Daf* is English summary prose covering a whole daf (both amudim) and
citing other dapim ("Pesachim 50a"). Before: every entry was fed to the LLM as
`[whole daf]` and its citations were dropped. The full pipeline, each step its
own PR, deterministic-first:

1. **Refs (#88).** `parseRevach` → `findDafRefs` (`parse/common.ts`) +
   `resolveTractateName` (`masechtos.ts`) capture `entry.refs` as resolved
   `{tractate, page}`. `fromDafyomi` carries them onto `ContextItem.refs`;
   `formatContextForPrompt` renders `… (cites Pesachim 50a)`. `dafyomi:v4 → v5`
   re-parses (no LLM). *The first real stand-off link with a true span.*
2. **Deterministic placer (#89).** `matchRevach(items, sections)` aligns entries
   to the daf's `argument` sections by content-word overlap, order-preserving,
   place-or-omit (high precision, ~13% recall).
3. **AI fallback (#91).** `placeRevachWithAi` gap-fills what the deterministic
   placer left unplaced, cached per daf (`revach-place:v2:{tractate}:{page}`),
   floored at `MIN_AI_CONF`, coalesced in-isolate, never overriding a placement.
4. **Rollout (#92).** Bump `argument.background` + the cascade to
   `argument.synthesis` (what readers see) + `argument-overview.synthesis`, with
   stale-while-revalidate so the re-warm is invisible.

This is the template every later linked source follows: parse → map → place
(deterministic, then AI) → version + re-warm with SWR.

## Recipes

### Add a new external source (no engine change)

1. **Parser** under `src/lib/sefref/<source>/parse/*` → entries (+ `refs` via the
   shared `findDafRefs` / `resolveTractateName`). Must not depend on placement.
2. **Mapper** `from<Source>(...)` → `ContextItem[]` (set `source`, `kind`,
   `title`/`body`, `refs`).
3. **Place** (optional) — a matcher `(items, …spineData) => SegMatch[]`, applied
   via `applyMatches`. Start deterministic; add a cached AI placer only if recall
   is too low. **Precision over recall.**
4. **Wire** into `collectContext` (after the existing matchers).
5. **Source cache key** in `cache-keys.ts`; bump its version if the parse shape
   changes.

### Add a new producer (mark / enrichment)

1. Add the definition to `code-marks.ts` (`extractor`, `render`, `dependencies`,
   `scope`, `cache_version`). Cache keys derive automatically — never hand-build.
2. If it depends on another enrichment, remember the **cascade**: bumping the
   dependency must bump this one too.
3. It runs through `/api/run` for free; the client queue + `runResultCache`
   + SWR apply automatically.
4. Keep `src/worker/mcp-openapi.ts` in sync if you add/rename an endpoint.

## Concept → file map

| Concept | File |
|---|---|
| Coordinates | `src/lib/context/coord.ts` |
| Note contract | `src/lib/context/types.ts` |
| Links (relations + constructors) | `src/lib/context/link.ts` |
| Unified link layer (assembler) | `src/lib/context/dafLinks.ts` → `GET /api/links/:t/:p` |
| Matcher contract / `applyMatches` | `src/lib/context/match.ts` |
| Placement levels + predicates | `src/lib/context/placement.ts` |
| Matchers | `src/lib/context/anchor/{tosfos,bg-term,revach,ai-prompt}.ts` |
| AI placer (worker) | `src/worker/context-match.ts`, `src/worker/revach-ai-place.ts` |
| Assemble pool | `src/worker/context-providers.ts` |
| Select + format for prompt | `src/lib/context/select.ts` |
| Producer schema | `src/worker/studio-schema.ts` |
| Producer registry | `src/worker/code-marks.ts` |
| Post-LLM pass layer (transform + validate) | `src/lib/check/passes.ts` |
| Run endpoint + SWR | `src/worker/index.ts` (`/api/run`) |
| Cache keys + versioning + `recipeHash` | `src/worker/cache-keys.ts` |
| Reverse-dependency index + validation | `src/lib/registry/depGraph.ts` → `GET /api/dependents/:id` |
| Budget gate | `src/worker/budget.ts` |
| Client queue + result cache | `src/client/enrichmentQueue.ts` |
| Hebrew/bidi rendering | `src/client/{Hebraized.tsx,hebraize.ts}` |
| MCP surface | `src/worker/mcp-openapi.ts` |

## Toward an SDK

The reusable core is spine-agnostic and already separable:

- **Addressing** — `AnchorCoord` / `AnchorSpan` / `DafRef` + the `coord.ts`
  helpers.
- **The note** — `ContextItem` with `segs` / `coord` / `refs`, and the
  `rangeLabel` / `coordLabel` renderers.
- **Links** — `link.ts`: a `Link` is a piece connecting a source anchor to
  target anchors under a relation. `LinkRelation` is the **same set the
  argument-overview flow graph emits** — `cites` · `continues` · `resolves` ·
  `depends-on` · `parallels` · `contrasts` · `generalizes` — so every edge in
  the system expresses as a Link. Constructors: `citationLink(refs)` (a note's
  external refs), `continuationLink(to)` (the cross-daf bridge, surfaced on
  `/api/bridge` as `link`), and `flowLinks(edges, coordOf)` (the flow graph →
  `{source, link}[]`). All render through one `linkLabel`. (Voice edges are
  *below* coord granularity — voice-to-voice within a section — so they stay
  their own model, not Links.) **Consumer:** `dafLinks(daf, …)`
  (`dafLinks.ts`) assembles a daf's whole link graph — bridge + citations + flow
  — into one list, served at `GET /api/links/:tractate/:page`. The first thing
  that reads the unified layer end-to-end.
- **Placement** — the `SegMatch` + `applyMatches` sink and the pure matcher
  signature `(items, …spineData) => SegMatch[]`, with deterministic-then-AI
  layering and the `placement.ts` level/predicate vocabulary.
- **Producers** — the `studio-schema` Mark/Enrichment shape, the
  dependency DAG, `cache_version` + `def_hash` invalidation, and the SWR
  active-alias primitive.

A new source = a parser + a `from<Source>` mapper + an optional placer. A new
producer = a definition in the registry. **No engine changes** — which is the
test of whether the framework is real.
