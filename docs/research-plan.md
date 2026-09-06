# Improve evidence before expanding generation

Cost accounting comes first. The billing display now uses the application's
key and an explicit date window. The permanent request ledger and atomic
spending reservations are live.

The next research step is a small, fixed comparison. More generated biographies
will not establish whether the identities and relationships are right.

## Start with 24 pages

`research/pilot-v1/selection.json` fixes 16 development pages and eight held-out
pages. The set spans the six orders represented in the Bavli. It deliberately
includes different kinds of discussion. It is a stress test, not a random sample
from which to claim an accuracy rate for the whole Talmud.

The source snapshots keep the Hebrew segments, edition, source URL, capture
time, and content hash. They contain no answer labels or model scores yet.
Use the same source snapshots for both candidates. Do not change the eight
held-out pages after seeing a result. Tune on the 16 development pages, then
run the held-out comparison once. A later revision needs a new held-out set.

## Establish what the sources support

Begin with the existing resolver and the 14 identity cases in
`packages/talmud/tests/fixtures/rabbi-pin-bench.json`. Those cases have explanatory
notes, but they are not a complete set of cited scholarly judgments. The
Berakhot coverage benchmark measures how often a name resolves. It does not
prove that the selected person is correct.

For each named person on the pilot pages, record:

- The exact phrase and segment where the name appears.
- The possible registry IDs, including known duplicates.
- The selected identity, or an explicit unresolved verdict.
- A source passage that distinguishes the selected person from the alternatives.
- Which evidence came from the page itself and which came from another source.

For each relationship, keep the exact claim and its supporting passage. Saying
that one rabbi reports a statement in another's name does not by itself prove
that they met or were teacher and student. A shared appearance on a page is not
evidence that they lived in the same place or generation.

Every proposed label must be checked against its source before scoring. Keep
uncertain or disputed cases separate. A second model's agreement is useful
review, but does not turn an unsupported claim into a fact. Human corrections
remain authoritative and must not be overwritten by a later generation.

## Compare the current system with one candidate

Freeze the current resolver, registry, prompts, and settings at a commit. Run
it on the fixed pages before modifying the candidate. The candidate may use
source excerpts and registry candidates, and must be allowed to decline an
identity or relationship it cannot support.

Report the following separately for development and held-out pages:

| Measure | What it answers |
| --- | --- |
| Identity precision and coverage | Of the identities we chose, how many were right, and how many mentions did we leave unresolved? |
| Wrong confident identities | Where did we confidently choose the wrong person? |
| Relationship support | Does the cited passage support this exact relationship? |
| Placement precision | Does the note point to the right phrase? |
| Citation validity | Can the reference be opened, and does the quoted passage occur there? |
| Cost per correct supported claim | What did successful calls, retries, and failed calls together cost? |
| Time per page | How long does the reader wait? |

Show counts as well as percentages. Report uncertainty and errors by page.
A small selected sample does not establish performance on every tractate.
Missing usage or ungraded cases must remain visible in the report.

Start with a $10 limit for the first paid comparison, including failed attempts
and retries. Stop when that amount is reserved or spent. Store request receipts
with the run. Source retrieval and label review come before those paid runs.

Promotion requires no new wrong confident identities, no loss of placement
precision, valid citations for every accepted claim, and a clear improvement
over the baseline in supported coverage or cost. Disagreements need review
before rollout. Do not fill the entire registry or re-warm all pages to run
this comparison.

## Give notes IDs that survive wording changes

A section called “When to recite Shema” must remain the same section when its
title becomes “The time for evening Shema.” Its database address should not
come from that title.

For the first producer that needs this, preserve an assigned section ID while
text and titles change. Match a revision to its previous text range before
reusing an ID. If a section splits, merges, or cannot be matched confidently,
record that explicitly. Keep old addresses as aliases so saved links still
open. Confirm that human notes remain attached before migrating another
producer. This is a small migration, not a replacement of every cache key.

## Separate code as each change needs it

Request accounting and spending admission now have their own modules in the
shared package. Next, put pilot source reading, evidence checks, and scoring
behind narrow functions. Keep HTTP handlers responsible for input, permissions,
and responses. Keep queue scheduling separate from the function that generates
a note.

Use the existing spine, anchor, artifact, and producer types. Introduce a new
abstraction only when it replaces an existing special case. Keep entity IDs
separate from aliases. Store each relationship's evidence alongside the claim,
rather than relying on a single source label for the whole biography.

The remaining order is: review pilot labels, run the comparison, then ship one
proven producer change. Stable IDs and module
extraction accompany that change where they are needed.
