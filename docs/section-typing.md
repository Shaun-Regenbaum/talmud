# Section typing — design

Status: draft for review. No code yet. Branch `section-typing-design`.

## The problem we're solving

The per-section "voices" graph (`argument.voices`) assumes every section is a
dispute: it emits `side: A/B/C` and `opposes / supports / responds-to / resolves`
edges. That framework is correct for a מחלוקת but wrong for the rest of Shas. A
cross-daf scan of cached voices graphs (6 dapim, 85 sections) found the breakage
is systemic, not a 67b quirk:

- a story rendered as a debate — Gittin 68a (Ashmedai/Solomon) has a voice node
  literally named **"Demons"** with `responds-to` edges from Rav Chisda;
- the Stam question/answer scaffolding turned into a graph of anonymous
  `Stam (question) -> Stam (answer)` nodes (Berakhot 2a) — that is the *move flow*,
  not a voice dispute;
- 26 mis-directed `responds-to` edges, 18 edges pointing at voices that don't
  exist in the node list, 5 contradictory double-edges (same pair tagged both
  `opposes` and `supports`).

Root cause: **we run one analysis (dispute analysis) over content of many
different kinds.** The fix is to know what *kind* of content a unit is before we
choose how to analyse and render it.

## The reframe: type is not a flat enum

The naive design — add `sectionType: 'dispute' | 'narrative' | 'halachic' | …`
to the `argument` mark — is wrong for two reasons the review surfaced:

1. **A span can be several types at once.** A sugya step can be simultaneously
   part of the dialectical *argument*, a *halachic* ruling, and a *midrashic*
   derivation from a verse. These are not mutually exclusive categories; they are
   **dimensions**.
2. **Types nest at different granularities.** A large dispute unit can contain a
   small, specifically-halachic sub-span; a halachic discussion can contain an
   embedded narrative (מעשה). "One type per section" cannot express this.

So type is **multi-label and granular**, not a single tag.

### The layers we want already exist

The app already extracts independent, overlapping mark layers, each emitting
`{ startSegIdx, endSegIdx, fields }` over the same text
(`src/worker/output-schemas.ts`):

| Layer | Dimension it represents |
|---|---|
| `argument` | dialectical structure (the skeleton: sections + moves) |
| `halacha` | the halachic dimension (a ruling/topic) |
| `aggadata` | the narrative / aggadic dimension (a story, with `theme`) |
| `pesukim` | the scriptural dimension (verse citation, with `citationStyle`) |
| `rabbi`, `places` | entity layers |

These **are** the type dimensions. We don't need to invent a genre enum — a unit
is "halachic" exactly when a `halacha` instance covers it, "narrative" when an
`aggadata` instance covers it, "midrashic" when a `pesukim` derivation covers it,
"dispute" when the `argument` structure over it has real opposing voices.

The only thing missing is the **relation** between layers. Today each mark
depends only on `'gemara'` and is computed in isolation; nothing records that a
given halacha span falls inside argument section #2, or that section #2 is mostly
a story. They are parallel overlays that merely happen to share segment indices.

**Section typing = compute that relation, deterministically.**

## Coverage findings — what "no category" actually means

Measured against the live API (`POST /api/run`, all cache hits, zero
cost) by overlaying the content layers on every segment:

| Daf | content-covered | uncovered segs | what the gaps are |
|---|---|---|---|
| Gittin 67b | 19/22 | 7, 17, 21 | hadran marker; a one-line maxim; a dangling cross-page fragment |
| Gittin 68a | 13/13 | — | all aggadah |
| Berakhot 2a | 10/14 | 5,6,9,10 | **pure Gemara question/answer** (שקלא וטריא) |
| Sanhedrin 59b | 18/25 | 4-7,16,18,24 | dialectical challenge; objection connectors; one missed ruling |

The decisive result: **the biggest source of "uncategorized" segments is pure
dialectical reasoning** — the Gemara's own questions, answers, objections, and
challenges. `halacha` / `aggadata` / `pesukim` model *rulings, stories, and
verses*; none of them model **argumentation itself**. So a segment that is just
the Gemara reasoning (the bulk of שקלא וטריא) is covered by no content layer.

