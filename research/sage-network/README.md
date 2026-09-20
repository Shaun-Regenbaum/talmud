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
export SAGE_NETWORK_DATA=/somewhere/outside/any/git/worktree   # optional, recommended

python3 pipeline/01_fetch.py --list          # what would be fetched, and nothing else
python3 pipeline/01_fetch.py --limit 1       # smoke test: one work from each body of text
python3 pipeline/01_fetch.py                 # every Hebrew edition of every work
python3 pipeline/02_lexicon.py               # learn which words are given names
python3 pipeline/03_mentions.py              # every candidate mention, in every edition
python3 pipeline/18_anchor_recall.py         # are the names we know are there being found? no model needed

python3 pipeline/12_type_all.py --cap 2.50   # is each unsure mention a sage, a Bible figure, a word? cheap model
python3 pipeline/13_type_hard.py --cap 4.50  # the ones the cheap model was unsure of, asked again
python3 pipeline/14_typed_table.py           # one answer per mention, with its source kept

python3 pipeline/04_relations.py             # every pattern that joins two names (uses the typing)
python3 pipeline/19_pair_all.py --cap 3.00   # what each pair states, judged in its passage, with odds
python3 pipeline/20_pair_table.py            # the split by kind, and short forms the text spells out

python3 -m unittest discover -s tests        # also runs in CI
```

Every script that calls a model takes a hard dollar cap, can be stopped and
started again, and stops at once on a billing or key error. Scripts 05 to 11 and
15 to 17 draw and score the check sets (`CHECKSETS.md`).

Fetching is resumable. A unit is fetched only if its file is missing or empty,
files are written through a temporary name, and the manifest is rebuilt from
what is on disk. Works and editions are discovered from Sefaria's own index and
shape, not typed by hand, so a tractate cannot be dropped by a typo and a text
cannot be cut short by a wrong guess about how it is divided.

`pipeline/corpora.py` lists what is read and, as importantly, what is left out
and why: anthologies that quote the Talmud would count every passage twice.

`ANCHORS.md` fixes the handful of names the dating hangs from, and the rule
that chose them. `plan/plan.html` is the review and the plan.

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

## Where it stands (20 September 2026)

One edition per work, 281 works, 273,208 segments.

| | |
|---|---|
| Mentions of a name | about 190,000 |
| Needed a judgement (bare רב, short forms, names with no title) | 52,423, all typed |
| Of those, a sage | 74.5%. The rest: ordinary word 11%, Bible figure 7%, legal term 6% |
| Pairs of neighbouring names | 57,557, all judged in their passage |
| Pairs with a confident reading | 30,987 (54%) |
| Confident pairs that fix an order (A cites, follows or explains B) | 14,981 |

Model calls so far cost about $14. Not yet done: the second, stronger pass over
the pairs the cheap model was unsure of; held-out check sets; and everything
after the pairs (merging names into people, ordering, dating).

## Status

Source collection and first-pass analysis. No claim here has been peer
reviewed, and `METHOD.md` lists what is known to be wrong with it.
