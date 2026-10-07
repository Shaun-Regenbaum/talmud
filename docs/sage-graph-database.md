# The sage graph is stored in Cloudflare D1

Production uses `talmud-sage-graph`. Staging uses `talmud-sage-graph-staging`.
The reader binds its own database as `SAGE_GRAPH_DB`. These are separate from billing.

The database keeps source passages, passage-local people, classified claims,
identity proposals, accepted identity decisions, and human corrections. A stored
record is not automatically a confirmed historical connection. Its decision and
authority remain in the row and original JSON.

Human corrections are separate records. They take precedence over the original
claims they name. An exclusion removes only its named claims, not every
connection between the people. An unresolved person keeps a passage-local ID.
A generation label from the existing registry is not new chronological evidence.

## Read the records

- `GET /api/sage-graph` returns the latest verified import and counts by kind.
- `GET /api/sage-graph/records?kind=connection` returns the checked corrections.
- `GET /api/sage-graph/records?ref=Horayot%2012b%3A13` returns that passage's records.
- Filters: `kind`, `passage`, `ref`, `person`, `id`, and `decision`.
- Pagination: pass `after=nextCursor` and the returned `revision` on every next
  request. Keep that revision fixed throughout an export. `limit` is 1–50.

The API is read-only. It serves only verified imports. It does not yet replace
the reader's saved graph files or apply new name underlines. Source character
positions still need a separate check against rendered page words.

## Import and verify a new revision

`research/sage-network/storage/prepare_d1.py` checks the source hashes and exact
claim coverage, builds SQL, and checks a full local SQL round trip. Use its
`--help` for the five input paths. Keep data exports in the owner's results
folder, not in Git or a company research service.

Apply `migrations-sage-graph` to the chosen database. Import the prepared SQL
with `wrangler d1 execute <database> --remote --file <import.sql> --yes`.
A new revision starts as `loading`. The public API cannot read it yet.

Export the remote database with `wrangler d1 export <database> --remote
--output <readback.sql>`. Run `verify_d1.py <readback.sql> <manifest.json>
--receipt <receipt.json>`. It compares every payload hash, every indexed field,
the record count, and the manifest. Mark that revision `verified` only after it
passes. Database triggers prevent modifying, adding, or deleting records in a
verified revision. Corrections require a new revision.

An interrupted import must be inspected before retrying. Do not replace inserts
with upserts or edit a verified revision to make a retry pass. The API deliberately
ignores incomplete imports.
