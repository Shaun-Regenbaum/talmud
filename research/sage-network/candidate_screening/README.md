# Keep candidate name matches without treating them as identities

`screenSource` consumes hits from the existing registry detector. It does not find new names, write records, assign a historical identity, infer a generation, or create relationships.

Supply the original source object, detector hits, the detector's normalization function, and exact detector/registry/slug-set hashes. `normalizeDetectorText` preserves the current detector's normalization for offline checks. A producer must compare it with the function that produced the hits. The captured fixtures contain actual sources and detector outputs; test faults change metadata only.

The result retains every input hit. Each proposal contains source identity, original-text offsets when reversible, registry alternatives, an explicit outside-registry/nonperson alternative, and review reasons. `candidate` means only that these specific filters did not hold the hit. It does not mean verified, eligible for automatic identity assignment, or ready for reader placement.

Single-word forms, school names, a narrow Bible-citation pattern, a captured ordinary-word verse formula, punctuation boundaries, unknown-name patterns and ambiguous normalization are held. These rules are intentionally incomplete. A held row keeps its candidates and evidence reference. An unplaceable row retains the source reference/hash and normalized detector position but has no raw-text anchor or occurrence key. The caller must preserve the original source alongside these rows.

Offsets count Unicode code points in the untouched supplied source. Attached prefixes, vowels and punctuation are preserved in the quoted span. Normalization that splits one raw token may be used only when the complete raw token is covered; a partial token is unplaceable. A mismatch between per-token and whole-source normalization holds all affected hits.

Registry candidate IDs are not person IDs. A later adapter must check registry entity types and existing guarded aliases, preserve human/checked links, and validate exact ownership and source placement. This module does not replace the existing importer, alias registry, source ownership rules, or initial-name placement code. Consumers must pin its file hash as well as the declared version when storing proposals.

Run the focused checks with:

```sh
node --test research/sage-network/candidate_screening/guards.test.mjs
```
