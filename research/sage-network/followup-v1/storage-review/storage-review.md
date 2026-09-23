# Storage review: additive source-research records

2026-09-22. Full details, hashes and reproductions are in `storage-review.json`.

## Verdict

**Do not publish the trial database as is.** The core design holds:

- all 23 earlier tables are unchanged;
- every research row rebuilds exactly from saved files;
- a local publish, pull and read-back round trip passes.

Two things block publication:

1. **The validator hash pin is already broken.** `validate.py` was edited during this review. With that edit, the trial database fails validation, so it can no longer be pushed or used as a base.
2. **Two stored cases use absolute local paths.** They cannot be rebuilt or checked from any other location.

## Issues

| ID | Severity | Where | Problem |
|---|---|---|---|
| H1 | high | `followup_store.py:21-26, :40, :113-128`; `build.py:144` | `project()` hashes the live `followup-v1/validate.py` and requires it to equal the saved hash. Any edit makes every stored run fail `build.validate()`. That blocks push, pilot builds and research builds on that base. **Seen on real data:** after the edit made during this review, the trial copy is rejected with "Research validator differs from saved contract". |
| M1 | medium | `followup_store.py:89-97`; `validate.py` `check_case` | `saved_file` is an absolute worktree path for random-yerushalmi-01 (IN) and random-yerushalmi-03 (IN, EARLIER). It is accepted and stored, including the local home path. `collect()` from another location fails ("Source outside case and pilot"). A tree restored from a pulled copy fails `validate.py` for random-yerushalmi-01. |
| M2 | medium | `followup_store.py:85-87` | Case file collection follows symlinks. A test-damage symlink to a file outside the tree had its content stored. |
| M3 | medium | `followup_store.py:83` | "Finished" means `reading.md` exists. `completion.json` and its hashes are ignored, so both a stale and a missing completion record were accepted. Cases were being written during the review, for example random-bavli-05. |
| M4 | medium | `followup_store.py:58-63` | Review provenance can be dropped or widened. An unlinked `review.json` is accepted and hides "changes_required". A `{}` review skips all review checks. `status` is free text ("approved_for_graph" was accepted). `authority` is not checked, though the pilot restricts it. |
| M5 | medium | `project()` keys, `research_runs` | A later run adds full duplicate case, finding and citation rows, with no supersession or order. Scratch build: 102 finding rows for 62 distinct findings. Identical inputs are correctly idempotent. |
| L1 | low | `validate.py:130-140` (reviewed version) | A declared count or occurrence goes unchecked when the quote appears in more than one JSON string, or when no offsets are given. A false count of 999 and occurrence of 7 passed in test damage. All 40 real declarations are on the checked path, so the gap is latent. |
| L2 | low | `followup_store.py:87, 96, 103` | `read_text()` changes CRLF and fails on non-UTF-8 input. CRLF or windows-1255 sources cannot be stored, and `sha256` hashes decoded text. The current data is unaffected. |
| L3 | low | `followup_store.py:137-151` | A failed build leaves `<out>.part`, which blocks retry (reproduced). `with_suffix` lets different outputs share one `.part` name. |
| L4 | low | `validate.py:108-121, :177` | Weak type checks. Evidence given as an object crashes with AttributeError, which is uncaught. A list-valued claim passes and later fails with a misleading read-back message. |
| L5 | low | `followup_store.py:37` | An empty path is accepted, and so are paths differing only in case. The latter overwrite each other when restored on macOS. |
| L6 | low | `check_followup.py:78-85` | The restore test uses in-memory files, not stored rows. There is no restore tool for research files. Pilot sources are stored as `inputs/pilot/...` but dossiers point at `../../../pilot/...`. |
| L7 | low | `followup_store.py:104-108` | `parent_snapshot` (999 was accepted) and `input_package` are asserted, never verified against the base or the lake. |

## Suggested fixes, in order

1. **H1:** freeze validators by contract, for example `lake/validators/source_investigation_v1.py`. Put changed behaviour under a new contract. Rebuild the trial database only after the validator fixes land.
2. **M1, M2:** reject absolute or symlinked paths in both `collect()` and `check_case()`. The research owner should correct the three `saved_file` values separately; that changes dossier hashes, so the reviews need redoing.
3. **M3, M4:** require `completion.json` hashes to match, require any stored review to be linked, and use closed sets for review `status` and `authority`. Enforce all of these in `project()` so read-back checks them too.
4. **M5:** add `supersedes_run_id`, or a current-run view, or content-keyed cases linked to runs.
5. **Low items:** byte-exact reads, one convention for `.part` files, type checks, stricter path rules, a research restore tool tested from a pulled copy, and verified parent snapshots.

## What passed

- **Trial copy:** `build.validate()` passes with the reviewed code. All 23 old tables are unchanged (EXCEPT ALL in both directions).
- **`check_release.check()`** passed all 13 checks on a local temporary catalog.
- **Round trip:** publish and pull verified 29 tables. The pulled copy has primary keys and validates.
- **Builds:** a repeat build is idempotent, and a forced failure writes no output file.
- **Reviews:** all 12 current reviews match their dossier bytes and have `historical_graph_eligible=false`.
- **Case files:** no CR, no non-UTF-8 content and no symlinks. The credential-pattern search found only ordinary words.

## Limits

- **Not reviewed:** the edited `validate.py` (e1d79c95) and `check_validation.py` (dae78947) that appeared during the review.
- **Evidence gaps:**
  - Declared `ref` and `locator` fields are not compared with where the quote matched.
  - Citations do not store which match was intended.
  - Offsets in non-exact modes refer to transformed text.
  - A one-character quote counts as valid evidence.
- **No remote contact:** no remote catalog or index copy was reached. Read-back was run against a local temporary catalog.
- **Coverage:** only the three stored cases were rebuilt. Other cases changed during the review, so results describe the scratch snapshot.

## Method

- **Inputs** (SHA256, first 8 characters): base `df2a072c`, trial `4a1a62c9`, reviewed `validate.py` `d8fb4aed`, `followup_store.py` `9cc72eb4`. The full list is in the JSON.
- **Damage:** all deliberate damage was done on in-memory or disposable scratch copies and is labelled test damage. It is not research evidence.
- **No changes made:** originals were opened read-only or copied, and scratch copies were deleted afterwards. No implementation, git or remote state was changed.
