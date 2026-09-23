"""Build a visual report from saved investigations, sources and separate reviews."""

import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from validate import check, check_case

ROOT = Path(__file__).parent


def load(path):
    return json.loads(path.read_text())


def main():
    global ROOT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--source-manifest", type=Path, help="Restored run manifest mapping each source to its frozen file")
    args = parser.parse_args()
    ROOT = args.root.resolve()
    frozen = load(args.source_manifest) if args.source_manifest else None
    if frozen:
        for name, expected in frozen["files"].items():
            path = (ROOT / name).resolve()
            if not path.is_relative_to(ROOT) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise ValueError(f"Restored file differs: {name}")
    queue = load(ROOT / "queue.json")
    cases, checks = [], []
    for item in queue["jobs"]:
        directory = ROOT / "cases" / item["job_id"]
        if not (directory / "completion.json").exists():
            continue
        completion = load(directory / "completion.json")
        for name, expected in completion["files"].items():
            actual = hashlib.sha256((directory / name).read_bytes()).hexdigest()
            if actual != expected:
                raise ValueError(f"Completed file changed: {item['job_id']}/{name}")
        if frozen:
            saved = next(c for c in frozen["cases"] if c["job_id"] == item["job_id"])
            dossier_path = directory / "dossier.json"
            checked = check(load(dossier_path), lambda source: (ROOT / saved["source_files"][source["source_id"]]).read_bytes())
            checked["dossier_sha256"] = hashlib.sha256(dossier_path.read_bytes()).hexdigest()
        else:
            checked = check_case(directory / "dossier.json")
        if not checked["valid"]:
            raise ValueError(checked["errors"])
        dossier = load(directory / "dossier.json")
        review = load(directory / "review.json") if (directory / "review.json").exists() else None
        if review and review["dossier_sha256"] != checked["dossier_sha256"]:
            raise ValueError(f"Review refers to another dossier: {item['job_id']}")
        sources = []
        for source in dossier["sources"]:
            address = next(source[k] for k in ("url", "url_or_path", "url_or_input_path", "input_path", "source_url") if source.get(k))
            sources.append({"source_id": source["source_id"], "edition": source["edition"],
                            "ref": source.get("ref"), "address": address if address.startswith(("http://", "https://")) else None,
                            "sha256": source["sha256"], "fetched_at": source.get("fetched_at")})
        cases.append({"job_id": item["job_id"], "ref": dossier["focal_ref"], "question": dossier["question"],
                      "findings": dossier["findings"], "sources": sources,
                      "alternatives": dossier["alternative_readings"], "unresolved": dossier["unresolved"],
                      "corrections": dossier["proposed_corrections"], "lessons": dossier["ontology_lessons"],
                      "review": review, "quote_count": len(checked["citations"]),
                      "dossier_sha256": checked["dossier_sha256"]})
        checks.append(checked)
    by_id = {case["job_id"]: case for case in cases}
    examples = [e for e in load(ROOT / "examples.json") if e["job_id"] in by_id]
    for example in examples:
        ids = {f["finding_id"] for f in by_id[example["job_id"]]["findings"]}
        for variant in example["variants"]:
            if not set(variant["finding_ids"]) <= ids:
                raise ValueError(f"Visual cites missing finding: {example['id']}")
    summary = {"cases": len(cases), "queued": len(queue["jobs"]),
               "findings": sum(len(c["findings"]) for c in cases),
               "source_records": sum(len(c["sources"]) for c in cases),
               "distinct_source_files": len({s["sha256"] for c in cases for s in c["sources"]}),
               "quotations": sum(c["quote_count"] for c in cases),
               "separate_reviews": sum(c["review"] is not None for c in cases),
               "source_check_failures": sum(not c["valid"] for c in checks),
               "historical_merges_approved": 0}
    data = {"created_at": datetime.now(timezone.utc).isoformat(), "summary": summary,
            "cases": cases, "examples": examples,
            "limits": "Selected difficult cases and earlier pilot cases researched more closely. Counts are not an accuracy estimate, independent witness counts, or accepted historical graph edges."}
    (ROOT / "report-data.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    with (ROOT / "case-counts.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["job_id", "reference", "findings", "source_records", "checked_quotes", "separate_review"])
        for case in cases:
            writer.writerow([case["job_id"], case["ref"], len(case["findings"]), len(case["sources"]), case["quote_count"], case["review"] is not None])
    template = (ROOT / "report-template.html").read_text()
    css = (ROOT / "base.css").read_text() + "\n" + (ROOT / "report.css").read_text()
    result = template.replace("@@CSS@@", css).replace("@@DATA@@", json.dumps(data, ensure_ascii=False).replace("<", "\\u003c"))
    (ROOT / "report.html").write_text(result)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
