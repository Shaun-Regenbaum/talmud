"""Append passage-pilot files and queryable records without replacing prior work."""

import hashlib
import json
import shutil
import sys
from pathlib import Path

PILOT_TABLES = {
    "extraction_runs": "run_id VARCHAR PRIMARY KEY, manifest_json VARCHAR NOT NULL",
    "extraction_files": "file_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, path VARCHAR NOT NULL, sha256 VARCHAR NOT NULL, content VARCHAR NOT NULL",
    "extraction_sources": "source_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, job_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, snapshot_key VARCHAR NOT NULL, ref VARCHAR NOT NULL, edition VARCHAR NOT NULL, text VARCHAR NOT NULL, text_sha256 VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "extraction_readings": "reading_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, job_id VARCHAR NOT NULL, genre VARCHAR NOT NULL, coverage VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "extraction_mentions": "mention_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, reading_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, source_id VARCHAR NOT NULL, start_offset BIGINT NOT NULL, end_offset BIGINT NOT NULL, payload_json VARCHAR NOT NULL",
    "extraction_entities": "entity_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, reading_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, kind VARCHAR NOT NULL, label VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "extraction_claims": "claim_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, reading_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, family VARCHAR NOT NULL, predicate VARCHAR NOT NULL, subject_id VARCHAR NOT NULL, object_id VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "extraction_alternatives": "group_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, reading_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, kind VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "evidence_packs": "pack_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, question VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "decision_revisions": "decision_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, pack_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, supersedes_id VARCHAR, authority VARCHAR NOT NULL, status VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
}


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha(value):
    return hashlib.sha256(value.encode()).hexdigest()


def key(*values):
    return sha(encoded(values))


def require(ok, message):
    if not ok:
        raise ValueError(message)


