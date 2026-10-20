# compact-source-v4 (bounded implementation, under review)

The model names source units by number. It does not retype Hebrew or count occurrences. The plan,
the measured cost and the risks are in `DESIGN.md`.

Nothing selects this directory yet. No runner, cache, importer or production code uses it. v2 and
v3 are unchanged, and a test pins their files.

## Entry points

Import from `research/sage-network`.

v4 runs v2's checks unchanged, but it never imports whatever `compact_source_v2` happens to be on
the path. `dependency.py` reads four files from the `compact_source_v2/` folder next to this
package: `contract.py`, `validate.py`, `request.py` and `reader.md`. It checks each against a pinned
sha256, and it refuses to load if any one differs. It then runs the checked bytes as
`_compact_source_v2_<hash>.contract` and `.validate`.

**Every build and every check first re-hashes those four v2 files, and the seven v4 code files.**
The v4 files are checked against the hashes taken at import. If any file was edited after import,
the build or check fails at once with `recipe_changed`. It never records a new recipe hash for
code that is no longer on disk.

- **`compact_source_v4.request.build_request(job) -> request`**
  - In: the frozen job exactly as queued, with `text` and `sha256` per source.
  - Out: `{recipe_version, recipe, job_sha256, units, request_sha256, messages, response_format}`.
    `units` is one binding per source.
  - The model is shown each source with `units: [[n, text], ...]` in place of `text`. Unit `n` is
    one word with the spaces and punctuation that follow it. Unit 0, if present, is text before the
    first word.
  - **Save this record with the result.** The check needs it.
- **`compact_source_v4.validate.check(job, answer, request) -> record`**
  - `answer` is the provider's message content, parsed as JSON. Nothing else is done to it first.
  - The record holds:
    - `raw`: the answer exactly as received, and its hash
    - `binding`: the recipe, the job hash, the request hash, and the unit table per source
    - `compile`: the map from units to offsets, the derived v2-form answer, and `derived_from`
    - `v2_check`: the unchanged output of `compact_source_v2.validate.check`
    - `record_sha256`
  - On any failure it raises `validate.Invalid`. Its `code` is one of:
    - `recipe_changed`: a pinned v2 file or a v4 code file changed after import
    - `job`, `source`, `source_id`, `source_hash`, `focal_ref`: the job
    - `request`, `request_recipe`, `request_job`, `request_units`, `request_body`: the request does
      not match the one this recipe builds for this job. The check rebuilds the whole request and
      compares every field, including the messages, the response format and the request hash. A
      request with edited units or instructions is refused even when its metadata is kept.
    - `schema`: the raw v4 schema
    - `job_id`
    - `unit_source`, `unit_range`, `unit_anchor`, `raw_schema`, `source_id_duplicate`,
      `unit_binding`: the units
    - `v2:<code>`: any v2 check, for example `v2:duplicate_name_identity`
- **`compact_source_v4.validate.check_saved(job, request, saved) -> record`** is the resume check.
  It rebuilds everything from `saved.raw.answer` and must reproduce `saved` exactly. Otherwise it
  raises `saved_record` or `saved_binding`.
- **`compact_source_v4.validate.recipe_binding()`** returns `{version, files, depends_on,
  v2_namespace, tokenizer, display, sha256}`. `files` covers all seven v4 files. `depends_on`
  holds the four pinned v2 hashes.
- **`compact_source_v4.contract`**: `VERSION = 'compact-source-v4'`, `SCHEMA`, `RELATIONS`.

The recipe sha256 at commit is `6099a2e7a7f7a84ce8190a4e8163ec1c707633752f8c7451007d11446bf620f5`.
The tokenizer is `source-units-v1`, and the shown layout is `word-with-following-v1`.

## For a runner adapter

- **The status.** A result is complete only if `check` returns a record. Otherwise save the raw
  response and the `Invalid` code. Do not repair a raw v4 answer. There are no quotes left in it to
  fix.
- **What to read.** Read the producer from `record.binding.recipe`. `record.v2_check.recipe` names
  the v2 checker, not the producer. `compile.derived_v2_answer` is a derived copy. Never import it
  or save it as a raw v2 answer.
- **A frozen bundle** must hold the `compact_source_v4/` and `compact_source_v2/` folders side by
  side. The four v2 files must be at the hashes in `recipe.depends_on`. If they aren't, importing
  v4 fails.
- **The request builder and the validator share one module, `body.py`.** So a request can only
  pass if it is exactly the one this recipe builds.
- **Dependencies.** jsonschema is required, as it is for v2.

## A known gap in coverage

A father whose name is only inside one abbreviated unit together with his son, such as Gamliel in
`רשב"ג`, is kept in the son's reason. He is not a separate person, and he has no `child_of` link.
Root accepted this for the first three controls (005, 011 and 061).

v4 does not cover all fathers, and nothing built on it may claim that it does. No full run happens
until typed preservation of embedded relatives is added.
