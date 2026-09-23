"""Freeze source-only reading jobs and a deterministic passage-version sample."""

import argparse
import hashlib
import json
import re
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent
SEED = "sage-passage-pilot-2026-09-22-v1"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def save(path, value):
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text() != text:
        raise ValueError(f"Refusing to change frozen input: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def natural(value):
    return [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", value)]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--database", required=True)
    args = p.parse_args()
    con = duckdb.connect(args.database, read_only=True)
    review_path = ROOT.parent / "data/checkpoint/ontology-review-data.json"
    review = json.loads(review_path.read_text())
    jobs, mapping, excluded = [], [], set()
    for i, case in enumerate(review["cases"], 1):
        job_id = f"challenge-{i:02d}"
        sources = []
        for n, s in enumerate(case["sources"], 1):
            text = s["hebrew"]
            assert digest(text) == s["hebrew_sha256"]
            sources.append({"source_id": f"s{n}", "ref": s["ref"], "text": text,
                            "sha256": digest(text), "edition": s.get("edition", s.get("hebrew_edition")),
                            "provenance": s})
            excluded.add(s["ref"])
        jobs.append({"job_id": job_id, "focal_ref": case["ref"], "sources": sources})
        mapping.append({"job_id": job_id, "case_id": case["id"], "group": "challenge", "ref": case["ref"]})

    rows = con.execute("""select u.corpus,u.work,u.edition,u.unit_ref,s.ordinal,s.ref,s.text,s.text_sha256,
                                  u.document_json,s.segment_id
                           from source_segments s join source_units u using(unit_id)
                           where u.corpus in ('bavli','yerushalmi')""").fetchall()
    by_work = {}
    for row in rows:
        by_work.setdefault(tuple(row[:3]), []).append(row)
    for group in by_work.values():
        group.sort(key=lambda row: (natural(row[3]), row[4]))
    positions = {row[-1]: (group, i) for group in by_work.values() for i, row in enumerate(group)}
    selected = []
    for corpus in ("bavli", "yerushalmi"):
        eligible = [r for r in rows if r[0] == corpus and r[5] not in excluded and r[6].strip()]
        eligible.sort(key=lambda r: digest(SEED + ":" + r[-1]))
        # Selection does not inspect names, relation labels, passage length or subject matter.
        for i, row in enumerate(eligible[:6], 1):
            job_id = f"random-{corpus}-{i:02d}"
            group, at = positions[row[-1]]
            window = group[max(0, at - 2):at + 3]
            sources = []
            for n, r in enumerate(window, 1):
                u = json.loads(r[8])
                sources.append({"source_id": f"s{n}", "ref": r[5], "text": r[6], "sha256": r[7],
                                "edition": r[2], "provenance": {
                                    "segment_id": r[-1], "corpus": r[0], "work": r[1],
                                    "license": u.get("license"), "version_source": u.get("versionSource"),
                                    "captured_at": u.get("capturedAt"), "source_url": u.get("sourceUrl")}})
            jobs.append({"job_id": job_id, "focal_ref": row[5], "sources": sources})
            item = {"job_id": job_id, "group": "random", "ref": row[5], "corpus": corpus,
                    "sample_unit": "saved passage version", "eligible_count": len(eligible),
                    "partition": "development" if i <= 3 else "validation",
                    "selection_sha256": digest(SEED + ":" + row[-1])}
            selected.append(item)
            mapping.append(item)
    for job in jobs:
        save(ROOT / "inputs" / f"{job['job_id']}.json", job)
    manifest = {"version": "pilot-inputs-v1", "seed": SEED, "lake_snapshot": 1,
                "review_sha256": digest(review_path.read_text()),
                "selection": "Six lowest seeded SHA256 values per corpus, excluding reviewed references; no name-pair filter.",
                "context": "Random cases include two saved segments either side, within work and edition; needs_context may request more.",
                "limits": "Twelve random passage versions test unfamiliar material. They cannot estimate corpus-wide accuracy. Validation partition is frozen before reading.",
                "jobs": [{**m, "input_sha256": digest((ROOT / "inputs" / f"{m['job_id']}.json").read_text())} for m in mapping]}
    save(ROOT / "manifest.json", manifest)
    print(json.dumps({"jobs": len(jobs), "sources": sum(len(j['sources']) for j in jobs), "random": selected}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
