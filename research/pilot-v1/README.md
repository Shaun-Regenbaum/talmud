# Pilot source snapshot

This directory fixes the input pages for a research comparison. It contains
real source text, not generated answers. No cases have been graded and no
candidate has been promoted from this snapshot.

- `selection.json`: 16 development pages and eight held-out pages.
- `manifest.json`: filenames, segment counts, and SHA-256 hashes.
- `texts/`: source snapshots with edition, URL, capture time, and license.

Hashes cover the UTF-8 encoding of the segment array serialized as JSON without
spaces and with literal Unicode. Segment numbers are zero-based within the
snapshot. Preserve the snapshots when the upstream edition changes.

The text is the William Davidson Edition - Vocalized Aramaic, retrieved through
Sefaria. Each record includes the source-reported `CC-BY-NC` license and source
URL. This attribution and the source license apply to the text snapshots.
English translations are not included. Text has not been edited; JSON encoding
and the surrounding metadata were added for reproducibility.

The set is deliberately selected to expose errors. It is not a random sample
of all pages. See `docs/research-plan.md` for label review, scoring, costs, and
promotion requirements.
