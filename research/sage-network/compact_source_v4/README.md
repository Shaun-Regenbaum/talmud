# compact-source-v4 (design stage)

The model would name source units by ID instead of retyping Hebrew and counting occurrences. Read
`DESIGN.md` first. It covers the plan, the measured cost, the risks, and the decisions root needs to
make.

Only `units.py` exists so far. It splits a source into units that join back to it exactly, and it
compiles unit ranges to the exact quotes and offsets that compact-source-v2 already checks.
`../tests/test_compact_source_v4_units.py` tests it on the real frozen sources.

Nothing selects this directory. v2 and v3 are unchanged, and a test pins their files.
