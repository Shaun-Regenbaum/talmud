# Sources — the context pool, and how to add one

> Path note: `src/...` paths below are relative to `packages/talmud`. The
> generic context model (`ContextItem`, the matcher contract, `select.ts`)
> moved to `@corpus/core/context/*` in the four-primitive consolidation — see
> `docs/framework.md` for the model; this doc stays the operational recipe.

A **source** is anything external we pull in to build a daf and feed its smart
notes: Sefaria commentary, Mishnayot, Rishonim, halachic codifications, topic
tags, and the dafyomi.co.il study aids. Every source maps into the one flat
`ContextItem` model (`@corpus/core/context/types`) — `{ source, sourceLabel, segs,
… }` — and lands in the shared **context pool** assembled by `collectContext`
(`src/worker/context-providers.ts`). The pool is what the alignment workbench
renders and what enrichments draw from (via `contextForAnchor` /
`formatContextForPrompt` in `@corpus/core/context/select`).

## The registry is the source of truth

`src/lib/context/sources.ts` declares **one entry per source** as an exhaustive
`Record<ContextSource, SourceMeta>`:

```ts
'sefaria-rashi': {
  label: 'Rashi', origin: 'sefaria', anchor: 'pieceKeys', defaultLevel: 'segment',
  notes: 'Rashi commentary text, one item per piece, placed on its segment via pieceKeys.',
},
```

Because the type is `Record<ContextSource, …>`, **TypeScript will not compile if
a source is missing an entry or an entry names a source that isn't in the
union.** That is the coverage guarantee: a source can't reach the pool — and
thus the alignment workbench — unregistered. `tests/context-sources.test.ts`
adds the runtime belt-and-suspenders (the declared set doesn't drift; every
mapper emits only registered sources with the registry label).

The alignment workbench (`#align`) shows a live **registry coverage** strip —
`N declared · N present on this daf · absent: …` — so an unwired or empty source
is visible, never silently missing.

## How to add a source

1. **Fetch it (cached).** Add a `getXCached(...)` wrapper in
   `src/worker/source-cache.ts` and its key in `src/worker/cache-keys.ts`
   (`keyForX`, byte-exact `tractate:page` — never a slug; see the locked
   `tests/source-cache-keys.test.ts`). Thread the optional `CacheTrack` if you
   want the alignment "collect" waterfall to report its cache hit/miss.

2. **Map it to `ContextItem`s.** Add a `fromX(...)` pure mapper in
   `src/lib/context/fromSefaria.ts` or `fromDafyomi.ts`. Pull the label from the
   registry (`sourceLabel(source)`) so it's single-sourced. Set `segs` when the
   bundle already knows the anchor; otherwise leave `segs: []` (optionally with
   an `amud`) for a matcher / the AI placer to fill.

3. **Register it.** Add the `ContextSource` union member and its `SOURCE_META`
   entry, both in `src/lib/context/sources.ts`.
   (Skipping either fails `pnpm typecheck`.) Update the count in
   `tests/context-sources.test.ts`.

4. **Wire it into the pool.** Add a `rec('x', ['source-id'], (track) => getXCached(...))`
   call to the `Promise.all` in `collectContext`, and push `...fromX(result)`
   into `items`. `rec` records the per-fetcher collect timing for the waterfall.

5. **(Optional) Anchor it.** If you can place it deterministically, add a matcher
   under `src/lib/context/anchor/` and call it in `collectContext` (like
   `matchTosfos` / `matchBackgroundTerms`). Precision over recall — a wrong
   anchor is worse than leaving it daf-level for the AI placer.

That's it. `pnpm typecheck && pnpm test` enforces that the union, the registry,
and the mappers all agree, and the alignment coverage strip confirms the new
source actually shows up on a real daf.

## Anchor strategies (`SourceMeta.anchor`)

Mirror the `via` strings the matchers write:

| strategy | placed by | level |
|---|---|---|
| `pieceKeys` | parallel Sefaria "S:P" piece segmentation | segment |
| `sefaria-link` | Sefaria's own link to the daf segment(s) | segment |
| `mishnah` | Mishnah anchor range | segment |
| `tosfos-dh` | dibur-hamaschil → Sefaria tosafot pieceKey | segment |
| `bg-term` | background term quoted in a segment | segment |
| `yerushalmi-text` | verbatim phrase shared with a Bavli segment | segment |
| `section` | conservative English↔English section alignment (Revach) | daf |
| `reference` | daf-level by nature (cross-refs, topic tags) | daf |
| `ai` | the AI semantic placer | varies |
| `none` | unplaced until the AI placer runs | — |
