# Check existing relationship claims

This recipe asks a model to check relationship claims that were already found in a passage. It does not find new
claims, people, quotes or identities. Every result is a proposal.

## What the model gets and returns

One job is one passage with up to 12 claims. The model sees the text before, in and after the passage, each person's
exact mention words and their positions, and each claim's two people, kind and exact quote with every position where
the quote occurs. It does not see earlier labels, machine or reader verdicts, record bindings or why the passage was
picked. `request.build_request(job)` builds the two messages: `reader.md` as the system message and the job as JSON.

For each claim the model returns:

- `claim_as_written`: supported, contradicted or uncertain;
- `supported_kind`: what the text shows between the two people (direct_interaction, teaching_transmission,
  response_to_teaching, family, narrative, hypothetical, none or unclear);
- `direction` and `family_degree`;
- `verdict`: one of the seven older codes, for comparison only;
- `reason` and `uncertain_detail`.

## What may be passed on

`validate.check(job, answer)` refuses only shape and id errors: wrong keys, a missing or extra claim, an unknown code.
Questions of meaning become audit flags for source review, such as a quotation not found in the source or a mention of
an outside era. The answer is never repaired.

The check also compiles each claim:

- **The original claim is passed on only when** the answer supports it as written, the direction is as written or
  symmetric, and the family degree is as written or not applicable.
- **Otherwise only an undirected connection of the supported kind survives**, with the reason and the doubts. A real
  pair stays connected even when the detailed claim is wrong.
- **A reversed direction or a "descendant, not child" reading becomes a typed correction between the same two
  people.** It is marked `status: proposal` and `accepted: false`, and is never a fact.

Human corrections outrank everything here. The compiled output carries `proposal_only: true`, and the importer keeps
human-authored records.

## Running it

`freeze.py jobs.jsonl out/` writes the directory that `research/sage-network/coverage/queue_core.py` reads:
`recipe/` (this package plus `queue_adapter.py`), `shards/` and `queue-manifest.json`, with `freeze-receipt.json`.
Freezing the same jobs twice gives identical bytes. Provider, prices, budget and key are chosen at launch, not here.
`max_reservation_usd` gives the queue's own upper bound per request once prices are known.

Tests: `python3 -m unittest discover -s research/sage-network/tests -p test_relationship_verdict.py`. They use 16 real
passages and one reader's hand verdicts (manual controls, not gold). They check the request, the validator and what
may be passed on. They do not measure accuracy.
