# Conditional generation labels on source-person cards

`possible_eras.py` prepares `possible_era` screening records. An accepted identity can support a possible generation label. An unreviewed identity can support the same label only with “If this is …”. Neither becomes an accepted era, a lifespan, or evidence for dating another person.

The first recipe covers only the reviewed A/B eligibility policy. Held candidates and ranges inferred from encounters are excluded. The policy hash, holds hash and explicit alias-map hash are pinned in the importer and card mapper. The approved policy is a private input, supplied once to `build(rows, policy, parent_revision)`. It is not repeated inside each database record. Its content hash must match the pin; a different policy requires review and a code change.

Every entry keeps the original candidate ID, its explicit canonical alias, and exact source, identity, reason and registry record hashes. The decision scope also covers earlier assignments, their groups and reviews, accepted identities, withheld passages and human decisions tied to the exact person or claim endpoints. A new decision or changed dependency removes the hint until another policy is reviewed. No short-name matching is used.

Pass the returned change set through `extend_d1.py`. The importer reconstructs every addition from the verified parent and rejects mixed changes or edits to existing records. Other change sets cannot cite possible-era records as identity or dating evidence. Keep the policy and its audit/hold receipts in the private evidence archive before publishing a data revision. Preparing application code does not publish any era data.

The person API returns a separate `possibleEra`. The existing `PersonEra` component shows its condition, source reason and registry link. Existing reviewed era or generation fields retain priority. Any displayed years come only from the existing generation guide and are explicitly approximate activity ranges, never inferred birth or death years.

Tests use captured records from the corrected graph revision, including Rav Ashi, Rabbi Chiyya, a linked identity group and an actually held assignment. Additional tests deliberately alter metadata to verify stale-record suppression. The runtime scope query is exercised against SQLite with these captured records.
