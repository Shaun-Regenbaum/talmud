# Compact source-reading storage (`source-reading-store-v2`)

`source_reading_store.py` adds a smaller storage version for source readings. The v1 importer
(`source_readings.py`, `source-reading-import-v1`) and every reader of v1 rows are unchanged.
Nothing writes v2 rows to any database yet. The plan is a separate source-reading store, so the
legacy graph is never touched.

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
  bundle from R2. Only the dropped segment provenance is read from it, and the fields D1 kept must
  agree with it.

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

The CI tests in `tests/test_source_reading_store.py` use the captured real fixture bundles.
