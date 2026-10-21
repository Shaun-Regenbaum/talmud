# Keep new source readings in two separate databases

New source readings go to one of two D1 databases instead of the graph:

- `talmud-source-readings-bavli` holds readings of the Bavli.
- `talmud-source-readings-other` holds readings of the Yerushalmi, Mishnah, Tosefta, midrash and the
  minor tractates.

Both use the graph's existing schema, migrations `0001`–`0003` in
`packages/talmud/migrations-sage-graph`. Their rows are the compact `source-reading-store-v2` rows
described in `source-reading-store.md`. The legacy graph keeps the readings it already has and does not
change. The full bundles stay in the private R2 bucket at the same keys,
`source-readings/v1/artifacts/<sha256>.json`.

`source_reading_stores.py` holds the routing, the import checks and the read-back check.

## Which database a reading goes to

Every source of a job names its corpus in `provenance.corpus`. All sources of one job must name the same
corpus, and that corpus picks the store. A job that mixes corpora, or names a corpus not listed in
`STORES`, is refused. In the full queue, 16,173 jobs go to Bavli and 9,433 to other texts. No job mixes
corpora.

The ownership manifest must match the store. Bavli readings need the `full-bavli-tiles v1` manifest, and
other readings need the `full-other-texts-tiles v3` manifest. Their reviewed hashes are pinned in
`STORES`, the same hashes the source-binding release used. A store import always records ownership, so
a reading never falls back to focal-only publication. A job that the manifest does not cover is held,
with its reason, in `held.json`.

## How a data release works

No app deploy is needed for a data release. The app reads the newest verified revision of each store.

1. **Split the capture.** `source_reading_stores.py route --capture C --output DIR` writes one capture
   per store and a routing receipt.
2. **Build the changes.** For each store, run `prepare` with that store's capture, a verified local copy
   of the store, a verified local copy of the legacy graph, and the pinned ownership manifest.
   - It rebuilds every v1 row with the unchanged importer and compacts it.
   - It refuses anything that does not rebuild exactly.
   - It refuses any reading the legacy graph already holds.
   - The parent must be the store's newest verified revision.
3. **Prepare the revision.** Run `extend_d1.py EXPORT MANIFEST changes.json OUT --shared-records` with
   the store's verified export.
   - It repeats the whole rebuild from the frozen inputs.
   - It writes `import.sql`, `manifest.json` and `activate.sql`.
   - Store revision IDs look like `source-readings-bavli-<20 hex>`.
   - The two SQL files guard themselves. `import.sql` stops unless it runs in its own store, on top of
     its parent, while that parent is still the newest verified revision. `activate.sql` stops unless
     the parent is still the newest verified revision. So two releases built on one parent cannot
     both become current, and releases cannot be activated out of order.
4. **Upload the R2 artifacts** to their keys, download them again, and keep the receipt. This step is
   unchanged.
5. **Import into the staging store** and leave the revision `loading`. Export the store, then run
   `verify --export ... --manifest ... --artifacts DOWNLOADED_DIR --ownership MANIFEST SHA256
   --parent-receipt PARENT_RECEIPT`. Keep its receipt for the next release.
   - **New passages.** It hashes each downloaded file's bytes before reading it. Then it rebuilds each
     passage from the file and compares it with the importer.
   - **Passages from the parent.** They must be the parent's exact record versions. The parent's
     receipt covers them, so only this release's artifacts are needed. The first release on an empty
     store needs no parent receipt.
6. **Activate in staging**, then check pages and person cards.
7. **Repeat steps 5 and 6 in production.**

The importer refuses to mix the two kinds of data. Graph changes cannot go into a store. Compact rows
cannot go into the graph. A store revision can only extend a revision of the same store.

## How the app reads the stores

- **Bindings.** The bindings are `SOURCE_READINGS_BAVLI_DB` and `SOURCE_READINGS_OTHER_DB`. They do not
  change between releases.
- **The graph never serves a store revision.** Every graph revision lookup skips revisions named
  `source-readings-...`, and any revision whose manifest names a store.
- **One revision per request.** Each request picks one verified revision for each store. Every read in
  that request uses it. By default it picks the newest verified revision. A request can name one
  instead with `bavliRevision` or `otherRevision`. A named revision must exist exactly, or the answer
  is 404.
- **Revision IDs in responses.** `/initial` and `/person?id=reading:...` return `sourceRevisions`, the
  revision used for each store. A client can send these back to read the same data again. The graph
  revision is still `revision`.
- **Cards read the page's revisions.** The reader sends the page's `revision` and `sourceRevisions` with
  every person card it opens, and with every link inside a card, as `revision`, `bavliRevision` and
  `otherRevision`. `none` means the page read no revision of that store, so the card skips it too. A
  named revision that is not there is an error. The card shows it and never asks again without the
  revision. A card link with only some of the three, or an empty one, is refused, not read as
  unpinned. An empty `revision=` is a 404, not the newest graph revision.
  `packages/talmud/src/lib/sage-graph/reading-pins.ts` holds this.
