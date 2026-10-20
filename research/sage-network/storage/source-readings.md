# Initial names and relationships from source readings

The importer adds `passage`, `person`, and `claim` records with `authority=screening` and `decision=needs_review`. One `source_reading` record records their origin. These are first readings, not accepted historical identities, eras, or connections. Existing records cannot be changed.

A passage ID identifies one reading of a source window. Its person IDs describe local groups of mentions, not global people. Two readings can group the same name differently. Each exact occurrence has a separate key based on edition, source segment ID, source text hash, and start/end offsets. Offsets refer to the original segment, never the joined context text. The record's `ref` identifies the focal reading; a context-only person's actual location is in `mentions[].ref`. It must not be placed on the focal page.

`analysis_projection` unions primary occurrence and evidence keys. Relationship proposals remain separate because two readings can disagree. Do not count all proposal rows as distinct people or events. The current checked-connections API does not read these proposals. A separate proposal projection will connect them to the shared person card without changing checked connections or approved page placement.

## What the importer checks

The complete source job must occur at the claimed index in the original frozen shard. The shard bytes must match the queue manifest. The queue response, job, configuration, and recipe hashes must match. The original response must pass the unchanged compact-v2 validator. If a reviewed prefix amendment is supplied, the importer replays the helper and compares the entire amendment and receipt before accepting it. An invalid whole response stays in an external review file. No individual people are silently rescued from it.

All resulting records are reconstructed during `extend_d1` validation. Extra or changed records fail. Exact existing records are omitted, so replaying the same batch is a no-op. Different existing records, including human corrections, fail.

Legacy `named` values and claim shapes are preserved. New predicates use `other:<predicate>` in the legacy relation field; the precise typed relationship remains in `claim.reading`. Participant and database endpoint indexes use full passage/person keys.

## Prepare and preserve the originals

Use `source_readings.py --capture CAPTURE --parent-db VERIFIED_SQLITE --parent-revision REVISION --output NEW_DIRECTORY`. The capture contains `bundles` and `inputArtifacts`. Each bundle contains the exact job, queue configuration, queue result, optional full amendment, and frozen-shard proof. Input artifacts are the original UTF-8 shard strings indexed by their hashes. Preparation reads the database with `mode=ro` and produces changes, a held list, an analysis export, and canonical JSON artifacts.

Full originals are written once as `artifacts/<sha256>.json`. The database keeps their hash, byte length, recipe/result/source/amendment hashes, and private location:

- Bucket: `talmud-source-evidence`
- Object key: `source-readings/v1/artifacts/<sha256>.json`

The bucket already exists in the same account as the graph database. It has no public endpoint. This importer does not upload, fetch, or publish anything. A prepared reference does not mean the object has been uploaded.

Before publishing a database revision, upload each frozen artifact to that key, download it again, and verify the exact SHA-256 and byte length. Save a receipt containing bucket, object key, expected hash/length, downloaded hash/length, and verification time. All values must agree. Keep that receipt with the release review. Do not publish references that have only local files.

The large artifacts and shard proofs are preparation inputs, not copied into every database record. Use shared record versions and a few reviewed release chunks. Estimate database growth from real samples before a broad release; old immutable revisions must not be deleted to make room.
