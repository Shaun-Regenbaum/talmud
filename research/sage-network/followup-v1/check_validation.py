"""Damage copies of a real dossier and require the intended check to reject each."""

import copy
import json
from pathlib import Path

from validate import check, check_case


def main():
    root = Path(__file__).parent
    path = root / "cases/challenge-09/dossier.json"
    original = json.loads(path.read_text())
    assert check_case(path)["valid"], "The actual source dossier must pass first"
    data = {}
    for source in original["sources"]:
        data[source["source_id"]] = (path.parent / source["saved_file"]).read_bytes()
    def read(source):
        return data[source["source_id"]]
    checks = []
    def reject(name, change, expected):
        damaged = copy.deepcopy(original)
        change(damaged)
        result = check(damaged, read)
        assert not result["valid"] and any(expected in e for e in result["errors"]), (name, result)
        checks.append({"damage": name, "rejected_by": expected})
    reject("changed source hash", lambda d: d["sources"][0].update(sha256="0"*64), "Source hash differs")
    reject("unknown quoted source", lambda d: d["findings"][0]["evidence"][0].update(source_id="missing"), "Missing source or quote")
    reject("changed quotation", lambda d: d["findings"][0]["evidence"][0].update(exact_quote="DELIBERATELY DAMAGED TEST QUOTATION"), "Quotation not found")
    reject("missing quoted evidence", lambda d: d["findings"][0].update(evidence=[]), "no quoted evidence")
    reject("duplicate source", lambda d: d["sources"].append(copy.deepcopy(d["sources"][0])), "duplicate source ID")
    reject("duplicate finding", lambda d: d["findings"].append(copy.deepcopy(d["findings"][0])), "duplicate finding ID")
    reject("missing explanation", lambda d: d["findings"][0].pop("reasoning"), "no reasoning")
    reject("invented confidence label", lambda d: d["findings"][0].update(confidence="certain"), "unknown confidence")
    reject("missing source edition", lambda d: d["sources"][0].pop("edition"), "no edition")
    reject("claim encoded as a list", lambda d: d["findings"][0].update(claim=["DELIBERATELY DAMAGED TEST COPY"]), "no claim")
    reject("evidence encoded as an object", lambda d: d["findings"][0].update(evidence={"source_id": "S1"}), "no quoted evidence")
    reject("count declared without offsets", lambda d: d["findings"][0]["evidence"][0].update(occurrences_in_segment=999), "Declared quotation count differs")
    reject("occurrence declared without offsets", lambda d: d["findings"][0]["evidence"][0].update(occurrence=999), "Declared quote occurrence differs")
    reject("boolean occurrence", lambda d: d["findings"][0]["evidence"][0].update(occurrence=True), "Declared quote occurrence differs")
    reject("visual-reading label on a text source", lambda d: d["findings"][0]["evidence"][0].update(exact_quote="DELIBERATELY DAMAGED TEST QUOTATION", evidence_type="researcher_visual_reading_of_page_image"), "Quotation not found")
    reject("wrong source field", lambda d: d["findings"][0]["evidence"][0].update(source_pointer="/missing"), "Declared source field differs")
    from validate import quote_matches
    ambiguous = next((f["finding_id"], n) for f in original["findings"] for n, e in enumerate(f["evidence"]) if len({loc["pointer"] for loc in quote_matches(data[e["source_id"]], e["exact_quote"])["locations"]}) > 1)
    def damage_ambiguous(d):
        finding = next(f for f in d["findings"] if f["finding_id"] == ambiguous[0])
        finding["evidence"][ambiguous[1]]["occurrence"] = 1
    reject("occurrence across several source fields", damage_ambiguous, "needs one source field")
    report = {"input": str(path.relative_to(root)), "input_sha256": check_case(path)["dossier_sha256"],
              "passed_checks": len(checks), "checks": checks,
              "note": "Temporary copies of actual research were deliberately damaged in memory. They are tests, not research evidence."}
    (root / "validation-tests.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed_checks": len(checks)}))


if __name__ == "__main__":
    main()
