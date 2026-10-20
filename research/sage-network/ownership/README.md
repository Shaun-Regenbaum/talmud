# Put each saved reading on its own source passage

The original tile reader reads every supplied source. Its `focal` flag identifies one central passage. It does not authorize showing the other passages' names on that central passage.

`tile_ownership.py` adds a separate, versioned publication map. It does not change source jobs, model requests, saved answers, or `focal` flags. Every captured segment or segment piece gets exactly one owner job. When two jobs contain the same source, the original focal job wins. Otherwise the first job in the frozen tile index wins. Other readings remain available as alternatives.

The builder verifies the pinned source manifest, shard hashes, tile job hashes, source hashes, coverage index, and original source roles. Pieces retain their exact Unicode code-point offsets and must join back into the original segment without gaps or overlaps. The output binds both whole-segment and piece hashes, editions, references, jobs, shards, and frozen metadata files.

Before publication, independently review and pin the resulting `manifestSha256`. Load `OwnershipIndex(bundle, expected_ownership_hash)` once and call `sources_for(job)` for each saved reading. An owned source may supply proposals on its own passage. A non-owned source remains context for that reading. Ownership does not establish that a person or relationship is correct, and a missing owner result remains unfinished work. Do not switch to an alternative automatically when an owner fails.

This module only returns publication provenance. It does not import records or publish anything. A publication consumer must also validate the original reading and preserve its source references. For piece anchors, the absolute segment offset is the source-local anchor offset plus the returned `rawStart`.

The small test fixture contains unchanged jobs from captured Bavli and other-text tiles. Test setup creates manifests for those subsets. Corruption tests deliberately alter copied hashes, coverage, offsets, or job IDs; they introduce no historical claims.
