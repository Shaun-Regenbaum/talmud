# Initial names link only when the saved words match

An initial reading can open its existing local person card from the daf. This does not confirm a historical identity or an era. Existing name and place marks keep priority.

Older passages need an immutable `source_binding` record first. `source_bindings.records` joins the saved reference and exact whole-passage SHA256 to a separately reviewed ownership manifest. The edition and segment must be unique. The record binds the original passage payload hash and the explicitly supplied manifest hashes. `extend_d1` recomputes the complete set before import. A binding batch cannot alter people, readings, claims or human corrections.

The `/initial?placement=v1` response retains the existing list and adds a versioned placement envelope. It includes each source edition, full text, checksum, binding checksum and Unicode code-point offsets. The reader requests the same revision as its checked names and discards stale page results.

Only one local reading with a unique name-sized quote qualifies. The quote must equal the saved name label, optionally with one attached Hebrew prefix. The full source word sequence must match the displayed segment. There is no abbreviation expansion or repair of missing segment labels. Existing marks are never removed. Repeated, broad, competing or overlapping names stay in the passage list. Names with English labels and Hebrew quotes currently remain there too.

Owned compact sources use their explicit publication units. Split pieces stay unlinked until a whole-segment layout proof exists. Unnamed actors, generic examples and hypothetical compact participants do not receive these links.

A production rollout requires a separately reviewed source-binding import. Code deployment alone does not create bindings. Report actual painted links on saved real pages separately from source-binding and candidate counts. Local browser replay must say that it replays saved source data.