- **Several readings of the same words are shown once.** Two occurrences from different readings join
  only when the source words show they are the same name. That means the same span, or one quote is
  the other with one attached prefix letter, like ורבי יוחנן and רבי יוחנן. The letters are the same as
  the reviewed prefix amendment, `anchor_repair_v2.PREFIXES`. Overlap alone never joins anything. So a
  father-only quote in one reading and the son's full name in another stay apart, even when neither
  reading has both. One reading's own occurrences never join either. A joined occurrence keeps every
  reading's proposal and shows the shorter quote.
- **Overlapping readings are not linked.** An occurrence that overlaps another reading's occurrence
  without joining is marked `overlapsOtherReading`. For example, an older reading quotes "אמר רב"
  where a newer one quotes "רב". Both are listed, and neither is linked on the page.
- **Nothing is chosen between readings.** A joined occurrence with people from two readings is never
  linked either. Each person card shows and counts only its own reading's relationships, so a second
  reading of a job never doubles a count.
- **The graph copy wins.** If a passage is in both the graph and a store, the app uses the graph copy.
  The graph holds older readings and every human correction. Reviewed people at the same words still
  come from the graph.
- **A reading held by two stores** gives a 503.
- **No binding or an empty store.** The app shows graph readings only, as it does today.
- **A store that cannot be read** is named in `unavailableSourceStores`, and all its readings are left
  out. This applies to any of its reads in that request, not only the first. The page still shows the
  graph readings. A person card that may live in that store returns 503. If the client named that
  store's revision, the page returns 503 too.
- **The graph check is the same in both places.** If the graph holds `source_reading:<id>` at all,
  neither the page nor the card reads that reading from a store.
- **The decoder.** `packages/talmud/src/lib/sage-graph/source-reading-store.ts` rebuilds the v1 rows from
  D1 alone. It checks every stored payload hash first. Two things stay in R2 only:
  - segment provenance other than `segment_id`, `focal` and `piece`
  - the queue manifest. Its hash stays as `inputProof.manifestSha256`.

  `source_reading_store.reader_view` defines the same result in Python. Person, claim and ownership
  rows come back byte for byte, with their v1 payload hashes. A stored row must already be in canonical
  form, or it is refused. Reading it in JavaScript would otherwise change numbers like `1.0`.

## Limits

- **"The graph copy wins" works per reading.** A new reading of a job the graph already read is a
  different reading. It is kept as its own proposal, and its occurrences are shown with the graph
  reading's, once.
- **No undo.** A verified revision cannot be switched off. To undo a release, publish a new revision.
  This is the same as for the graph.
- **Split pieces.** No captured reading covers a split piece yet. The occurrence key for a piece is
  checked only on a real captured piece, with its text cut short in the test file.

## Mistakes the SQL cannot catch

- **The wrong empty database.** Bavli genesis on the empty `-other` database runs cleanly. Check the
  database name before running genesis. The app then refuses that store, because its revision names the
  wrong store, and lists it as unavailable.
- **A graph release run on a store database.** Readers stay safe, because the app ignores graph
  revisions in a store. But later store releases are blocked until the database is restored.
- **A failed import.** It can leave an unfinished `loading` revision behind. Running the same import
  again is then refused until that revision is removed by hand.
- **Test the guards on staging once.** They rely on D1 stopping a script at its first error, which
  could not be tested locally. Before the first production release, run one refused import and one
  refused activation against the staging store. Then export it and confirm nothing was written.

In responses, `sourceRevisions` names the revision that was picked for each store. A store that failed
while its revision was being picked shows `null`. A store that failed on a later read keeps its revision
name. In both cases the store is listed in `unavailableSourceStores`.

## One-time setup

Done on 2026-10-21, with root's approval:

1. **The four databases are created, empty, in the PropheX account.** That is the account that
   `release.yml` deploys to. Each sits in the region of its graph database.

   | database | id | region |
   |---|---|---|
   | `talmud-source-readings-bavli` | `3f2c1fb6-ce55-4893-93f6-1536a87632f6` | WEUR |
   | `talmud-source-readings-other` | `7f3f6285-61e3-443b-8bc7-5371066ef435` | WEUR |
   | `talmud-source-readings-bavli-staging` | `d3f2040c-606c-449c-834a-1ab931907b40` | EEUR |
   | `talmud-source-readings-other-staging` | `57b0591f-4bf2-408f-a932-e118a0770a46` | EEUR |

2. **The bindings `SOURCE_READINGS_BAVLI_DB` and `SOURCE_READINGS_OTHER_DB` are in
   `packages/talmud/wrangler.toml`,** for production and staging. They use the graph's migrations
   directory.
3. **`release.yml` applies migrations 0001–0003 to them**, before each deploy, next to the graph's.

Still to do, each needing its own approval:

4. **Merge the PR.** The release then creates the schema and deploys the bindings. Until then, nothing
   reads the stores.
5. **On staging only, import and activate each store's empty first revision**:
   `source_reading_stores.py genesis --store S`. Then run one refused import and one refused
   activation, export the store, and confirm nothing was written.
6. **Do the same in production.** Then import data releases one at a time, each exactly approved.