This forces a correction to the model below: **`argument` is not merely the
skeleton — its dialectical structure IS the base type.** Every segment is
covered by `argument` (it partitions the daf 100%), and each `argument-move`
carries a `role` (`question | answer | objection | resolution | …`). That role
is the always-present *dialectical* type. The content marks are *overlays* that
add dimensions on top.

So the layers stratify:

- **Base (always present):** `argument` / `argument-move` role → the dialectical
  type. A unit covered by the base but no overlay is **"pure שקלא וטריא"** — a
  real, nameable type, not a gap.
- **Overlays (where present):** `halacha` (ruling), `aggadata` (story),
  `pesukim` (verse) — added dimensions.

### The gap taxonomy (what's left after the base layer)

Once the dialectical base counts as a type, genuine "no type at all" shrinks to
four cases, each handled differently:

1. **Pure dialectic** (Berakhot 5,6,9,10; Sanhedrin 4-7) — NOT a gap. It is the
   `argument-move` role. The mistake was treating `argument` as structure rather
   than as the base type.
2. **Structural markers** — הדרן (67b seg 7), perek headers. Tag as `marker`;
   render as a divider, not a card.
3. **Extraction recall misses** — a one-line maxim the `aggadata` mark skipped
   (67b seg 17), a ruling `halacha` missed (Sanhedrin seg 24). Real misses;
   addressed by widening content-mark recall or a catch-all "dictum" type, and
   surfaced by the coverage audit (below) rather than hidden.
4. **Cross-page danglers** — a fragment whose unit continues on the next daf (67b
   seg 21 → 68a). Resolved only by sugya-spanning units; until then, flag as
   `continues-next`.

This means the **coverage audit is itself a deliverable**: running the overlay
and bucketing every uncovered segment into {dialectic, marker, miss, dangler}
tells us, per daf, whether our marks are complete — and turns "are we missing
content?" from a worry into a measured number.

## Data model: a type profile per unit

For each structural unit U (today an argument section / move; later a sugya
section — see Cross-page), derive a **type profile**: the set of layer claims
that materially cover U.

```
TypeProfile = {
  unit: { tractate, page, startSegIdx, endSegIdx }   // or a cross-page range
  claims: LayerClaim[]
  primary: 'pure-dialectic' | 'halacha' | 'aggadata' | 'pesukim'  // content dimension (derived)
  register: 'mishnah' | 'gemara'   // textual axis, orthogonal to primary (derived)
  isDispute: boolean         // argument structure over U has >=1 opposing voice
}

LayerClaim = {
  layer: 'argument' | 'halacha' | 'aggadata' | 'pesukim' | 'rabbi' | 'places'
  instanceId: string         // which instance of that layer
  placement: Placement       // the grounding-layer placement of the claim onto U
  coverage: number           // 0..1 fraction of U's segments the claim covers
}
```

`Placement` is the **existing** grounding-layer reader type
(`src/lib/context/placement.ts`): `{ level: 'words'|'segment'|'amud'|'daf',
segs[], words?, amud?, via?, confidence? }`. Reusing it means typing speaks the
same placement/confidence/provenance language as everything else — no new anchor
vocabulary.

### Why this satisfies both constraints

- **Multi-type** is native: a unit with both an `argument` claim and a `halacha`
  claim simply has two entries in `claims`. No either/or.
- **Nesting** is native and needs no separate "subsection" concept. A halachic
  sub-span inside a 6-segment dispute is a `halacha` claim with
  `placement.level = 'segment'`, `coverage ≈ 0.3`, sitting inside an `argument`
  claim with `coverage = 1.0`. Granularity (`level`) plus `coverage` *is* the
  nesting. The inverse case (a מעשה inside a halachic discussion) is the same
  shape with the roles swapped: primary `halacha` (full), nested `aggadata`
  (partial).

