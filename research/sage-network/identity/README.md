# Find names that need another identity review

`network_scan.py` compares names and their conversation partners across a verified graph revision. It keeps full names, source links, accepted identities, and earlier review conclusions. It does not decide that two mentions are the same historical person.

A shared partner is a reason to compare passages. It is not proof of identity. A quotation is kept separate from a direct exchange. Hypothetical cases, rejected claims, and uncertainty remain visible. Registry generations are background information, not independent dates.

## Run the scan

Use a SQLite copy of a verified graph revision, its manifest, and the bundled person registry:

```sh
python3 research/sage-network/identity/network_scan.py \
  input.sqlite input-manifest.json \
  packages/talmud/src/lib/data/rabbi-places.json scan.json --all-names
```

Without `--all-names`, the scan covers Huna, Yosei, Kahana, and Yochanan. Every input claim receives an accounting status. Quotes must match the saved passage or the appropriate surrounding text. Failed evidence checks are reported and excluded from comparisons.

Written-name groups are comparison aids. Several source entries may already refer to one reviewed person within a passage. `distinctPassagePeople` counts those together. Neither that count nor the number of name groups counts historical people.

## Prepare database records

```sh
python3 research/sage-network/identity/prepare_scan.py \
  input.sqlite input-manifest.json \
  packages/talmud/src/lib/data/rabbi-places.json changes.json
python3 research/sage-network/storage/extend_d1.py \
  parent-selected.sql input-manifest.json changes.json prepared
```

The importer recomputes the complete scan from the verified parent. Changed evidence, accepted flags, missing records, or altered comparisons fail validation. New rows use `screening` authority and `needs_review` status. They cannot replace accepted identities, corrections, or connections.

`namesake_scan` rows retain source record IDs and hashes, comparison reasons, classification warnings, and links to prior assessments. The original records hold the complete quotes. `namesake_registry` rows preserve the exact registry snapshot used for comparisons, including its limitations. Keep research outputs in the owner's personal results folder and the project’s Cloudflare storage.

Import into staging first. Compare every stored addition and all inherited records before marking the revision verified. Repeat those checks in production. A successful SQL upload alone is not verification.

The existing records API can retrieve a review by passage:

```text
/api/sage-graph/records?kind=namesake_scan&passage=b059-p9
```

These records support the next source review. They do not add new confirmed connections or change the reader’s person links.
