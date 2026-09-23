# The current plan

[relationship-ontology.html](relationship-ontology.html) is the visual review and updated plan. [relationship-ontology.md](relationship-ontology.md) gives the record definitions, evidence-pack rules and implementation order.

The review covers 30 additional cases across 82 primary text segments. Six earlier cases were checked again. These are selected examples for a challenge set, not an estimate of accuracy across the whole text.

The source reviews and quoted evidence live in the study's data/checkpoint folder. To validate the quotes and rebuild the report, run these from the worktree root:

    python3 research/sage-network/data/checkpoint/build_ontology_review.py
    python3 research/sage-network/plan/build_ontology_report.py

The earlier plan.html and roadmap.html remain as historical design documents. Their earlier chronology and identity shortcuts are superseded by the current plan. The earlier build.py still rebuilds that historical page from data.json, girsa.json, body.tmpl and style.css.
