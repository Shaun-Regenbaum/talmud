# Compact source reading instruction experiment 3

This isolated research recipe adds instructions for continuing named conversations, distinguishing editorial questions from people, separating explanations from transmission, handling local aliases, keeping name anchors short, copying exact characters and prefixes for every mention, and distinguishing parallel views from exchanges. Anonymous hypothetical legal actors may remain in notes; named scholars and actual participants remain the priority.

The output schema remains `compact-source-v2`. `contract.py`, `validate.py`, and `request.py` are byte-identical to version 2. The recipe hash changes because the guide changes. Consumers must bind that complete hash, not use the schema version as a recipe identifier. Existing recipes, caches, and saved outputs are unchanged. No runner or production importer selects this directory automatically.

The paired comparison uses 30 actual captured source jobs. Seven are targeted problems or positive controls. The other 23 are selected by a fixed hash within source-length thirds for valid, validation-failed and token-truncated outputs from the saved 136-result snapshot, without choosing them by semantic error. The fixture manifest records the selection and exact source/result hashes. Baseline answers are prior readings, not certified correct answers.

Tests check unchanged contracts, source bindings, selection reproducibility, and rejection of corrupted evidence. They do not establish whether the new instructions improve interpretation. A paid paired run and independent source review are separate steps.
