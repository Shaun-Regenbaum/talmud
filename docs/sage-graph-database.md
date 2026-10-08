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

The API is read-only. It serves only verified imports.

## Show checked connections and names

`GET /api/sage-graph/checked?person=rav-pappa` returns accepted human corrections
for one person. Use `tractate=Horayot&page=12b` instead to fetch a reader page.
Each response includes the people, source quotes, and supporting family links.
Pagination uses `after=nextCursor` with the returned `revision` fixed.

The reader, sage pages, and reader cards show these checked connections beside
the existing material. This is a small checked set, not confirmation of every
stored claim. Unresolved people keep their names and connections but do not
link to an unconfirmed registry profile.

Page responses also include accepted name occurrences. Before placing a link,
the reader compares the whole saved passage with the rendered segment. It
ignores pointing and punctuation and expands a few explicit abbreviations.
Different words, conflicting identities, or a span across separate elements
prevent placement. Accepted links replace older guesses on the same words.
The generation color comes from the matched registry person.

Pages with more than 100 accepted occurrences return no occurrence links and
set `occurrencesTruncated`. Connection results remain paginated separately.

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

## Keep same-name people separate within a passage

A checked name can point to a `local:<passage>/<person>` record when the passage
clearly identifies a participant but the registry match remains unsettled.
`GET /api/sage-graph/person?id=<local-id>` returns a source card only for a graph
node with a reviewed `sourceProfile` and a quotation present in its saved passage.
The card keeps the exact source, local identity, and checked connections together.
It does not borrow a biography or generation from a similarly named registry entry.

`source_identity` records accept passage-local distinctions without claiming a
historical registry match. Source-reviewed supported connections are served beside
user corrections. A new review must preserve prior human corrections and keep
contradictory proposals out of the checked connection set.

The first source cards distinguish the two Huna participants in Ketubot 61a:2,
the two Kahana participants in Menachot 66b:11, and the Parta grandfather and grandson
in Jerusalem Talmud Ketubot 11:6:5. The latter is a family connection, not an encounter.
The Jerusalem passage has source cards but is outside the Bavli reader.

## Extend reviewed records without replacing the original readings

`research/sage-network/storage/extend_d1.py <export.sql> <parent-manifest.json>
<changes.json> <output-directory>` prepares a new revision from a verified parent.
It verifies the full export first. Replacements name the previous payload hash;
human corrections, original passages, and registry records cannot be replaced.
The importer checks passage membership, name spans, quotes, and indexed fields,
then compares a local SQL round trip. Different existing output files are refused.
Use the same remote export, verification, and activation steps described above.

A source profile may carry a reviewed century with a citation, or place evidence
with its passage and exact quote. A century is an approximate period, not a
lifespan. Registry generations remain separately identified as registry data.
`resolvedTo` lets an old passage-local card retain access to connections after
its occurrence has been matched to a registry person.

Only reviewed place matches receive map coordinates. Unmapped places retain
readable source evidence. The source cards do not draw travel lines from the
order of passages or turn a requested journey into a completed one.
