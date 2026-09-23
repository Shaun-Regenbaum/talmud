"""Verify independent review coverage and preserve every failed or uncertain check."""

import json
from collections import Counter
from pathlib import Path

from run import atomic, file_sha

ROOT = Path(__file__).resolve().parent


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    jobs = {j["job_id"]: j for j in manifest["jobs"]}
    rubric = {c["id"]: c for c in json.loads((ROOT / "review_checks.json").read_text())["cases"]}
    cases, reviewers = {}, []
    for path in sorted((ROOT / "reviews").glob("*.json")):
        review = json.loads(path.read_text())
        reviewers.append({"path": path.name, "sha256": file_sha(path), "role": review["reviewer_role"], "limits": review["limits"]})
        for case in review["cases"]:
            jid = case["job_id"]
            assert jid in jobs and jid not in cases, f"unexpected or repeated review: {jid}"
            assert case["input_sha256"] == file_sha(ROOT / "inputs" / f"{jid}.json"), f"stale input review: {jid}"
            assert case["output_sha256"] == file_sha(ROOT / "outputs" / f"{jid}.json"), f"stale output review: {jid}"
            result = json.loads((ROOT / "outputs" / f"{jid}.json").read_text())
            claim_ids = {c["id"] for c in result["claims"]}
            keys = [(c["kind"], c["index"]) for c in case["checks"]]
            assert len(keys) == len(set(keys)), f"repeated check: {jid}"
            if jobs[jid]["group"] == "challenge":
                expected = rubric[jobs[jid]["case_id"]]
                assert set(keys) == {(kind, i) for kind, field in (("preserve", "must_preserve"), ("avoid", "must_avoid")) for i in range(len(expected[field]))}, f"missing review checks: {jid}"
            else:
                assert len(keys) >= 2 and all(k == "source" for k, i in keys), f"missing random source checks: {jid}"
            for c in case["checks"]:
                assert c["status"] in ("pass", "miss", "uncertain", "not_applicable")
                assert c["reason"] and set(c["claim_ids"]) <= claim_ids
            for f in case["additional_findings"]:
                assert f["severity"] in ("major", "minor")
                assert f["type"] in ("unsupported", "omission", "uncertainty", "contract_limit")
                assert f["reason"] and set(f["claim_ids"]) <= claim_ids
            cases[jid] = case
    assert set(cases) == set(jobs), f"unreviewed jobs: {set(jobs) - set(cases)}"
    counts = Counter(c["status"] for r in cases.values() for c in r["checks"])
    flagged = [jid for jid, r in cases.items() if any(c["status"] in ("miss", "uncertain") for c in r["checks"]) or r["additional_findings"]]
    major = [jid for jid, r in cases.items() if any(c["status"] == "miss" for c in r["checks"]) or any(f["severity"] == "major" for f in r["additional_findings"])]
    output = {"status": "provisional_independent_review", "notice": "Checklist agreement is not accuracy. These are selected difficult cases plus a tiny random sample, reviewed without human adjudication.",
              "reviewers": reviewers, "job_count": len(cases), "check_counts": dict(counts),
              "jobs_with_findings_or_uncertainty": sorted(flagged), "jobs_with_missed_checks_or_major_findings": sorted(major),
              "cases": [cases[jid] for jid in sorted(cases)]}
    atomic(ROOT / "semantic-review.json", output)
    print(json.dumps({k: v for k, v in output.items() if k not in ("cases", "reviewers")}, indent=2))


if __name__ == "__main__":
    main()
