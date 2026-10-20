# Read local people before matching historical identities

This research recipe reads people and interpersonal relationships from supplied text. It does not assign registry IDs, generations, dates, or confirmed connections. It has its own version, guide, schema, and validator. Production recipes and the earlier passage pilot are unchanged.

People contain their mentions directly. Relationships point to local people, so ordinary readings need no statement or event nodes. An unclear endpoint can be null with a reason and possible endpoint pairs. Names without relationships remain in the output. Named speakers debating a hypothetical legal case retain an actual reported exchange; the imagined actors stay separate.

`request.build_request(job)` supplies the guide, complete relation table, schema, and source job in one message. Use that function rather than reconstructing a partial prompt. `validate.check(job, answer)` checks the answer and returns a proposal-only envelope bound to the full job, each source, the recipe files, and answer. `validate.check_saved(job, envelope)` repeats validation and compares the complete saved envelope before reuse.

The existing runner interface remains available: `contract.SCHEMA`, `validate.check(job, answer)`, and `answer.episode.coverage`. Import this as a package, such as `compact_source.validate`, to avoid importing another recipe's `contract` module in a shared process. Mount the complete directory when freezing a remote recipe.

Prepare a request without making any network call:

```sh
uv run --with jsonschema==4.25.1 python research/sage-network/compact_source/request.py job.json request.json
```

Run the tests:

```sh
uv run --with jsonschema==4.25.1 python -m unittest discover -s research/sage-network/tests -p test_compact_source.py
```

The fixture contains three captured source jobs and compact annotations based on existing independent readings. These are real text examples, not generated provider responses. The tests verify representation and rejection rules. They do not measure a model's accuracy, prove that every person was found, or approve the proposed relationships.

Exact quotes prove that words occur in the source. They cannot prove an interpretation. For example, the validator enforces child-to-parent direction vocabulary and person endpoint kinds, but a reviewer must still check that the proposed child and parent were assigned correctly. Likewise, `actual_report` means the text reports an act, not that history independently confirms it.
