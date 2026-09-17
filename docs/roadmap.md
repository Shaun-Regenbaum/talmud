# Roadmap and open work

This is where the project is going and what is open right now. The first list is the direction. The second is work a newcomer can pick up today, each with the files to start from. Open an issue before starting anything large, so nobody duplicates it.

## Direction

The engine has landed: four primitives (spine, anchor, artifact, producer) in `packages/core`, one runtime for both readers, provenance on every cached note, and a store that refuses to overwrite a human correction. What remains is finishing the paths that use it.

1. **A way for people to correct notes.** The store guard exists (`packages/core/src/store/artifact-store.ts`), but nothing writes `authority: 'human'`. This needs an API route, a small UI on the card, and a decision about who may write. It unblocks user notes and highlights as real artifacts.
2. **Entity spines.** Sages and places are still "global" enrichments keyed by name. `SpineDef kind: 'entity'` is designed in `packages/core/src/model/spine.ts` but not instantiated. Lifting sages onto `entity:rabbi` makes the sage page a first-class spine with its own coverage.
3. **Place and era per statement.** Today a sage's place is inferred once per daf (`rabbi.location`), but a sugya spans generations and academies. The right unit is a statement anchored to a text range. This is a benchmark-gated producer change; see the open problem at the end of `CLAUDE.md`.
4. **Measured accuracy before more generation.** `docs/research-plan.md` fixes a 24-page comparison set (`research/pilot-v1`). The next step is labels and a scored comparison of the current sage resolver against one candidate, with costs.
5. **Tractate-continuous and commentary spines.** The `external` anchor precision exists in core; no spine consumes it yet. Wiring it lets a Rishon's commentary be its own spine with links back to the daf.
6. **Registry cleanup.** Delete the legacy shims that are now pure re-exports (the `studio-schema.ts` layer and dead intermediate types), move producer definitions to one `producer-defs:v1` KV namespace, make `collectContext` a producer so the context pool is a cached artifact, and let `validateEnrichment` accept `scope: 'spine'`.
7. **The generic sidebar.** Cards are being converted to a recipe (header plus an ordered list of sections). Aggadata, place, pasuk, halacha, and rabbi are done; the rest of the bespoke `*Body` components and the move of recipes into the registry remain.

## Good first issues

Each of these is scoped, has a test to write, and does not touch cache keys.

- **Typecheck the tests.** `packages/talmud/tsconfig.json` and `packages/tanach/tsconfig.json` include only `src/`. Add `tests/**/*.ts(x)` and fix what `tsc` reports. Do it one directory at a time if the batch is big.
- **Give `packages/ui` a test suite.** It has none, and no `test` script, so `pnpm -r test` skips it silently. Start with `format.ts` and `aiStatus.ts`; a Vitest config like `packages/core/vitest.config.ts` is enough.
- **Validate what comes out of KV.** Values are `JSON.parse`d and trusted in dozens of places in `packages/talmud/src/worker/index.ts`. Zod is already a dependency. Pick one read path (say `daf-view.ts`) and validate the envelope with a schema, failing soft on mismatch.
- **Code-split the client.** Vite warns that chunks are over 500 kB and there is no `lazy()` anywhere in `packages/talmud/src/client/App.tsx`. Lazy-load the pages that are not the daf (usage, sages, argument graph, how it works, about).
- **A Hebrew version of the About page.** `packages/talmud/src/client/AboutPage.tsx` is English-only by design for now. Move its strings into the `t()` catalog with Hebrew entries, and let the page follow the app language.
- **Meta and Open Graph tags for Tanach.** `packages/talmud/index.html` has a description and OG tags; `packages/tanach/index.html` has none.
- **A funding link.** The "AI paused" banner asks for help finishing Shas, but there is no `.github/FUNDING.yml`. Add one once the maintainer picks a channel.
- **Split `index.ts`.** The Talmud worker is one file of about 500 KB with about 100 routes. Move one route family (for example the `/api/usage/*` reads) into its own module with its tests, without changing any path or response.
- **Split `code-marks.ts`.** About 420 KB of producer definitions in one file. Group by family (rabbi, argument, halacha, pesukim, aggadata) into modules that the registry imports. Byte-identical recipes, so the golden key tests must still pass unchanged.
- **Content reports from the tour.** The guided tour opens real notes; add a "report this note" link on the card that pre-fills the "Wrong or misplaced note" issue template with the tractate, page, and note id.

## Known gaps that are not bugs

- Cold pages take minutes and cost money, and the site pauses generation when the budget or the prepaid balance runs out. The banner says so. This is the intended way the project controls spend.
- The local KV namespace starts empty, so a fresh checkout shows every daf cold. See `docs/local-dev.md`.
