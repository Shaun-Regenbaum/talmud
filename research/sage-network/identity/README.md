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

## First registry suggestions for new source readings

`name_candidates.py` looks up the name each new source reading prints, such as "רמי בר חמא", in the registry
snapshot of the parent revision. It reads only the quoted name at its source span. The reader's English label is
kept for display and never matched.

- One registry entry with the exact full name gives a tentative suggestion. It is never accepted.
- A short name ("רבי מאיר") gives alternatives, even when only one entry has it.
- A registry name with a label such as "(2)", or a person listed in two rows, gives alternatives.
- An abbreviation gives guesses only. Each guess names its list: first the site's `expandAbbreviations`, then
  the matcher's own unreviewed list. Other readings stay possible.
- If the source goes on with "בר", "בן" or "בריה" right after the quote, the quote may be cut short, and no
  suggestion is made.
- A father inside a patronymic stays a local relative. Generic actors are not matched.
- Registry rows the site treats as non-sages (`nonSageTopics.ts`) are never candidates, and a quote that starts or
  ends inside a longer word gives none (the anchor audit's whole-word rule).
- A person is skipped only when older readings placed every one of its mentions at the same words and in the
  same role. A father inside an older child's quote, or a quote printed twice, is only noted as possible.
- A person that a reviewed or human record in the parent revision already decides is skipped. `Decisions` finds those
  records with the era release's own scope (`possible_eras.scoped_rows`): by `personKey`, `case.personKey`,
  `identityDecision.personKey`, `personKeys` or the a/b sides, by identity group, by subject or object, and through
  the claims a human correction names. It also reads graph nodes, which list reviewed people in `personKeys`.
- A decision about another person never decides this one. Decisions about older people at the same words are kept
  on the case as review evidence (`olderDecisions`). Only full coverage at the same span and role skips a person.
- Every anchor is checked against its source: the source hash, segment, edition, page, the nth match of the quote
  and its occurrence key. An alias that must not name a father is refused after `בר`, `בן`, `ברבי` or `בריה ד`,
  including a ד the quote itself carries.
- `envelope()` pins what an output depends on: the module's own bytes, every rule constant, the alias and duplicate
  files and the registry snapshot. Each dependency carries its rebuilt v1 hash; the store, revision, stored hash and
  stored format are left for the importer, which reads them from the store that holds the row.

Registry generations are copied onto each candidate as stored metadata only. They are never this person's era.
The output kind is `name_candidates`. Existing `identity_proposal` records and recipes are unchanged.

## Prepare name_candidates records

`storage/name_candidates_import.py` builds the records offline from checked inputs only:

- a verified local export of the graph parent revision, whose record set must match its manifest;
- for readings a source-reading store holds, that store's read-back file (`source-reading-store-readback-v1`), which
  the store owner writes only after a full read-back rebuilds every passage from its R2 artifact.

```sh
python3 research/sage-network/storage/name_candidates_import.py prepare \
  --graph parent.sqlite --revision sage-graph-... --readback bavli-readback.json --output prepared
python3 research/sage-network/storage/name_candidates_import.py check \
  --graph parent.sqlite --revision sage-graph-... --readback bavli-readback.json --changes prepared/changes.json
```

Each candidate cites the person, passage and source_reading rows as stored (store, revision, stored hash and format)
and their rebuilt v1 hash. A reading the graph holds cannot also be cited from a store, since the graph copy wins. The
check rebuilds every record from the same inputs and refuses any difference. It then checks a second time that no
record is about a person a reviewed or human record decides, that no record is for a person older readings cover at
every mention, and that every alias guard holds. Nothing is written to any database; the extend_d1 wiring follows the
source-reading store change.
