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
other readings need the `full-other-texts-tiles v3` manifest. A store import always records ownership,
so a reading never falls back to focal-only publication.

## How a data release works

No app deploy is needed for a data release. The app reads the newest verified revision of each store.

1. **Split the capture.** `source_reading_stores.py route --capture C --output DIR` writes one capture
   per store and a routing receipt.
2. **Build the changes.** For each store, run `prepare` with that store's capture, a verified local copy
   of the store, a verified local copy of the legacy graph, and the pinned ownership manifest. It
   rebuilds every v1 row with the unchanged importer and compacts it. It refuses anything that does not
   rebuild exactly. It also refuses any reading the legacy graph already holds.
3. **Prepare the revision.** Run `extend_d1.py EXPORT MANIFEST changes.json OUT --shared-records` with
   the store's verified export. It repeats the whole rebuild from the frozen inputs. It writes
   `import.sql`, `manifest.json` and `activate.sql`. Store revision IDs look like
   `source-readings-bavli-<20 hex>`.
4. **Upload the R2 artifacts** to their keys, download them again, and keep the receipt. This step is
   unchanged.
5. **Import into the staging store** and leave the revision `loading`. Export the store, then run
   `verify --export ... --manifest ... --artifacts DOWNLOADED_DIR --ownership MANIFEST SHA256`.
   It rebuilds every passage from its downloaded R2 artifact and compares it with the importer. Keep its
   receipt.
6. **Activate in staging**, then check pages and person cards.
7. **Repeat steps 5 and 6 in production.**

The importer refuses to mix the two kinds of data. Graph changes cannot go into a store. Compact rows
cannot go into the graph. A store revision can only extend a revision of the same store.

## How the app reads the stores

- **Bindings.** The bindings are `SOURCE_READINGS_BAVLI_DB` and `SOURCE_READINGS_OTHER_DB`. They do not
  change between releases.
- **One revision per request.** Each request picks one verified revision for each store. Every read in
  that request uses it. By default it picks the newest verified revision. A request can name one
  instead with `bavliRevision` or `otherRevision`. A named revision must exist exactly, or the answer
  is 404.
- **Revision IDs in responses.** `/initial` and `/person?id=reading:...` return `sourceRevisions`, the
  revision used for each store. A client can send these back to read the same data again. The graph
  revision is still `revision`.
- **The graph copy wins.** If a passage is in both the graph and a store, the app uses the graph copy.
  The graph holds older readings and every human correction. Reviewed people at the same words still
  come from the graph.
- **A reading held by two stores** gives a 503.
- **No binding or an empty store.** The app shows graph readings only, as it does today.
- **A store that cannot be read** is named in `unavailableSourceStores`. The page still shows graph
  readings. A person card that may live in that store returns 503.
- **The decoder.** `packages/talmud/src/lib/sage-graph/source-reading-store.ts` rebuilds the v1 rows from
  D1 alone. It checks every stored payload hash first. Two things stay in R2 only:
  - segment provenance other than `segment_id`, `focal` and `piece`
  - the queue manifest. Its hash stays as `inputProof.manifestSha256`.

  `source_reading_store.reader_view` defines the same result in Python. Person, claim and ownership
  rows come back byte for byte, with their v1 payload hashes.

## Limits

- **Newest means most recently imported.** Activate a store's revisions in the order they were imported.
- **No undo.** A verified revision cannot be switched off. To undo a release, publish a new revision.
  This is the same as for the graph.
- **Split pieces.** No captured reading covers a split piece yet. The occurrence key for a piece is
  checked only on a real captured piece, with its text cut short in the test file.

## One-time setup, which needs the owner's approval

1. Create the four databases: Bavli and other, each in production and staging.
2. Add the two bindings to `packages/talmud/wrangler.toml`, for production and for staging.
3. Add their `wrangler d1 migrations apply` steps to `.github/workflows/release.yml`.
4. Deploy the app once. After this, releases are data only.
5. Import and activate each store's empty first revision: `source_reading_stores.py genesis --store S`.
