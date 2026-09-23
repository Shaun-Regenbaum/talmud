"""Independent passage pilot contract. Production reader recipes are unchanged."""

VERSION = "passage-pilot-v1"


def obj(properties, required=None):
    return {"type": "object", "properties": properties,
            "required": list(properties) if required is None else required,
            "additionalProperties": False}


def arr(items, minimum=0):
    return {"type": "array", "items": items, "minItems": minimum}


def enum(*values):
    return {"enum": list(values)}


S = {"type": "string", "minLength": 1}
NULL = {"type": "null"}
STRINGS = arr(S)
ANCHOR = obj({"source_id": S, "quote": S,
              "occurrence": {"type": "integer", "minimum": 1}})
EVIDENCE = arr(ANCHOR, 1)
KINDS = ("person", "group", "statement", "event", "place", "object", "work", "unknown")
PREDICATES = {
    "child_of": ("family", ("person",), ("person",), "directed"),
    "spouse_of": ("family", ("person",), ("person",), "symmetric"),
    "sibling_of": ("family", ("person",), ("person",), "symmetric"),
    "child_in_law_of": ("family", ("person",), ("person",), "directed"),
    "reports_in_name_of": ("transmission", ("person", "group"), ("person", "group"), "directed"),
    "heard_from": ("transmission", ("person", "group"), ("person", "group"), "directed"),
    "attributes_to": ("transmission", ("statement",), ("person", "group"), "directed"),
    "student_of": ("teaching", ("person", "group"), ("person", "group"), "directed"),
    "addresses": ("speech", ("person", "group"), KINDS, "directed"),
    "asks": ("speech", ("person", "group"), KINDS, "directed"),
    "answers": ("speech", ("person", "group"), KINDS, "directed"),
    "objects_to": ("speech", ("person", "group"), ("statement", "event"), "directed"),
    "holds_view": ("views", ("person", "group"), ("statement",), "directed"),
    "rules_like": ("views", ("person", "group"), ("person", "group"), "directed"),
    "supports": ("views", ("person", "group", "statement"), ("statement",), "directed"),
    "opposes": ("views", ("person", "group", "statement"), ("statement",), "directed"),
    "explains": ("views", ("person", "group", "statement"), ("statement",), "directed"),
    "participates_in": ("scenes", ("person", "group"), ("event",), "directed"),
    "visits": ("scenes", ("person", "group"), ("person", "group", "place"), "directed"),
    "sits_before": ("scenes", ("person", "group"), ("person", "group"), "directed"),
    "travels_with": ("scenes", ("person", "group"), ("person", "group"), "symmetric"),
    "before": ("time", ("event",), ("event",), "directed"),
    "after": ("time", ("event",), ("event",), "directed"),
    "during": ("time", ("event",), ("event",), "directed"),
}
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    **obj({
        "schema_version": {"const": VERSION}, "job_id": S,
        "episode": obj({
            "genre": enum("halachic", "aggadic", "mixed", "unknown"),
            "genre_reason": S, "form": S,
            "coverage": enum("complete_for_supplied_text", "needs_context"),
            "needed_context": STRINGS, "notes": STRINGS,
        }),
        "mentions": arr(obj({"id": S, "kind": enum("name", "description", "pronoun", "group", "ambiguous"),
                             "anchor": ANCHOR})),
        "entities": arr(obj({"id": S, "kind": enum(*KINDS), "label": S,
                             "mention_ids": STRINGS, "evidence": EVIDENCE,
                             "branches": STRINGS})),
        "claims": arr(obj({
            "id": S, "family": enum("family", "transmission", "teaching", "speech", "views", "scenes", "time"),
            "predicate": enum(*PREDICATES), "subject": S, "object": S,
            "roles": arr(obj({"role": S, "entity": S})),
            "evidence": EVIDENCE, "branches": STRINGS,
            "voice": S,
            "polarity": enum("positive", "negative", "uncertain"),
            "modality": enum("asserted", "question", "hypothetical", "conditional", "prediction", "dream", "parable", "uncertain"),
            "discourse_status": enum("stated", "proposed", "answered", "rejected", "withdrawn", "uncertain"),
            "basis": enum("explicit", "local_coreference", "interpretation"),
            "reading_confidence": enum("high", "medium", "low"),
            "identity_confidence": NULL, "historical_confidence": NULL,
            "subtype": {"type": ["string", "null"]},
            "time_scope": {"type": ["string", "null"]}, "notes": STRINGS,
        })),
        "reading_groups": arr(obj({
            "id": S, "kind": enum("reported_alternatives", "editorial_readings", "interpretation_alternatives"),
            "evidence": EVIDENCE,
            "branches": arr(obj({"id": S, "label": S}), 2),
            "historical_compatibility": enum("unknown", "compatible", "incompatible"),
            "scope": S, "rejoin": {"type": ["string", "null"]}, "notes": STRINGS,
        })),
        "coreference_candidates": arr(obj({"mention_id": S, "entity_ids": arr(S, 1),
                                          "branches": STRINGS, "evidence": EVIDENCE, "reason": S})),
        "open_questions": STRINGS,
    }),
}

if __name__ == "__main__":
    import json
    from pathlib import Path
    Path(__file__).with_name("schema.json").write_text(json.dumps(SCHEMA, ensure_ascii=False, indent=2) + "\n")
