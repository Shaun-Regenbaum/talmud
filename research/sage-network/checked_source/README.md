# Keep reviewed items without approving the original answer

`validate.check` is a pure adapter. It makes no database writes and grants no
publication permission. Its output is local `needs_review` data. Human corrections
and accepted identities must continue to win in any future consumer.

The caller supplies the exact expected plan and approval-manifest hashes from an
independent review. A bundle cannot approve itself. Review files are supplied as
exact raw JSON text with byte hashes; the immutable approval manifest pins them and
every decision. Duplicate JSON keys are rejected. The bundle includes the frozen job, queue configuration, attempt,
original result text, plan, approval manifest, and review receipts.

The adapter rebuilds the exact request and checks the attempt, result checksum,
configuration, original bytes, recipe and source hashes. Successful answers must
replay through the unchanged v4 compiler. Failed answers stay failed. Source
additions to a failed answer are explicitly new reviewed items, never fabricated
successful output. Malformed or duplicate original item IDs are not salvageable
through this first adapter; they are rejected even when additions are proposed.
A later source-only review format would be needed for those cases. Each original item requires a replace, hold or reject
disposition. New items use `add` and an `add:` ID. Every decision pins its original
item hash and source evidence. Unknown fields and historical identity/era fields
are rejected.

A retained person has typed mentions: `printed_name`, `actor_description`, or
`referential_evidence`. Only the first is eligible for a name highlight. Pronouns
and speech verbs remain useful reference evidence for unnamed actors. The adapter
checks exact Unicode code-point slices, full-word boundaries for names and
explicit descriptions, source edition and segment identity. It does not infer
that a grammatically valid span is truly a name; the exact decision must be
independently approved.

A connection has two retained local participants and a broad type. An intellectual
contrast can keep both participants while its direction and precise predicate are
held. It does not become a directed response or an encounter. Even a direct interaction
does not itself prove a physical meeting; `establishesMeeting` stays false. Specific directed
predicates require a supported direction. Family connections require person
endpoints. Uncertain identities can stay local; hypothetical actors cannot become
reported connections through this adapter.

Each supplied segment has explicit coverage. Known gaps and held items prevent
whole-reading approval. An originally failed answer never receives that flag.
All dispositions, evidence and review hashes remain in the checked artifact.

## Interface for a future importer

Call `check(bundle, expected_plan_hash=..., expected_approval_hash=...,
ownership_index=...)`. Use the independently pinned `OwnershipIndex` from the
existing ownership package. Output includes `binding`, `people`, `connections`,
`decisions`, `sourceCoverage`, `ownership`, and `artifactHash`.

Evidence may refer to context. Publication eligibility comes only from the
returned ownership rows, not the focal flag or the presence of a valid quote.
The importer must retain exact piece and whole-segment offsets, deduplicate owned
occurrences, and store a new immutable reading revision. It must not overwrite
existing human corrections, infer historical identity from the local IDs, or
count nonowned context as newly published coverage. This package intentionally
contains no SQL or changes to the existing source-reading importer.

## Tests

The compressed fixture contains four actual captured readings: Sukkah, Arakhin,
Taanit, and a schema-failed answer. The ownership rows are an exact subset with a
recomputed fixture-only header; this is not a publication manifest. Test decisions
and fault mutations are clearly labelled and cannot authorize a release.

Run `uv run --with jsonschema==4.25.1 python -m unittest discover -s
research/sage-network/tests -p test_checked_source.py`.
