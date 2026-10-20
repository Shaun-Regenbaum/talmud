# Publish each owned source separately

A reading can contain several passages. Its focal passage remains the same. Publication ownership is a separate, versioned index and never changes the saved focal/context flags or the reading's people and relationships.

Pass `--ownership` and `--ownership-hash` together to `source_readings.py`. The hash must be the independently reviewed ownership manifest hash. The importer checks each exact job and source against that manifest, and checks the job again against its frozen input shard before making index records.

`source_reading_coverage` records mark indexed readings, including readings that own no source units. `source_reading_unit` records index each owned source by its original reference. They retain the source edition, segment and piece hashes, absolute piece offsets, original role and owner job hash. Their IDs include the reading ID so later readings can coexist without replacing earlier ones. The separate `unitKey` identifies the same source across readings.

The initial-readings API returns each source unit once and lists its reading IDs. It publishes names only when their exact quote, source ID, edition, hash and character span match an owned source. It exposes `published` separately from the original `primary` flag. Unindexed readings retain their previous focal-only behavior. Source units without names remain visible in the API's `sources` list.

All new records remain screening proposals. Existing rows, human corrections, historical identities and eras are unchanged. Repeating an import is a no-op; changing an existing row fails. This does not enable a new reading recipe or publish any data by itself.

Interaction counts use distinct source passages per partner and category, rather than the number of quoted excerpts. All excerpts remain available underneath. Split pieces share their parent segment identity and hash for counting. Links from split-piece mentions to reviewed whole-segment identities remain conservative: the existing crosslink requires the exact source hash and local span, so a piece cannot yet establish that link. It stays an initial person rather than guessing an identity.