def project(manifest, files):
    """Rebuild every indexed row from the frozen run files, also on read-back."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pilot"))
    from validate import check

    rid = sha(encoded(manifest))
    require(set(files) == set(manifest["files"]), "pilot file list differs from run manifest")
    rows = {table: [] for table in PILOT_TABLES}
    rows["extraction_runs"].append((rid, encoded(manifest)))
    for path, content in files.items():
        require(sha(content) == manifest["files"][path], f"pilot file hash differs: {path}")
        rows["extraction_files"].append((key(rid, path), rid, path, sha(content), content))
    inputs = json.loads(files["manifest.json"])
    require(len(inputs["jobs"]) == len({j["job_id"] for j in inputs["jobs"]}), "duplicate pilot job")
    all_claims = {}
    for item in inputs["jobs"]:
        jid = item["job_id"]
        job_raw = files[f"inputs/{jid}.json"]
        require(sha(job_raw) == item["input_sha256"], f"pilot input differs: {jid}")
        job = json.loads(job_raw)
        compiled = json.loads(files[f"compiled/{jid}.json"])
        result = compiled["record"]
        raw = files[f"outputs/{jid}.json"]
        require(sha(raw) == compiled["output_sha256"] and json.loads(raw) == result, f"raw reading differs: {jid}")
        require(compiled["input_sha256"] == item["input_sha256"], f"compiled input differs: {jid}")
        require(result["job_id"] == job["job_id"] == jid, f"pilot job ID differs: {jid}")
        checked = check(job, result)
        require(checked == {"record": result, "resolved_anchors": compiled["resolved_anchors"]},
                f"compiled evidence differs from full validation: {jid}")
        for path, checksum in compiled["recipe_hashes"].items():
            require(sha(files[path]) == checksum, f"recipe differs: {path}")
        reading_id = key(rid, jid)
        rows["extraction_readings"].append((reading_id, rid, jid, result["episode"]["genre"], result["episode"]["coverage"], encoded(compiled)))
        sources = {s["source_id"]: s for s in job["sources"]}
        for sid, source in sources.items():
            require(sha(source["text"]) == source["sha256"], f"pilot text hash differs: {jid}/{sid}")
            snapshot_key = key(source["ref"], source["edition"], source["sha256"])
            rows["extraction_sources"].append((key(reading_id, sid), rid, jid, sid, snapshot_key, source["ref"], source["edition"], source["text"], source["sha256"], encoded(source)))
        anchors = {}
        for a in compiled["resolved_anchors"]:
            s = sources[a["source_id"]]
            require(a["source_sha256"] == s["sha256"], "anchor source hash differs")
            require(0 <= a["start"] < a["end"] <= len(s["text"]) and s["text"][a["start"]:a["end"]] == a["quote"], "pilot evidence span differs")
            require(a["path"] not in anchors, "duplicate anchor path")
            anchors[a["path"]] = a
        for m in result["mentions"]:
            a = anchors[f"mentions/{m['id']}/anchor"]
            require(all(a[k] == v for k, v in m["anchor"].items()), "mention anchor differs")
            rows["extraction_mentions"].append((key(reading_id, m["id"]), rid, reading_id, m["id"], key(reading_id, a["source_id"]), a["start"], a["end"], encoded(m)))
        entity_ids = {e["id"] for e in result["entities"]}
        for e in result["entities"]:
            rows["extraction_entities"].append((key(reading_id, e["id"]), rid, reading_id, e["id"], e["kind"], e["label"], encoded(e)))
        for c in result["claims"]:
            require(c["subject"] in entity_ids and c["object"] in entity_ids, "claim entity missing")
            for n, evidence in enumerate(c["evidence"]):
                a = anchors[f"claims/{c['id']}/evidence/{n}"]
                require(all(a[k] == v for k, v in evidence.items()), "claim anchor differs")
            ck = f"{jid}/{c['id']}"
            require(ck not in all_claims, "duplicate claim")
            all_claims[ck] = c
            rows["extraction_claims"].append((key(reading_id, c["id"]), rid, reading_id, c["id"], c["family"], c["predicate"], key(reading_id, c["subject"]), key(reading_id, c["object"]), encoded(c)))
        for g in result["reading_groups"]:
            rows["extraction_alternatives"].append((key(reading_id, g["id"]), rid, reading_id, g["id"], g["kind"], encoded(g)))
    packs = json.loads(files["evidence-packs.json"])
    pack_ids = {p["id"] for p in packs["packs"]}
    require(len(pack_ids) == len(packs["packs"]), "duplicate evidence pack")
    for pack in packs["packs"]:
        require(set(pack["claim_refs"]) <= all_claims.keys(), "evidence pack has missing claims")
        job = json.loads(files[f"inputs/{pack['job_id']}.json"])
        require(pack["source_snapshots"] == job["sources"], "evidence pack snapshots differ from source job")
        require(pack["compiled_sha256"] == sha(files[f"compiled/{pack['job_id']}.json"]), "evidence pack reading hash differs")
        for candidate in pack["candidates"]:
            require(set(candidate["supporting_claims"] + candidate["opposing_claims"]) <= set(pack["claim_refs"]), "candidate cites absent evidence")
        rows["evidence_packs"].append((key(rid, pack["id"]), rid, pack["id"], pack["question"], encoded(pack)))
    seen_decisions = {}
    for decision in packs["decisions"]:
        require(decision["pack_id"] in pack_ids, "decision pack absent")
        require(decision["id"] not in seen_decisions, "duplicate decision ID")
        require(decision["authority"] in ("automated_review", "human"), "unknown decision authority")
        pack = next(p for p in packs["packs"] if p["id"] == decision["pack_id"])
        require(set(decision["supporting_claims"] + decision["opposing_claims"]) <= set(pack["claim_refs"]), "decision cites evidence outside its pack")
        previous = decision["supersedes"]
        require(previous is None or previous in seen_decisions, "decision predecessor absent or not earlier")
        if previous:
            require(seen_decisions[previous]["pack_id"] == decision["pack_id"], "decision changes pack")
            require(seen_decisions[previous]["authority"] != "human" or decision["authority"] == "human", "automated revision cannot supersede a human correction")
        require(decision["historical_graph_eligible"] is False, "pilot decisions cannot enter historical graph")
        seen_decisions[decision["id"]] = decision
        rows["decision_revisions"].append((key(rid, decision["id"]), rid, key(rid, decision["pack_id"]), decision["id"], key(rid, previous) if previous else None, decision["authority"], decision["status"], encoded(decision)))
    if "reviews-packs.json" in files:
        require(json.loads(files["reviews-packs.json"])["evidence_packs_sha256"] == sha(files["evidence-packs.json"]), "stale pack review")
    return rows


def validate_pilot(con):
    existing = {r[0] for r in con.execute("SHOW TABLES").fetchall()}
    if not (existing & set(PILOT_TABLES)):
        return
    require(set(PILOT_TABLES) <= existing, "partial pilot table schema")
    all_expected = {t: [] for t in PILOT_TABLES}
    for rid, raw in con.execute("SELECT run_id,manifest_json FROM extraction_runs").fetchall():
        manifest = json.loads(raw)
        require(sha(encoded(manifest)) == rid and encoded(manifest) == raw, "pilot manifest hash differs")
        files = con.execute("SELECT path,content FROM extraction_files WHERE run_id=?", [rid]).fetchall()
        require(len(files) == len(dict(files)), "duplicate pilot file path")
        expected = project(manifest, dict(files))
        for table, values in expected.items():
            all_expected[table].extend(values)
    for table, expected in all_expected.items():
        actual = con.execute(f'SELECT * FROM "{table}"').fetchall()
        require(sorted(actual, key=lambda x: x[0]) == sorted(expected, key=lambda x: x[0]), f"{table} differs from frozen run files")


def build(base, out, root):
    import duckdb
    from build import validate
    from schema import TABLES

    require(not out.exists(), "pilot release already exists")
    files = {}
    include = ["manifest.json", "reader.md", "reviewer.md", "contract.py", "schema.json", "validate.py", "run.py", "prepare.py", "review_checks.json", "evidence-packs.json", "semantic-review.json", "reviews-packs.json", "run-check.json", "checks.json", "runtime-checks.json", "README.md", "report-data.json", "report.html", "report.css", "family-counts.csv", "claims-by-family.svg", "build_report.py", "build_packs.py", "merge_reviews.py", "check_pilot.py", "check_runtime.py", "requirements.txt"]
    for name in include:
        files[name] = (root / name).read_text()
    for folder in ("inputs", "outputs", "compiled", "reviews"):
        for path in sorted((root / folder).glob("*.json")):
            files[path.relative_to(root).as_posix()] = path.read_text()
    manifest = {"version": "passage-pilot-release-v1", "base_snapshot": 1,
                "status": "reviewed_pilot_not_historical_graph", "files": {p: sha(t) for p, t in files.items()}}
    rows = project(manifest, files)
    part = out.with_suffix(out.suffix + ".part")
    require(not part.exists(), "unfinished pilot release exists")
    shutil.copyfile(base, part)
    try:
        with duckdb.connect(str(part)) as con:
            con.execute("BEGIN")
            for table, ddl in TABLES.items():
                con.execute(f'CREATE TABLE IF NOT EXISTS "{table}" ({ddl})')
            for table, values in rows.items():
                for row in values:
                    old = con.execute(f'SELECT * FROM "{table}" WHERE {PILOT_TABLES[table].split()[0]}=?', [row[0]]).fetchall()
                    require(not old or old == [row], f"old pilot record would change: {table}")
                    if not old:
                        con.execute(f'INSERT INTO "{table}" VALUES ({",".join("?" for _ in row)})', row)
            counts = validate(con)
            con.execute("COMMIT")
        part.replace(out)
    except Exception:
        part.unlink(missing_ok=True)
        raise
    return {"run_id": sha(encoded(manifest)), "tables": counts}


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--base", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--pilot-root", required=True, type=Path)
    args = p.parse_args()
    print(json.dumps(build(args.base, args.out, args.pilot_root), indent=2))
