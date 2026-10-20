# Compact source readings, version 2

This separate research recipe keeps version 1 unchanged. The model chooses a relationship and its endpoints. The compiler derives category and direction from the relation table instead of asking the model to repeat them.

`request.build_request(job)` includes the full guide, schema, relation table and exact source job. `validate.check(job, answer)` retains the original answer under `answer` and adds category and direction only to `record`. It hashes the original answer, sources, job and recipe. `check_saved` reconstructs the whole envelope from that original answer and refuses changed records.

Polarity means whether an action is affirmed or negated. Opposing an argument is a positive occurrence of opposition. It does not mean agreement.

All source, name-boundary, endpoint, hypothetical-scene, family, uncertainty and duplicate checks remain. Exact quotes do not establish historical accuracy. These are proposals, not confirmed identities or connections. No runner or production importer uses this version automatically.
