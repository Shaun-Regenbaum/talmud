"""Exercise validation against temporary damaged copies of real passage readings."""

import copy
import json
from pathlib import Path

from validate import Invalid, check
from run import atomic

ROOT = Path(__file__).resolve().parent


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    checks = []
    records = {}
    for item in manifest["jobs"]:
        jid = item["job_id"]
        job = json.loads((ROOT / "inputs" / f"{jid}.json").read_text())
        result = json.loads((ROOT / "outputs" / f"{jid}.json").read_text())
        check(job, result)
        records[jid] = (job, result)
    checks.append({"check": "all_real_readings", "passed": True, "jobs": len(records)})
    jid = next(j for j, (_, r) in records.items() if r["claims"] and r["mentions"])

    def damage(name, expected, change, use=jid):
        job, result = copy.deepcopy(records[use])
        change(job, result)
        try:
            check(job, result)
        except Invalid as e:
            assert e.code == expected, f"{name}: expected {expected}, got {e.code}"
        else:
            raise AssertionError(f"{name}: broken record passed")
        checks.append({"check": name, "passed": True, "expected_rejection": expected, "source_job": use})

    damage("changed_source_text", "source_hash", lambda j, r: j["sources"][0].update(text=j["sources"][0]["text"] + " "))
    damage("wrong_job", "job_id", lambda j, r: r.update(job_id=r["job_id"] + "-changed"))
    damage("missing_required_field", "schema", lambda j, r: r["claims"][0].pop("voice"))
    damage("unexpected_field", "schema", lambda j, r: r["claims"][0].update(unrecognized=True))
    damage("absent_quote", "anchor_quote", lambda j, r: r["mentions"][0]["anchor"].update(quote="\u0000"))
    damage("wrong_occurrence", "anchor_quote", lambda j, r: r["mentions"][0]["anchor"].update(occurrence=1000000))
    damage("missing_source", "anchor_source", lambda j, r: r["mentions"][0]["anchor"].update(source_id="__missing__"))
    damage("repeated_id", "duplicate_id", lambda j, r: r["mentions"].append(copy.deepcopy(r["mentions"][0])))
    damage("dangling_person", "entity_reference", lambda j, r: r["claims"][0].update(subject="__missing__"))
    damage("wrong_family", "predicate_family", lambda j, r: r["claims"][0].update(family="time" if r["claims"][0]["family"] != "time" else "speech"))
    damage("missing_branch", "branch_reference", lambda j, r: r["claims"][0].update(branches=["__missing__"]))
    damage("unearned_historical_score", "schema", lambda j, r: r["claims"][0].update(historical_confidence=0.99))
    damage("unearned_identity_score", "schema", lambda j, r: r["claims"][0].update(identity_confidence=0.99))
    damage("context_flag_disagrees", "context_status", lambda j, r: r["episode"].update(coverage="needs_context", needed_context=[]))
    branch_job = next(j for j, (_, r) in records.items() if any(e["branches"] for e in r["entities"]) and r["reading_groups"])
    def unscoped_entity(j, r):
        entity = next(e for e in r["entities"] if e["branches"])
        claim = copy.deepcopy(r["claims"][0]); claim.update(id="bad_scope", subject=entity["id"], branches=[])
        r["claims"].append(claim)
    damage("branch_local_person_leaks", "branch_scope", unscoped_entity, branch_job)
    claims = sum(len(r["claims"]) for _, r in records.values())
    summary = {"status": "passed", "scope": "Structure and source anchors only; semantic review is separate.",
               "real_jobs": len(records), "real_claims": claims, "checks": checks}
    atomic(ROOT / "checks.json", summary)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
