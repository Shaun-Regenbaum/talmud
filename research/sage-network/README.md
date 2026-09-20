# How many sages are in the Talmud?

A name in the Talmud is not a person. One name can cover several men, and one
man appears under several names. Every era in a modern sage index comes from a
biography that someone attached to a name, and nothing in that process checks
that the man in the passage is the man in the biography.

This directory asks what the text can establish on its own, before any
biography is consulted.

## What it does

1. Reads the Hebrew and Aramaic of the Bavli, the Yerushalmi and the aggadic
   and halakhic midrashim. No translation is used anywhere, because a
   translator has already resolved the ambiguities being measured.
2. Takes **every** Hebrew witness Sefaria holds for each work, not one. The
   same passage in two editions is the strongest evidence that two spellings
   are one name, because the variation sits at a single location.
3. Finds name mentions, then discovers the relation vocabulary by counting what
   actually joins two names, rather than by listing the phrases an author
   happens to remember.
4. Builds a relation graph whose nodes are **names, not people**, and derives a
   relative order from the relations strong enough to carry one.
5. Reports where names can be told apart, where they cannot, and why.

## Running it

```
python3 pipeline/01_fetch.py --corpus bavli --limit 2    # smoke test
python3 pipeline/01_fetch.py --corpus all                # full fetch
```

Fetching is resumable and idempotent. A unit is re-fetched only if its file is
missing or empty, and files are written through a temporary name so an
interrupted run never leaves a half-written record.

## Sources and licence

Text is retrieved from Sefaria. Each snapshot records the edition, the source
URL, the capture time and the licence Sefaria reports for that version. That
attribution and the source licence apply to the snapshots. The text is not
edited; JSON encoding and the surrounding metadata were added for
reproducibility.

`data/raw/` is not committed. `data/manifest.json` carries a SHA-256 over each
unit's segment array, so a re-fetch can be verified against this snapshot. The
hash covers the UTF-8 encoding of the segment array serialised as JSON without
spaces and with literal Unicode, matching `research/pilot-v1`.

## Status

Source collection and first-pass analysis. No claim here has been peer
reviewed, and `METHOD.md` lists what is known to be wrong with it.
