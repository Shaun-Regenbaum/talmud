"""Reject broken passage records; these checks do not certify their interpretation."""

import copy
import hashlib
import json
from pathlib import Path

from jsonschema import Draft202012Validator

from contract import PREDICATES, SCHEMA


class Invalid(ValueError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(f"{code}: {message}")


def require(condition, code, message):
    if not condition:
        raise Invalid(code, message)


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def check(job, result):
    errors = list(Draft202012Validator(SCHEMA).iter_errors(result))
    require(not errors, "schema", "; ".join(f"{list(e.path)} {e.message}" for e in errors[:8]))
    require(job["job_id"] == result["job_id"], "job_id", "output belongs to a different job")
    sources = {s["source_id"]: s for s in job["sources"]}
    require(len(sources) == len(job["sources"]), "source_id", "duplicate source ID")
    for source in sources.values():
        require(sha(source["text"]) == source["sha256"], "source_hash", source["ref"])
    anchors = []

    def anchor(a, path):
        require(a["source_id"] in sources, "anchor_source", path)
        source = sources[a["source_id"]]
        starts, at = [], 0
        while True:
            at = source["text"].find(a["quote"], at)
            if at < 0:
                break
            starts.append(at)
            at += 1
        require(len(starts) >= a["occurrence"], "anchor_quote", f"{path}: quote occurrence absent from {source['ref']}")
        start = starts[a["occurrence"] - 1]
        anchors.append({"path": path, **a, "source_sha256": source["sha256"],
                        "start": start, "end": start + len(a["quote"]), "offset_unit": "Unicode code points"})

    all_ids = set()

    def index(items, container):
        indexed = {}
        for item in items:
            require(item["id"] not in all_ids, "duplicate_id", f"{container}/{item['id']}")
            all_ids.add(item["id"])
            indexed[item["id"]] = item
        return indexed

    mentions = index(result["mentions"], "mentions")
    entities = index(result["entities"], "entities")
    claims = index(result["claims"], "claims")
    groups = index(result["reading_groups"], "reading_groups")
    branches = {}
    for group in groups.values():
        for bid in index(group["branches"], "branches"):
            branches[bid] = group["id"]

    def scope(values, path):
        require(len(values) == len(set(values)), "branch_duplicate", path)
        require(set(values) <= branches.keys(), "branch_reference", path)

    def evidence(values, path):
        require(len({canonical(v) for v in values}) == len(values), "evidence_duplicate", path)
        for i, a in enumerate(values):
            anchor(a, f"{path}/{i}")

    for mid, mention in mentions.items():
        anchor(mention["anchor"], f"mentions/{mid}/anchor")
    for eid, entity in entities.items():
        require(set(entity["mention_ids"]) <= mentions.keys(), "mention_reference", eid)
        require(len(entity["mention_ids"]) == len(set(entity["mention_ids"])), "mention_duplicate", eid)
        if entity["kind"] in ("person", "group"):
            require(entity["mention_ids"], "ungrounded_person", eid)
        scope(entity["branches"], eid)
        evidence(entity["evidence"], f"entities/{eid}/evidence")

    def allows(claim_scope, entity_scope):
        for group in set(branches[b] for b in entity_scope):
            needed = {b for b in entity_scope if branches[b] == group}
            current = {b for b in claim_scope if branches[b] == group}
            if not current or not current <= needed:
                return False
        return True

    semantic_keys = set()
    for cid, claim in claims.items():
        scope(claim["branches"], cid)
        refs = [claim["subject"], claim["object"]] + [r["entity"] for r in claim["roles"]]
        if claim["voice"] not in ("narrator", "unknown"):
            refs.append(claim["voice"])
        for eid in refs:
            require(eid in entities, "entity_reference", f"{cid}: {eid}")
            require(allows(claim["branches"], entities[eid]["branches"]), "branch_scope", f"{cid}: {eid}")
        family, subjects, objects, direction = PREDICATES[claim["predicate"]]
        require(family == claim["family"], "predicate_family", cid)
        require(entities[claim["subject"]]["kind"] in subjects and entities[claim["object"]]["kind"] in objects,
                "predicate_types", cid)
        if claim["predicate"] in ("child_of", "spouse_of", "sibling_of", "child_in_law_of", "before", "after"):
            require(claim["subject"] != claim["object"], "self_relation", cid)
        if claim["predicate"] == "rules_like":
            require(any(r["role"] == "content" and entities[r["entity"]]["kind"] == "statement" for r in claim["roles"]),
                    "missing_content", cid)
        evidence(claim["evidence"], f"claims/{cid}/evidence")
        # A second inverse copy of one symmetric assertion supplies no new evidence.
        pair = [claim["subject"], claim["object"]]
        if direction == "symmetric":
            pair.sort()
        signature = canonical([claim["predicate"], pair, sorted(claim["branches"]), claim["evidence"],
                               claim["polarity"], claim["modality"], claim["voice"], claim["roles"],
                               claim["time_scope"], claim["subtype"]])
        require(signature not in semantic_keys, "duplicate_claim", cid)
        semantic_keys.add(signature)
    used_branches = {b for x in [*entities.values(), *claims.values()] for b in x["branches"]}
    require(used_branches == set(branches), "empty_branch", ",".join(set(branches) - used_branches))
    for gid, group in groups.items():
        evidence(group["evidence"], f"reading_groups/{gid}/evidence")
    for i, candidate in enumerate(result["coreference_candidates"]):
        require(candidate["mention_id"] in mentions, "coreference_mention", str(i))
        require(set(candidate["entity_ids"]) <= entities.keys(), "coreference_entity", str(i))
        scope(candidate["branches"], str(i))
        evidence(candidate["evidence"], f"coreference_candidates/{i}/evidence")
    linked = {m for e in entities.values() for m in e["mention_ids"]}
    linked.update(c["mention_id"] for c in result["coreference_candidates"])
    require(linked == set(mentions), "orphan_mention", ",".join(set(mentions) - linked))
    require(bool(result["episode"]["needed_context"]) == (result["episode"]["coverage"] == "needs_context"),
            "context_status", "needs_context and needed_context disagree")
    if not claims:
        require(result["episode"]["notes"], "empty_reading", "zero claims needs an explanation")
    return {"record": copy.deepcopy(result), "resolved_anchors": anchors}


def check_files(job_path, output_path):
    return check(json.loads(Path(job_path).read_text()), json.loads(Path(output_path).read_text()))


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("job")
    p.add_argument("output")
    args = p.parse_args()
    result = check_files(args.job, args.output)
    print(json.dumps({"valid_structure": True, "claims": len(result["record"]["claims"]),
                      "anchors": len(result["resolved_anchors"])}))
