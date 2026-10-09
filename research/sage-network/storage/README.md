# Publish graph updates without copying every record

The original storage keeps a full copy of each published graph revision in
`sage_graph_records`. Those snapshots remain readable and unchanged.

New revisions can use `shared-v1`. `sage_graph_record_versions` stores each full
record once. Its hash covers the payload and every indexed field, including
authority and person IDs. `sage_graph_revision_members` records which version
belongs to each revision. Membership is complete: it does not follow a mutable
parent or require recursive lookups.

Readers use `sage_graph_all_records`, which presents both formats with the same
columns. Published revisions and memberships cannot be edited or replaced.
Record versions cannot be edited, deleted, or replaced, even while a revision is
still being prepared. Human corrections retain their existing precedence.

## Prepare an update

Keep source review and import verification unchanged. To use shared records:

```sh
python3 research/sage-network/storage/extend_d1.py \
  parent.sql parent-manifest.json changes.json prepared --shared-records
```

The first conversion reads the parent records already in the database and seeds
their shared versions in bounded batches. Later updates copy only membership
references and add versions for changed records. Old snapshots are not deleted.
This reduces future growth; it does not reclaim space from earlier copies.

The preparation checks every output row against the expected complete graph.
The export verifier reads both formats and also checks shared membership and
version hashes. A successful upload is not proof that an import is correct.

## Release in this order

1. Apply migration `0003_shared_records.sql`. It is additive and works while the
   old reader still runs. The normal release workflow applies migrations first.
2. Deploy the reader that uses `sage_graph_all_records` and check existing pages.
3. Import the prepared shared revision into staging, leaving it `loading`.
4. Compare all indexed fields, payloads, counts, and hashes with the verified
   parent and prepared changes. Check query plans and person/page lookups too.
5. Activate staging, then check cards, coverage, source links, and pagination.
6. Repeat the import, verification, and activation checks in production after
   the updated reader is deployed there.

**Do not activate a shared revision while an old reader is running.** It reads
only copied records and would show an empty graph. Likewise, rolling back code
after activation requires a reader that understands both formats.

Run `PRAGMA optimize` after populating new indexes, as recommended in the
[D1 index documentation](https://developers.cloudflare.com/d1/best-practices/use-indexes/).
The read view orders its joins so selective lookups do not depend on statistics
being present. Keep corrections as indexed existence checks: joining a whole
union view can cause SQLite to copy every historical row into a temporary table.

Research exports and measured storage results stay in the owner's results
folder. This directory contains the storage code and its operating instructions.
