# The framework, from the code

> How this app is built, in the vocabulary of the code — written so it can later
> be extracted as an SDK. The plain-English version is "the Talmud covered in
> smart notes"; this is the same thing with the types and file paths.

## The shape

Three substances:

- **Spines** — continuous, addressable texts (the Gemara of a tractate, Tosafot,
  Tanach). A "page" (amud) is a window onto a spine. Today the Gemara spine is
  addressed per-amud; cross-spine/cross-daf coordinates already exist.
- **Entities** — referents that appear at many spans (a rabbi, a place). Today
  carried as "global"-scope enrichments.
- **Pieces** — everything we author/derive. The core unit.

A **piece** anchors to one or more **pointers**, is built from declared
**inputs**, made by a **producer**, and cached with **provenance**.

## Coordinates — `src/lib/context/coord.ts`

```ts
interface AnchorCoord { tractate: string; page: string; seg: number }  // one segment anywhere in Shas
type AnchorSpan = AnchorCoord[]                                          // an ordered, cross-daf set
type DafRef = { tractate: string; page: string }
coordForSeg(daf, seg) · coordKey(c) · isCrossDaf(c, currentDaf) · spanByDaf(span)
```

A coordinate is *the* address. Same-daf, sibling-amud, and other-tractate are all
just coordinates — the reader decides how to render them.

## Context items — `src/lib/context/types.ts`

External study material (dafyomi.co.il, Sefaria commentary, Mishnayot…) maps into
one flat `ContextItem`. The forward-looking contract distinguishes **where a note
sits** from **what it cites**:

```ts
interface ContextItem {
  source; sourceLabel; kind; key; title?; body?;
  segs: number[];          // legacy single-amud placement
  amud?: 'a' | 'b';
  refs?:    AnchorCoord[];  // what it CITES (e.g. "Pesachim 50a") — rendered, never placement.
                            // daf-level refs use seg = DAF_SEG (-1).
  confidence?; via?;
  // anchors?: AnchorCoord[] — WHERE it attaches (cross-amud capable). Arrives in
  //   the follow-up that fills it, together with its select.ts/placement.ts wiring.
}
```

Rendering helpers (same file): `rangeLabel(segs, amud)` (→ `[whole daf]` when
unplaced), `citesLabel(refs)`, `coordLabel(c)` (daf-level when `seg < 0`).

## Placement = pieces on other spines + links

There is no separate "context" concept: a study-aid is **pieces on its own
spine**, and "grounding" is **links** into the Gemara. The pipeline:

1. **Parse** the source into entries + refs.
   `src/lib/sefref/dafyomi/parse/*` — e.g. `parseRevach` sets `entry.refs` via
   `findDafRefs` (common.ts) + `resolveTractateName` (masechtos.ts).
2. **Map** to `ContextItem`s. `src/lib/context/fromDafyomi.ts`.
3. **Place** (a separate layer). Matchers return `SegMatch[]` applied via
   `applyMatches` (`src/lib/context/match.ts`):
   - `anchor/tosfos.ts` — Tosfos pieces by Sefaria pieceKey (deterministic).
   - `anchor/bg-term.ts` — Background terms by Hebrew whole-word overlap.
   - `anchor/ai-prompt.ts` + `src/worker/context-match.ts` — the AI placer.
4. **Assemble**. `collectContext(env, tractate, page)` in
   `src/worker/context-providers.ts` builds the live pool (LLM-free) and runs the
   deterministic matchers.
5. **Select + render** for a prompt. `src/lib/context/select.ts` —
   `contextForAnchor(items, targetSegs)` then `formatContextForPrompt(items)` →
   `{{context}}`.

**Layering rule (important):** parsing/refs must NOT depend on placement; a placer
takes the spine's sections in and returns anchors out; consumers choose anchored
vs unplaced vs whole-daf. **Precision over recall** — a wrong anchor is worse than
"whole daf"; leave unplaced when unsure.

## Producers, caching, freshness — `src/worker`

- A **producer** (a mark/enrichment in `code-marks.ts`) is a pipeline: gather
  inputs → rule and/or AI → checks (`src/lib/check/postcheck.ts`). One run can
  emit many pieces.
- **Cache keys** (`cache-keys.ts`): `mark:<id>:<ver>…`, `enrich:<id>:<ver>…`,
  source caches like `dafyomi:v5:<daf>`. No TTL.
- **Invalidation today** is a manual `cache_version` bump per producer.
  *Forward direction:* a content hash (recipe + input hashes) makes staleness
  automatic, with a reverse-dependency index for "what to re-warm." Stale = a
  *candidate* for recompute, never a silent overwrite of a human correction.

## Worked example — un-flattening *Revach l'Daf* (PR1)

*Revach l'Daf* is English summary prose that covers a whole daf and cites other
dapim ("Pesachim 50a"). Before: every entry was fed to the LLM as `[whole daf]`
and its citations were dropped. PR1:

- `parseRevach` → `findDafRefs` captures `entry.refs` (resolved `{tractate, page}`).
- `fromDafyomi` carries them onto `ContextItem.refs` as `AnchorCoord`s.
- `formatContextForPrompt` renders `… (cites Pesachim 50a)`.
- `dafyomi:v4 → v5` so entries re-parse with refs (re-parse only, no LLM).

This is the first real **stand-off link with a true span**: a note carrying a
genuine cross-spine coordinate. PR2 adds the **anchor** (placement) by aligning
Revach entries to the daf's argument sections — conservatively, leaving unplaced
when the match isn't strong.

## Toward an SDK

The reusable core is spine-agnostic: `AnchorCoord`/`AnchorSpan` (coordinates),
`ContextItem` with `anchors`/`refs` (the note contract), the `SegMatch`/
`applyMatches` placement sink, and `placementLabel`/`citesLabel` rendering. A new
source = a parser + a `from<Source>` mapper + an optional placer — no engine
changes.
