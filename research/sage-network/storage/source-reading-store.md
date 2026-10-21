# Compact source-reading storage (`source-reading-store-v2`)

`source_reading_store.py` adds a smaller storage version for source readings. The v1 importer
(`source_readings.py`, `source-reading-import-v1`) and every reader of v1 rows are unchanged.
Nothing writes v2 rows to any database yet. They are meant for the two source-reading stores in
`SOURCE-READING-STORES.md`, so the legacy graph is never touched.

## What it does

- **`compact(rows)`** takes the exact rows that `source_readings.records` and
  `source_coverage.records` build. It keeps the same record IDs, kinds and index columns. It drops
  only what can be rebuilt exactly:
  - copies of other rows of the same passage: the passage's people and claims lists, a claim's
    participants, and the coverage record's owned units
  - fields derived from kept ones: anchor paths, occurrence keys, quotes and quote locations, the
    `named` form, constant flags, the source text split, and the occurrence key lists
  - the queue manifest, which every job of a run repeats. It is kept once, in a
    `source_reading_run` row.
  - source segment provenance that no reader uses, such as the raw file, URL, licence and capture
    time. It stays in the private R2 artifact, which holds the whole bundle.
- **`expand(rows, artifacts)`** rebuilds the exact v1 rows. `artifacts` maps each passage ID to its
  bundle from R2. Each passage must have exactly one `source_reading` row. That row names the R2
  artifact by its SHA-256, byte length, key, bucket and media type. The bundle must match all five
  before any of it is read. So a bundle with a changed URL or licence is refused, even though D1 no
  longer stores those fields. Then only the dropped segment provenance is read from it, and the
  fields D1 kept must agree with it.

- **`reader_view(rows)`** is what the app's decoder rebuilds from D1 alone, without R2. It equals the
  v1 rows, with two exceptions. Segment provenance keeps only `segment_id`, `focal` and `piece`. The
  queue manifest is replaced by its hash, `inputProof.manifestSha256`.

## What stays in D1 for readers

- source texts and their hashes
- segment IDs and pieces
- every quote with its offsets and occurrence
- people with their labels, kind, form, setting, reasons and alternatives
- the full typed relationships
- the episode
- the ownership units
- the R2 artifact pointer and its hashes

## Measured on the 93 checked 210-trial results

Measured locally, not in CI.

- **The round trip is byte-identical** for all 93 cases.
- **The payload shrinks from 33.7 KB to 9.8 KB a job.**
- **The stored size, indexes included, shrinks from 60.2 KB to 32.2 KB a job.**
- **Jobs with ownership rows shrink less: from 60.1 KB to 40.3 KB a job, or 67%.** Every store job has
  these rows. Most of the 93 did not. This was measured on the 31 trial jobs that the Bavli ownership
  manifest covers. Ownership rows are stored whole, so they do not shrink.

The CI tests in `tests/test_source_reading_store.py` use the captured real fixture bundles.
