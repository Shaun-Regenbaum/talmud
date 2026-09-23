"""Freeze a fresh random set of passages for testing the next reader, before anyone reads them.

Every passage already used by the pilot or the follow-up research is excluded,
including its context segments. The draw uses only a seeded hash of each saved
passage-version ID. It does not look at names, labels, length or subject.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent
STUDY = ROOT.parent
SEED = "sage-heldout-v2-2026-09-23"
PER_CORPUS = 6


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


def used_refs():
    refs, files = set(), []
    for path in sorted((STUDY / "pilot/inputs").glob("*.json")):
        files.append(path)
        refs.update(s["ref"] for s in json.loads(path.read_text())["sources"])
    queue = json.loads((STUDY / "followup-v1/queue.json").read_text())
    refs.update(job["ref"] for job in queue["jobs"])
    for path in sorted((STUDY / "followup-v1/cases").glob("*/input.json")):
        files.append(path)
        data = json.loads(path.read_text())
        refs.update(s["ref"] for s in data.get("sources", []) if s.get("ref"))
        if isinstance(data.get("source"), dict) and data["source"].get("ref"):
            refs.add(data["source"]["ref"])
        if data.get("focal_ref"):
            refs.add(data["focal_ref"])
    return refs, files


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--database", required=True, help="A local copy of sage_network snapshot 2")
    p.add_argument("--snapshot", type=int, required=True)
    args = p.parse_args()
    excluded, exclusion_files = used_refs()
    con = duckdb.connect(args.database, read_only=True)
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
    jobs, selected = [], []
    for corpus in ("bavli", "yerushalmi"):
        eligible = [r for r in rows if r[0] == corpus and r[5] not in excluded and r[6].strip()]
        eligible.sort(key=lambda r: digest(SEED + ":" + r[-1]))
        chosen = []
        for row in eligible:
            group, at = positions[row[-1]]
            window = group[max(0, at - 2):at + 3]
            # Skip a draw whose context overlaps used text or an earlier draw.
            if any(r[5] in excluded for r in window) or any(r[5] in {w[5] for c in chosen for w in c[1]} for r in window):
                continue
            chosen.append((row, window))
            if len(chosen) == PER_CORPUS:
                break
        for i, (row, window) in enumerate(chosen, 1):
            job_id = f"heldout-{corpus}-{i:02d}"
            sources = []
            for n, r in enumerate(window, 1):
                u = json.loads(r[8])
                sources.append({"source_id": f"s{n}", "ref": r[5], "text": r[6], "sha256": r[7],
                                "edition": r[2], "provenance": {
                                    "segment_id": r[-1], "corpus": r[0], "work": r[1],
                                    "license": u.get("license"), "version_source": u.get("versionSource"),
                                    "captured_at": u.get("capturedAt"), "source_url": u.get("sourceUrl")}})
            jobs.append({"job_id": job_id, "focal_ref": row[5], "sources": sources})
            selected.append({"job_id": job_id, "ref": row[5], "corpus": corpus,
                             "sample_unit": "saved passage version", "eligible_count": len(eligible),
                             "selection_sha256": digest(SEED + ":" + row[-1])})
    for job in jobs:
        save(ROOT / "inputs" / f"{job['job_id']}.json", job)
    manifest = {"version": "heldout-inputs-v2", "seed": SEED, "lake_snapshot": args.snapshot,
                "database_note": "source_segments and source_units are unchanged since snapshot 1",
                "excluded_ref_count": len(excluded),
                "excluded_refs_sha256": digest("\n".join(sorted(excluded))),
                "exclusion_inputs": {str(f.relative_to(STUDY)): digest(f.read_text()) for f in exclusion_files},
                "selection": f"{PER_CORPUS} lowest seeded SHA256 values per corpus whose focal passage and two-segment context avoid every used reference and every earlier draw.",
                "rule": "Frozen before reading. Nobody tunes reading rules on these passages. They are read once by the next reader recipe, then reviewed.",
                "limits": "Twelve passages test unfamiliar material. They cannot estimate accuracy across the Talmud.",
                "jobs": [{**m, "input_sha256": digest((ROOT / "inputs" / f"{m['job_id']}.json").read_text())} for m in selected]}
    save(ROOT / "manifest.json", manifest)
    print(json.dumps({"jobs": len(jobs), "excluded_refs": len(excluded), "selected": [(s["job_id"], s["ref"]) for s in selected]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
