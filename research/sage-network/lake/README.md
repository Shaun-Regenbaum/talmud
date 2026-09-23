# Read and save the sage study

The shared study uses DuckLake. Its table files live at
`s3://prophex-lake/sage_network/` in R2. Its version index uses the
`sage_network` schema in the existing Prophex lake database. Each published
version also has an index copy in R2, so readers need no database login.

The code reuses `prophex-research-app/pipelines/lake`. It adds this study's
tables and checks. It does not change the other Prophex lakes.

Snapshot 1 was published and read back on 22 September 2026. All 13 tables
matched the checked release. It is registered in DSS as
`talmud/sage-network-lake`, catalogue version 2, which points to lake snapshot
1. The catalogue version changed to correct the index pointer; the data still
has one published snapshot. [release.json](release.json) records these addresses.

## Snapshot 2 adds the passage pilot

Snapshot 2 adds 42 passage readings, 602 proposed claims, 25 alternative groups,
four evidence packs and four narrow decisions. The 13 original tables are
unchanged. All 23 tables matched a separate R2 read against the checked release.
DSS catalogue version 3 points to snapshot 2. The original release record stays
fixed; [release-pilot.json](release-pilot.json) pins the new one.

Twelve episodes have a missed review check or major finding. Twenty-three ask
for more context. These are provisional readings, not approved historical edges.
The frozen run includes 156 files with sources, raw readings, exact spans,
independent reviews, report data and reproduction code.

```sh
python research/sage-network/lake/manage.py pull --snapshot 2 --database /tmp/sage-pilot.duckdb
python research/sage-network/lake/restore_pilot.py \
  --database /tmp/sage-pilot.duckdb \
  --run-id ec8ede8d0d6428f9a7b4d67dc39d5c1a1b635e5d9140882cb8f4ca79baaccf9f \
  --out /tmp/sage-pilot-files
open /tmp/sage-pilot-files/report.html
```

The current project requirements add the pinned JSON Schema validator. The
shared writer host keeps this release's code at
`/work/sage-network/pilot-v1/lake/` and its validation dependency directory at
`/work/sage-network/pilot-v1/deps`. The container uses
`PYTHONPATH=/work/sage-network/pilot-v1/deps`. Use the same shared write lock
`/work/sage-network/publish.lock`. The older top-level writer files remain as the
snapshot 1 implementation; use the new code when handling the pilot tables.

## Snapshot 3 adds the close source reading

Snapshot 3 adds 38 passages read closely against their wider text,
translations, commentaries and some manuscript photos. They hold 572 proposed
findings, 1,278 saved sources and 2,231 quotations checked against those sources.
Separate readers reviewed 37 of them and asked for changes on 28. The 23 earlier
tables are unchanged. All 29 tables matched a separate R2 read against the
checked release. DSS catalogue version 4 points to snapshot 3, and
[release-followup.json](release-followup.json) pins it.

The six new `research_*` tables store one run under contract
`source-investigation-v1`. `research_files` holds every file of the run: each
dossier, reading, saved source, review and record of a mechanical fix. The other
five tables index those files. A publish rebuilds the index from the files and
refuses any difference. The frozen checker is
[validators/source_investigation_v1.py](validators/source_investigation_v1.py).
Its hash is pinned in `followup_store.CONTRACTS`, so an edited checker fails
before a release.

```sh
python research/sage-network/lake/manage.py pull --snapshot 3 --database /tmp/sage-study.duckdb
python research/sage-network/lake/restore_followup.py \
  --database /tmp/sage-study.duckdb \
  --run-id baa36a16d6e114427aef56cf69f1a258584487ba161e8ec88586019636c641ac \
  --out /tmp/sage-followup
python research/sage-network/lake/check_restored_followup.py /tmp/sage-followup
open /tmp/sage-followup/report.html
```

`check_followup.py BASE RELEASE` runs 25 damage and round-trip checks on
copies of a release before publishing. The shared writer host keeps this
release's code at `/work/sage-network/followup-v1-release/lake/` and uses the
pilot's dependency directory, `/work/sage-network/pilot-v1/deps`.

These are proposals. No review approves a person merge, a date or a graph
edge.

## What the first import keeps

| Table | Contents |
|---|---|
| `source_units` | Original source JSON, edition, address and hash |
| `source_segments` | Each passage, its exact text and its source unit |
| `legacy_pairs` | The 57,857 final pair labels from the earlier reader |
| `legacy_first_pass` | The earlier scores for those same pairs |
| `legacy_readings` | The 36,372 saved second-pass readings |
| `review_documents` | Full review files, including the earlier examples and independent checks |
| `review_cases` | The 30 additional selected cases |
| `review_sources` | Their 82 source excerpts, with original and normalized text in the saved record |
| `review_claims` | Their 139 proposed claims, including alternatives and qualifications |
| `review_claim_sources` | Matching quote spans; ambiguous matches stay labelled as candidates |
| `relation_families` | Family, Transmission, Teaching, Speech, Views, Scenes and Time |
| `ingests`, `input_files` | Which files were imported, their hashes, counts and source manifest |

