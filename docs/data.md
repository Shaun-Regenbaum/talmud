# The data: what ships, what is cached, and how to fix it

There are three kinds of data. Some ships in the repository. Most of what the reader shows is generated and lives in a cache that is not in the repository. Both can be corrected, by different paths.

## What ships in the repository

| Path | What it is | Where it came from |
| --- | --- | --- |
| `packages/talmud/src/lib/data/rabbi-places.json` (1.2 MB) | The sage registry: 1,334 rabbis, 6,084 name aliases, each with a place and a region | Built by `packages/talmud/scripts/build-rabbi-places.py` from Sefaria's topic API (`type=person`) |
| `rabbi-hierarchy.json`, `rabbi-family.json`, `rabbi-orientation.json` (same directory) | Teacher and student links, family links, and each sage's orientation | Built by the `build-rabbi-*` scripts from the app's own admin endpoints |
| `curated-yerushalmi-parallels.json` | A handful of hand-checked Bavli to Yerushalmi parallels | A Sefaria sheet collection, CC-BY |
| `packages/talmud/static/dafyomi/` | One daf of study material from Kollel Iyun HaDaf, with a NOTICE | dafyomi.co.il; the rest is fetched at runtime and cached |
| `packages/talmud/src/lib/terms/registry.ts` and `hebrewTerms.ts` | The bilingual terms registry: Hebrew identity, transliteration, English, gloss | Hand-written |
| `packages/talmud/src/lib/typing/` | Section typing profiles and the statement spine | Code, hand-written |
| `packages/tanach/src/worker/gazetteer.ts` | Place names with coordinates for the maps | Built by `packages/tanach/scripts/build-gazetteer.mjs` |
| `packages/talmud/tests/fixtures/` | Captured real inputs and outputs: golden anchors, output schemas, one daf of study aids, the rabbi identity benchmark (`rabbi-pin-bench.json`) | Captured from production or from the sources, with provenance in each file |
| `research/pilot-v1/` | 24 pages of Hebrew source text for the accuracy comparison in `docs/research-plan.md`, with hashes | Sefaria, William Davidson Edition, CC-BY-NC, per-record URL and capture time |

Rebuilding: the data scripts are exposed as package scripts, for example `pnpm --filter talmud rebuild-rabbi-places` and `pnpm --filter talmud build-rabbi-hierarchy`. Read the script header before running one; several need a running worker or a scraping cache.

## What lives in the cache

Every generated note (background, argument maps, halacha, sage identities, places, verses, parallels, questions, translations) lives in a Cloudflare KV namespace, one per app. It is not in the repository and is not exported as a dump. It is reachable through the public read API, which is how the reader itself gets it and how the MCP server exposes it.

The key grammar is in `packages/core/src/cache/keys.ts` and is frozen. Each entry carries provenance: the producer, the recipe hash, the input content hashes, the model, and the cost.

## Reading the data as a researcher

All read endpoints are public and need no key.

- One daf, everything cached: `GET https://talmud.dev/api/daf-view/Berakhot/2a`
- The segmented text: `GET /api/daf/Berakhot/2a`
- The daf's links to other dapim: `GET /api/links/Berakhot/2a`
- Coverage across a tractate (which notes exist on which daf): `GET /api/spine-coverage/Berakhot`
- The sage registry: `GET /api/sages-index`, then `GET /api/rabbi/:slug` and `GET /api/rabbi-observations/:slug`
- The producer registry as deployed: `GET /api/marks` and `GET /api/enrichments`
- Freshness: `GET /api/stale/:id/:t/:p` and `GET /api/dependents/:id`

For bulk work, walk `spine-coverage` per tractate and then `daf-view` per daf. Please pace requests; the site runs on a small budget. Notes that do not exist yet are reported as cold, not generated on your behalf, unless you ask with `?generate=1`.

## Correcting data

Human corrections outrank everything the machine produces. Today there are two ways to make one.

**Report it.** Open an issue with the "Wrong or misplaced note" template. Give the tractate and page, which note, what is wrong, and a source that shows the right answer. A report with a checkable source is fixed fastest. Reports without one get the `needs source` label.

**Fix it in the repository.** For the data that ships here, open a pull request that edits the file and cites the source in the description. Good candidates: a sage's place or generation in `rabbi-places.json`, a missing alias, a wrong coordinate in the gazetteer, a term in the terms registry, a curated parallel.

For the generated notes, the fix is usually to a producer's prompt, schema, or placement rule, followed by a regeneration of the affected pages. That is a normal code change; see `docs/framework.md` for how producers are declared and `code-style.md` for the cache-key rule.

What does not exist yet: a way to write a human correction directly into the cache. The store already refuses to overwrite an entry marked as human-authored (`packages/core/src/store/artifact-store.ts`), but nothing writes such entries. Building that path is on the [roadmap](roadmap.md).

## Licenses of the sources

- **Sefaria** texts and links: each text carries its own license from Sefaria (public domain, CC-BY, or CC-BY-NC, depending on the edition). The research snapshots are William Davidson Edition, CC-BY-NC.
- **HebrewBooks**: used for the printed-page typography reference.
- **Kollel Iyun HaDaf** (dafyomi.co.il): copyright theirs. The material is used as a study source with attribution and links back, not redistributed as a copy. The NOTICE next to the shipped daf has the terms.
- **daf-renderer**: MIT, by Dan Jutan and Shaun Regenbaum.
- **The code in this repository**: MIT (see `LICENSE`).

## What not to do

- Do not scrape dafyomi.co.il faster than its `robots.txt` allows (`Crawl-delay: 30`), and do not commit the scraped HTML. `scripts/.cache` is gitignored for that reason.
- Do not redistribute Kollel Iyun HaDaf content as a standalone set.
- Do not add generated notes to the repository as fixtures unless they are real captured output with provenance.
- Do not invent a sage, a place, or an alias to make a test pass.
