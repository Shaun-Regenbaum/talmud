# Read identities without changing the graph

These jobs propose historical identities for named people in saved passages. A successful response is a proposal, not a verified identity. Generation labels come from the candidate registry and are not newly established dates.

The input manifest pins the graph revision, registry and every input file. The runner saves an attempt before dispatch, checks each returned quote against the source, and writes a checksum with each result. Unknown interrupted charges remain recorded. Provider requests have a deadline, a fixed price ceiling and a dedicated non-resetting account limit.

Use the personal Modal profile explicitly for this project. The deployed jobs survive a local terminal closing. Do not change a shared login or the global active profile.

- `prepare_wide.py` prepares cases from the pinned graph and existing registry.
- `wide_job.py` runs eight separate lanes, each with at most 32 requests in flight.
- `audit_job.py` reads a separate sample without including the first answers in its requests. Agreement between readings is not an accuracy score.
- `recovery_job.py` checks all original results and saves a separate recovery queue. Run it only after the original workers have finished. A recovery request may repeat an interrupted request whose earlier charge is unknown.
- `recovery_job.finalize` validates the input files and merges the finished recovery results into a compact export. Run it after recovery finishes. It does not call a model.

Original responses remain in the remote volume. The compact export retains their hashes and paths, source hashes, answers and recipe identifiers. Keep the final export and accounting receipts with the personal result directory.

# Upload proposals separately from accepted identities

`storage/prepare_proposals.py` turns the pinned inputs and recovery export into one record for every case, including failures. Its optional audit directory attaches the second readings and source-review notes for disagreements.

`storage/extend_d1.py --shared-records` verifies the parent revision and creates an append-only import. Proposal records must remain `authority=screening`, `decision=needs_review`, and `accepted=false`. They cannot replace graph facts or human corrections. The reader's checked connections and name links do not consume these records.

Import into staging in the loading state, verify every new record and all inherited memberships, and only then activate. Repeat the same checks in production. Database verification establishes that the stored bytes match; it does not confirm the historical claims.