The source manifest covers 19,280 units and 273,208 passages. There are 34
other raw files outside that manifest. The import lists them as excluded,
rather than silently changing which source collection the study used. The
original files stay on disk.

These are source records and proposed readings. They are not accepted person
identities or graph edges. No old pair label is automatically assigned to a
new relation family. Evidence packs and decision revisions will get their
own checked tables when that part of the pilot is built.

The review's original text, normalized text, edition and licence all remain
saved. Forty excerpts match the older source collection. The other 42 come
from a separately fetched edition. They must not be forced into the older
edition's passage records.

## Install the reader

Use Python 3.11 or newer. `requirements.txt` pins DuckDB and the shared lake
library to the version used for this import. Access to the private Prophex
repository is needed to install that library.

```sh
uv venv /tmp/sage-lake-env
uv pip install --python /tmp/sage-lake-env/bin/python -r research/sage-network/lake/requirements.txt
```

The existing read-only environment is `~/.config/prophex-lake/read.env`.
Prophex's `pipelines/lake/scripts/laptop-env.sh` creates it when needed.
It reads the credentials from the existing configured service. Do not put
credentials in this repository.

```sh
set -a
. ~/.config/prophex-lake/read.env
set +a
/tmp/sage-lake-env/bin/python research/sage-network/lake/manage.py snapshots
/tmp/sage-lake-env/bin/python research/sage-network/lake/manage.py tables --snapshot 1
/tmp/sage-lake-env/bin/python research/sage-network/lake/manage.py pull --snapshot 1 --database /tmp/sage-study.duckdb
```

The pull checks every table before giving the file its final name. It restores
the declared primary keys and writes a receipt naming the lake version.

In Python, the registered name belongs to this project's configuration:

```python
import sys
import duckdb

sys.path.insert(0, "research/sage-network/lake")
from schema import LAKE
from prophex_lake import attach

con = duckdb.connect()
attach(con, LAKE, snapshot=1)
con.sql("SELECT ref, title FROM sage_network.review_cases ORDER BY ref").show()
```

Do not call the unmodified shared command with `lake pull sage_network`.
That command's built-in list does not include this project's configuration.
Use `manage.py` or pass the `LAKE` object as above.

## Import another saved run

Pull the current version first. Build from that copy so earlier readings and
corrections remain present. A changed review file creates new records linked
to its new document hash. It does not overwrite the earlier review.

```sh
python research/sage-network/lake/build.py \
  --source-root /path/to/source-data \
  --evidence-root /path/to/saved-readings \
  --base /tmp/sage-study.duckdb \
  --out /tmp/sage-study-next.duckdb
python research/sage-network/lake/check_release.py /tmp/sage-study-next.duckdb
```

`--source-root` contains `manifest.json` and `raw/`. `--evidence-root` contains
the three pair JSONL files and `checkpoint/` review documents. Both must be
complete. The importer never fetches replacement sources behind the scenes.

The import validates the source manifest, the text hashes and every saved
quote. It reconstructs the original pair files and checks their exact hashes.
It compares indexed claims and source excerpts with the full saved reviews.
Unchanged input can be imported again without making extra records.

`check_release.py` uses copies of the actual release. It checks missing rows,
wrong passage references, damaged text, changed claims and wrong quote spans.
It also checks a full local DuckLake round trip, repeat publishing, a stale
version and a competing writer. Its temporary copies are deleted afterward.

## Publish from the shared writer host

All writes go through the existing lake runner on the shared server. Use
`/work/sage-network/publish.lock` for every sage-study write. A file lock holds
the entire check, commit and index export. Do not publish from a second host
or use the generic shared push command to bypass these checks.

The writer reads the existing root-only `lake-write.env`. The Talmud code and
release file live in `/srv/prophex-research-data/lake/work/sage-network/`.

```sh
sudo LAKE_ENV=/srv/prophex-research-data/lake/secrets/lake-write.env \
  LAKE_ENTRY=python \
  LAKE_DOCKER_ARGS='-e SAGE_LAKE_WRITE_LOCK=/work/sage-network/publish.lock' \
  /srv/prophex-research-data/lake/bin/lake \
  /work/sage-network/manage.py push \
  --database /work/sage-network/next.duckdb \
  --expected-snapshot 1 \
  --message 'Add the next checked passage readings'
```

Replace the expected snapshot with the version actually pulled. A stale
version is refused. A release that loses or changes any existing row is
refused. Table-schema changes also need a separate migration. Index export
is retried after an unchanged push, so a failed export can be repaired
without making another data version.

The lock protects writers using this one host and path. It is not a
distributed lock. Credentials with broader access could bypass it; other
services must use this writer path before they are allowed to update the lake.

After publishing, run `manage.py verify` from a reader using the R2 index
copy. That reads every table and compares it with the checked release. Register
the exact snapshot in DSS. Keep old snapshots and original files.

This follows the existing [Prophex lake workflow](https://github.com/Phase-Zero-Labs/prophex-research-app/blob/a8b9c7b2bdb33eea2a8d7607d906c1b7fd1c517c/docs/data-platform/lake.md)
and DuckLake's separation between its [catalog and stored data](https://ducklake.select/docs/stable/duckdb/usage/connecting).