### `primary`, `register` and `isDispute` are derived, not stored

These are **three orthogonal axes**, not one. A unit can be a `mishnah` that is
`halacha`-primary, or a `gemara` that is `pure-dialectic` and a dispute.

- **`primary`** (content — *what it's about*). The base is always the
  `argument-move` dialectical role; overlays compete to become `primary`,
  chosen deterministically: an overlay (halacha/aggadata/pesukim) that
  materially covers U wins on coverage × confidence × a small layer-priority
  tiebreak; **if no overlay clears the floor (`PRIMARY_FLOOR`), `primary` falls
  back to the dialectical base** (`pure-dialectic`) rather than "untyped".
- **`register`** (text — *what kind of text it is*). `mishnah` when the majority
  (`REGISTER_FLOOR`, 0.5) of U's segments fall in the daf's mishnah-in-talmud
  ranges, else `gemara`. Derived deterministically from the cached Sefaria
  `/api/related` mishnah anchors — no LLM. `baraita` is intentionally absent: the
  source only labels mishnah-in-talmud, so there's no deterministic signal for it
  yet. (Implemented: `registerOf` in `src/lib/typing/profile.ts`.)
- **`isDispute`** (rhetoric — *is it a debate*). True only when the `argument`
  structure over U has at least one `opposes` edge — the gate that stops a story
  (or a one-sided Stam Q&A) from being rendered as a debate. Orthogonal to the
  other two: a כולכם dispute with no content overlay is `pure-dialectic` +
  `isDispute: true`.

## How analysis & rendering change

1. **Voices becomes conditional.** `argument.voices` runs only on units where
   `isDispute` (or `dialectic-qa`) holds. A narrative-primary unit runs a sibling
   `argument.narrative` instead (actors + what each does + ordered beats), and a
   midrash-primary unit runs a verse↔derivation view. This is the direct fix for
   the "Demons" node and the Stam-Q&A-as-voices graphs.
2. **Rendering composes the profile** instead of switching on a single kind.
   Today the sidebar switches on `SidebarContent.kind`
   (`src/client/ArgumentSidebar.tsx`). It becomes: render the `primary`
   dimension's view, then surface nested claims as sub-bands / child cards. A
   dispute unit with a nested halacha span shows the voice map plus a halachic
   sub-band on those segments; a halachic unit with an embedded מעשה shows the
   ruling plus the story as a child.
3. **Downstream syntheses consume the profile** rather than re-deriving kind, so
   they stop, e.g., narrating a remedy list as if it had a holding.

## Recommended architecture: one generative pass + deterministic composition

You asked directly: replace all the anchor-finding processes with one, or run two
and reconcile with a third?

**Neither an ensemble nor a single mega-extractor. One generative pass per layer
(already the case) + a deterministic composition step that relates them.**

- The marks are already extracted once each (one LLM pass per layer, then a
  deterministic re-anchor: `postProcessArgument` treats LLM indices as *hints*
  and re-finds spans by verbatim excerpt — `src/worker/index.ts:1282`). Keep
  that.
- Composition (intersect layer ranges → type profile) is **pure segment-range
  math plus the grounding confidence**. No new LLM call, no third
  reconciler-model. This matters: there is a hard budget guard at the `runLLM`
  chokepoint ($10/hr, $300/day), and a reconciler-LLM is both costly and itself
  fallible.
- **Why not two-systems-plus-a-synthesizer:** we already *have* multiple
  independent LLM derivations of the same facts (section synthesis vs move
  synthesis vs voices) and they diverge silently — that is the bug, not the cure.
  Adding a third model to vote does not make truth; a deterministic cross-check
  does. The composition step *is* the reconciler, and being deterministic it is
  cheap, reproducible, and unit-testable.

### The one place an LLM hint helps

Pure range-overlap can be ambiguous (a unit fully covered by both `argument` and
`halacha` — is it primarily a dispute that happens to rule, or a ruling argued
dialectically?). To break ties, the structural mark emits a cheap **`unitKind`
hint** (`dispute | dialectic-qa | narrative | midrash | statement`) in the *same
pass* that finds boundaries — one extra field, no extra call. The hint is a
tiebreak input to `primary`; it is **not authoritative**. The deterministic
composition can override it: if the mark says `dispute` but there are zero
opposing named voices and an `aggadata` instance covers the unit, `primary`
becomes narrative. That override is exactly the deterministic qualifier doing the
reconciliation a third LLM would do worse.

## Converge the anchor zoo onto one placement contract

Section typing is the forcing function to pay down the real architectural debt.
Today "pin fuzzy output to a precise spot, qualify it, dedupe/partition" is
implemented about six times bespoke — `postProcessArgument`,
`postProcessArgumentMove`, `postProcessPesukim`, `postProcessAggadata`,
`postProcessRabbi`, `postProcessRabbiEvidence` (`src/worker/index.ts`) — **plus**
once properly, the grounding layer (`src/lib/context/`, every placer emits a
uniform `SegMatch` with confidence + provenance).

Recommendation: make the grounding placement contract the single nucleus.

- The composition step reads every layer's instances **as placements** and
  intersects them. Bespoke `postProcessX` re-anchoring is migrated to emit
  `SegMatch`/`Placement` rather than ad-hoc index rewriting.
- This is the same seam as the standardized post-LLM **pass** layer
  (`src/lib/check/passes.ts`): a **transform** phase (placement/qualification —
  e.g. the re-anchorers, `derive-voice-edges`) and a **validate** phase (the
  linters + checks: anchor-verbatim, edge-integrity, partition-clean,
  type-coherence). Only validate passes are "checks"; transforms build, not
  judge. Once that seam exists, section typing is "a composition + a renderer
  dispatch + a validate check," not a seventh bespoke branch.

The test of whether the framework is extensible: with this seam, typing is
additive; without it, typing is another `postProcessX`. Right now it would be the
latter — that is the thing to fix.

## Cross-page / sugya alignment (build on the new map, not the old mark)

A parallel effort is rebuilding the whole-daf "Argument map" to follow the
**sugya**, which spans pages (Shabbat 125b–126b), behind the experimental flag.
The mark `argument-overview` is `experimental: true`, `anchor: 'whole-daf'`,
computed (`src/worker/code-marks.ts:515`); its code comment states sugya-spanning
ranges and cross-daf boundaries are still being shaped. The stated next step is a
"find the discussion boundaries" test on Shabbat 125–127.

That boundary-finder and section typing are **the same structural pass**: finding
sugya units and labelling each unit's `unitKind` is one model call, not two.
Therefore:

- **Build typing into the new cross-page boundary-finder, not the current
  per-daf `argument` mark** (which is on its way out behind the flag).
  Retrofitting the per-daf mark would be throwaway.
- The profile model is unit-shape-agnostic: a unit is a `{tractate, page, segs}`
  today and a cross-page range later. `Placement` already carries `amud` and
  daf-level granularity, so composition works identically for a sugya section
  that crosses an amud/daf boundary.
- **Ship behind the same experimental flag.** New enrichments
  (`argument.narrative`, the profile-driven renderer) get `experimental: true`
  and are gated by `devModeActive()` (`src/client/DevModeShelf.tsx`,
  `MarksRegistryPanel.tsx`) — readers see nothing until promoted.

## Framework changes (summary)

1. **`unitKind` hint** on the structural mark (boundary-finder), emitted with
   boundaries in one pass. Tiebreak only.
2. **Composition utility** — deterministic: given a unit range, intersect all
   other mark layers' instances, emit a `TypeProfile` of `LayerClaim`s using the
   grounding `Placement` shape. Shared, not per-mark.
3. **Profile-conditional enrichments** — add an `applies_to` predicate so
   `argument.voices` runs only where `isDispute`, `argument.narrative` where
   narrative-primary, etc. Today enrichments run unconditionally when toggled
   (`runEnrichmentOnce`); this adds a gate before dispatch.
4. **Renderer dispatch on the profile** — extend the sidebar from a single-`kind`
   switch to "render `primary` + surface nested claims." New `SidebarContent`
   variants behind the flag.
5. **Converge anchoring** — migrate the bespoke `postProcessX` re-anchors onto
   the grounding `SegMatch`/`Placement` contract; run them through the
   standardized transform/validate seam.

## The plan, given the cross-page diagram isn't built yet

The whole-daf "Argument map" / flow graph is still experimental and the
sugya-spanning version is not built. **Section typing does not depend on it.** It
rides the per-daf `argument` + `argument-move` marks, which work today and are
cached (verified: all four content marks for Gittin 67b are 200 cache hits via
`/api/run`). So we deliver typing now on the working per-daf structure and
fold it into the diagram later, not the other way round.

Phases — each shippable, flag-gated, reversible:

- **P0 — coverage audit (deterministic, no LLM). DONE in prototype.** Overlay the
  content layers on every segment and bucket each uncovered segment into
  {pure-dialectic, marker, miss, dangler}. Productionize as a `partition-clean` +
  `coverage` check and run it across many dapim to get a real number for "how
  much do our marks miss, and of what kind." This is a deliverable on its own: it
  tells us where extraction recall is weak (case 3 misses) without any UX change.
- **P1 — the TypeProfile composition (deterministic, no LLM).** Compose
  `argument-move` role (base) + halacha/aggadata/pesukim overlays into a
  `TypeProfile` per unit, with `pure-dialectic` fallback. Validate against the
  scanned dapim: Ashmedai unit → narrative-primary; כולכם unit → dispute; Berakhot
  2a segs 5-6,9-10 → pure-dialectic (not "untyped"); 67b remedies → aggadata.
- **P2 — gate voices on `isDispute`; add the alternatives.** Stop rendering
  dispute graphs on non-dispute units; add `argument.narrative` (story view) and
  a `pure-dialectic` move-flow view. Flag-gated. This alone removes the "Demons"
  node and the Stam-Q&A-as-voices pathologies.
- **P3 — `unitKind` hint** in the structural pass as a tiebreak; profile override
  logic; `type-coherence` validate check.
- **P4 — profile-driven renderer** (nested claims as sub-bands / child cards;
  `marker` renders as a divider; `continues-next` flagged).
- **P5 — fold into the cross-page boundary-finder** when it lands; profiles
  computed over sugya units. Cross-page danglers (case 4) resolve here.
- **P6 — converge `postProcessX` onto the placement contract** (parallelizable
  with the checks-layer work).

P0+P1+P2 are all deterministic or flag-gated and need nothing from the unfinished
diagram — that's the near-term path.

## Open questions

1. **`primary` tiebreak weights.** Coverage × confidence × layer-priority — what
   priority order, and does the `unitKind` hint dominate or only break ties?
   Decide empirically on the scanned dapim in P0.
2. **Coverage threshold for a claim to count.** A 1-of-7-segment halacha span —
   is that a nested claim or noise? Propose a floor (e.g. cover ≥1 full segment
   or a words-level placement with confidence ≥ τ).
3. **Move-level vs section-level typing.** Do we type only sections, or moves
   too? Moves are finer and may flip type mid-section (a halachic move inside a
   narrative section). Leaning: type at the unit the renderer cards on, with
   nested claims surfacing finer shifts.
4. **Mishnah.** ~~Does it get its own primary, or inherit from the gemara that
   expounds it?~~ *Partly resolved:* the **`register`** axis now labels a unit
   `mishnah` vs `gemara` deterministically (orthogonal to `primary`), so a
   Mishnah section keeps its own content `primary` (often `halacha`) *and* is
   marked `register: mishnah` — no inheritance needed. Open remainder: whether a
   gemara unit should carry a back-reference to the mishnah it expounds.
5. **Cross-page composition cost.** Intersecting layers across a multi-daf sugya
   needs all member dapim's marks resident; coordinate with the boundary-finder's
   data-loading.
