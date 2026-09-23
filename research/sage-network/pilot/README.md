# Read whole passages before joining people

This pilot reads 30 previously reviewed difficult cases and 12 randomly
selected passage versions. It saves source words, people, statements, actions,
relationships and alternative readings. Four evidence packs show how a saved
claim can lead to a narrow decision about the text.

Open [the visual report](report.html). Its counts come from
[report-data.json](report-data.json). The first readings are proposals. No
historical identity or date is accepted by this pilot.

## What is saved

- `inputs/`: source-only jobs, including exact text, edition, licence and hash.
- `manifest.json`: frozen selection, source hashes and challenge-case mapping.
- `reader.md`, `contract.py`, `schema.json`: the separate pilot instructions and
  record format. Production reader recipes and cache keys are unchanged.
- `outputs/`: the first saved readings. Each claim has evidence, participants,
  voice, polarity, modality, reading branch and confidence in the reading.
- `compiled/`: the same readings with exact Unicode character spans. Offsets are
  zero-based and the end is exclusive. Quote occurrence is one-based.
- `review_checks.json`: the provisional checklist prepared before extraction.
- `reviews/`, `semantic-review.json`: independent checks, including omissions,
  unsupported claims and unresolved judgments. These do not overwrite readings.
- `evidence-packs.json`: four questions, their source snapshots, candidates,
  decisions, reasons and limits. Numeric probabilities remain unassigned.
- `checks.json`: deliberate damage to copies of real records and the checks
  that rejected it. Temporary damaged copies are not research evidence.

A local person is not a global historical identity. Symmetric relations are
saved once. Their inverse display does not count as new evidence. Empty branch
lists mean shared across readings. Multiple branches of one group mean either
branch; branches of different groups mean both conditions. Nested dependencies
that cannot be stated this way need a future contract revision.

## How the passages were chosen

The input is `sage_network` lake snapshot 1, registered as DSS dataset
`talmud/sage-network-lake` version 2. The 30 challenge cases retain their 82
saved primary text segments. The 12 new focal passages were selected by sorting
a seeded SHA256 of each saved passage-version ID and taking six per Talmud.
The choice did not use name-pair matches, passage length or subject matter.
Two segments either side supply context where available. Some jobs still need
more context, and say so.

Three source-only readers received disjoint jobs. They could not see the earlier
answers or checklist. Another reader checks each output against the Hebrew and,
for the difficult cases, the provisional checklist. The random jobs were split
into six development and six validation cases before extraction. The same
unchanged first-pass instructions read both partitions; no accuracy estimate
is claimed for either tiny group.

The selected difficult cases test known failures. They do not measure ordinary
passage accuracy. Reviewer agreement is also not a substitute for human source
review. Missing commentary is not scored as an extraction failure when it was
not part of a supplied source job.

## Run the saved checks

Use Python 3.11 or newer. Create an environment and install `requirements.txt`.

```sh
uv venv /tmp/sage-passage-env
uv pip install --python /tmp/sage-passage-env/bin/python -r research/sage-network/pilot/requirements.txt
/tmp/sage-passage-env/bin/python research/sage-network/pilot/run.py
/tmp/sage-passage-env/bin/python research/sage-network/pilot/check_pilot.py
/tmp/sage-passage-env/bin/python research/sage-network/pilot/merge_reviews.py
/tmp/sage-passage-env/bin/python research/sage-network/pilot/build_packs.py
/tmp/sage-passage-env/bin/python research/sage-network/pilot/build_report.py
```

`run.py` checks existing outputs and compiles them. It does not call a paid
service by default. It refuses changed inputs, recipes, compiled records or
raw output after compilation. Successful files are written atomically. Each
job receives an explicit status, including failure; one failed job does not
discard the rest. Resume validates content, not merely file existence.
Failed external commands retain stdout, stderr and exit status in private
`attempts/` logs. Those diagnostics are excluded from Git and publication.

An optional `--reader-command-json '["/absolute/path/to/reader"]'` runs an
external reader. It receives one JSON object on stdin containing instructions,
schema and source job. It must return the extraction JSON on stdout. The
transport has a per-job wall-clock timeout, a bounded worker count and process
group cleanup. Its command must provide its own service authentication and
budget controls. No credentials belong in these files.

This run was read by parallel workers and then compiled with the same contract.
The external-command path is an adapter for future runs. Semantic results from
one transport do not certify a future service or model. To change the recipe,
start a new run directory and preserve the old outputs.

`prepare.py --database <pulled-snapshot-1.duckdb>` can recreate the inputs. It
requires the saved `ontology-review-data.json` from the preceding review.
It refuses to overwrite a frozen job with different content.

## Keep the evidence and decisions in the lake

The pilot adds ten tables: `extraction_runs`, `extraction_files`,
`extraction_sources`, `extraction_readings`, `extraction_mentions`,
`extraction_entities`, `extraction_claims`, `extraction_alternatives`,
`evidence_packs` and `decision_revisions`. Old source and review tables remain
unchanged. Full files and indexed rows are compared on every release check.
Each source occurrence also carries a `snapshot_key` made from its passage,
edition and text hash. Reusing it in another job does not create an independent
source witness. Different keys do not prove that two versions are independent.
Where an earlier review normalized vowel marks, offsets address that saved
normalized text. Its metadata also retains the original edition text. Do not
apply those offsets to the original vocalized string.

`lake/pilot_store.py` builds an additive release from a pulled base. The normal
lake publisher still rejects stale snapshots and changed or missing old rows.
Use the one shared writer and lock described in [the lake instructions](../lake/README.md).

```sh
python research/sage-network/lake/pilot_store.py \
  --base /tmp/sage-study.duckdb --out /tmp/sage-study-next.duckdb \
  --pilot-root research/sage-network/pilot
```

Every decision records its authority and predecessor. An automated decision
cannot supersede a human correction. All pilot decisions have
`historical_graph_eligible=false`. They support reading the text, not historical
person merges. A later graph must explicitly choose reviewed decisions and
retain their evidence-pack links.

## What still needs work

The first readers did not enumerate every repeated name or pronoun. Speech
content often lives in a statement label or explanatory note, rather than
having its own modality and speaker fields. Divine speakers, unnamed groups,
quotation boundaries and nested choices need clearer contracts. Review findings
remain attached to the original outputs.

Fix those issues in a new recipe, expand missing context, and run a broader
blind check before rereading the full text. Identity packs and separately
sourced biographies follow that stage. Calendar dates come after identity and
relative-time evidence are checked.
