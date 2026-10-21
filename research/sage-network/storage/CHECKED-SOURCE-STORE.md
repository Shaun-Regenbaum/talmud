# Checked source readings in the source-reading stores

`checked_source_store.py` stores root-approved checked readings, made by `checked_source.validate.check`,
in the Bavli and other-text stores. Their format is `checked-source-store-v1`. The compact v2 rows, their
decoder and the v1 importer do not change.

## A store must be upgraded first

A store created by `genesis` uses store contract 1. Its manifest names one record format, and a
checked batch is refused there. One explicit revision moves it to contract 2: `source_reading_stores.py
upgrade --parent-manifest M --output changes.json`, then `extend_d1`. That revision adds and changes no
record. A contract 2 store block lists `recordFormats: [source-reading-store-v2, checked-source-store-v1]`
with `importVersion: source-reading-stores-v2`.

## Who decides what is stored

Root's release selection decides. A selection file such as `first-checked-release-selection-v1` lists
every case: job, plan, approval and artifact hashes, people and connection counts, the bundle file's
hash, and the hash of the root approval file that approves it.

- **The selection's hash is the one outside pin.** The caller passes it separately, through
  `extend_d1 --checked-selection SHA256` or `prepare-checked --checked-selection FILE SHA256`.
- **Everything else is checked through that pin.** Each approval file must have the hash the
  selection names. It must approve the case itself: a single approval with the same three hashes, or a
  batch approval that lists the job once with the same three hashes.
- **The plan and approval hashes given to `check` come only from there.** They are never read from the
  bundle's own `plan` or `approval`, so a bundle cannot approve itself.
- **Each store takes its own share of one selection.** The batch carries the whole selection and every
  bundle, and all of them are hash-checked. Rows are built only for the readings whose corpus routes to
  that store. A store with none of the selection's readings is refused.
- **At most one checked version of a raw queue result is stored.** A second one is refused. Replacing
  a version will need an explicit supersession, which this first format does not have.
- **A store keeps each reading's original selection.** A later batch can add another independently
  pinned selection without changing earlier rows. Read-back requires every stored selection and its
  approval files, including the parent's selections. Repeat `--checked-selection FILE SHA256` for each.
  A stored selection hash never supplies its own authority, and an artifact cannot move between selections.
- **The legacy graph check uses the newest graph only.** `prepare-checked` refuses a legacy graph copy
  that is not its newest verified revision, because an older copy could predate a human correction. It
  refuses any record ID the graph already holds. It also refuses any bundle whose exact raw queue result
  already has a reading in the graph, matched by `resultSha256`. The release uses the current graph
  export and the exact `prepare-checked` output.

## The rows of one checked reading

Every row has `authority: screening` and `decision: needs_review`, and its data has
`format: checked-source-store-v1`. The reading ID is `cs1-<artifactHash>`.

| kind | record ID | holds |
|---|---|---|
| `checked_reading` | `checked_reading:<id>` | The envelope. It holds the binding chain, from the raw result and original answer to the derived v2 answer and recipe. It also holds the plan, approval, selection, approval-file and bundle-file hashes, the review hashes, `originalStatus`, `wholeReadingFullyChecked`, `supersedes` (the raw result's hashes), and every source segment with its bound text hash. `contains` lists every other row ID of the reading, so a reader can tell when one is missing. |
| `checked_person` | `checked_person:<id>/<personId>` | One retained or added person, with every field the adapter returns. Mentions are typed `printed_name`, `actor_description` or `referential_evidence`, with exact spans and segment offsets. Only `printed_name` may become a link. It also holds the item's decision. |
| `checked_connection` | `checked_connection:<id>/<connectionId>` | One pair. Its broad type, direction, predicate and outcome are each `supported` or held, with evidence spans and the decision. The `subject_id` and `object_id` index columns follow a supported direction. For a held or symmetric one, they are the participants in sorted order, for indexing only. |
| `checked_decision` | `checked_decision:<id>/<decisionId>` | A held or rejected item, kept on record as an explicit omission. |
| `checked_coverage` | `checked_coverage:<id>` | Per supplied source, `reviewed`, `partial` or `unreviewed`, with its holes. |
| `checked_unit`, `checked_ownership` | `checked_unit:<id>/<unitKey>`, `checked_ownership:<id>` | Publication ownership from the pinned manifest. The data is the same as the compact store's ownership rows. |

No historical identity is accepted. The person IDs are local to the reading.

## The private R2 object

The R2 object is the bundle file itself, its exact bytes, at
`source-readings/checked-v1/artifacts/<bundleFileSha256>.json`. It carries the original queue result's
exact bytes, so the raw v4 answer and the derived v2 answer stay as saved, and the binding pins their
hashes. The read-back hashes the downloaded bytes and rebuilds every row from them with root's
selection, then requires an exact match.

## The first release, rehearsed locally

Root's first selection has 57 readings: 45 Bavli and 12 from other texts. The rehearsal on 2026-10-21
went genesis, then upgrade, then the checked batch, then a full read-back, all on local files. The two
stores held 57 readings, 202 people and 102 connections, which equals root's totals. Each store refused
the batch without the separately given selection pin. The real rows of five readings are in
`packages/talmud/tests/fixtures/checked-source-store.json` for the app's tests.
