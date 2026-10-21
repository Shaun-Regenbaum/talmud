# Show an earlier identity reading only at the exact source words

This bridge helps when a checked person has several registry candidates but the older page index already chose one.
It adds a possible identity. It does not change the original candidates, checked connections, accepted identities or eras.

The first version supports the captured Davidson vocalized text and Wikisource Bavli text. It removes vowels and
punctuation and expands only `דא"ר`, `א"ר` and `ר'`. The entire segment must then match, not just a name or its segment
number. Each printed name on the checked person must map to one prior indexed occurrence, and every mapped occurrence
must choose the same candidate. Raw texts and token offsets remain in the pinned artifact. Normalization is not lossless.

The old result binds its mention file, not its original text file. The new artifact freezes those files together and
reconstructs the text alignment now. This is supporting evidence from an earlier reading, not independent confirmation.
Its saved score is not a measured probability.

`index_identity_links.build(bytes, externally_pinned_sha256, current_graph_rows, revision)` checks the artifact,
current candidate alternatives and registry hash, and all four checked source dependencies. Existing identity decisions
or human corrections block it. `validate_changes` rebuilds the entire proposed change. The `extend_d1` hook requires
that same external artifact pin; a change file cannot approve its own evidence. The normal graph release preserves every
parent record and adds only a screening record.

There is one add-only `identity_link_evidence:v1/<personKey>` record per person. Its artifact hash is immutable. A revised
alignment needs an explicit future record version; v1 cannot replace history or silently refresh changed dependencies.
Full-name tentative candidates already have their own path; this bridge handles `alternatives` only.

Prepare and rehearse locally:

```
python index_identity_links.py prepare --artifact ARTIFACT --artifact-sha256 EXTERNAL_HASH --graph PARENT.sqlite --revision REVISION --output changes.json
python index_identity_links.py release --artifact ARTIFACT --artifact-sha256 EXTERNAL_HASH --export PARENT.sql --manifest PARENT.json --changes changes.json --output prepared
```

These commands do not upload or activate anything. Root release review must independently freeze the artifact and
current parent and source-store receipts before publication.

`readIndexIdentityCandidate` reads only exact IDs. It reuses the checked-name guard and also checks candidate-specific
review scope. It returns a candidate, registry hash, evidence-record proof and reason for the shared conditional profile
loader. Missing rows, changed source dependencies, oversized decision scopes or malformed data produce no profile.
The caller must keep alternatives visible and label biography, era and places as belonging to the possible identity.

The Yitzhak fixture contains captured text and stored rows, plus the exact proposed link rebuilt from them. Its graph
container in tests is deliberately small and is not release approval. Fault tests mutate copies to prove refusal.
