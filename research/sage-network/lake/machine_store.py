"""Keep unreviewed machine readings and their second-model checks as additive, provisional records.

A machine reading is one model's answer (compact-source-v1) for one frozen source job: the people it listed
and the relationships between them. Nobody has reviewed these answers. A second model has judged a random
sample of them from the text alone. Nothing here approves a person, a merge, a date or a graph edge.

Tables, all append-only:
  machine_runs      one row per import run; its manifest holds the counts and the sample-check summary
  machine_readings  every saved answer for a job, valid or not, with the model's exact answer text
  machine_checks    one row per person or connection a second model judged
  machine_releases  where a reading went: which source-reading store revision, in staging or production
"""

import glob
import json
import shutil
from pathlib import Path

from pilot_store import encoded, key, require, sha

MACHINE_TABLES = {
    "machine_runs": "run_id VARCHAR PRIMARY KEY, contract VARCHAR NOT NULL, parent_snapshot BIGINT NOT NULL, manifest_json VARCHAR NOT NULL",
    "machine_readings": "reading_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, job_id VARCHAR NOT NULL, focal_ref VARCHAR NOT NULL, job_sha256 VARCHAR NOT NULL, reader_family VARCHAR NOT NULL, request_sha256 VARCHAR NOT NULL, recipe_version VARCHAR NOT NULL, status VARCHAR NOT NULL, detail VARCHAR NOT NULL, answer_sha256 VARCHAR, answer_json VARCHAR, people_listed BIGINT, relationships_listed BIGINT, review_status VARCHAR NOT NULL",
    "machine_checks": "check_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, reading_id VARCHAR NOT NULL, item_kind VARCHAR NOT NULL, item_id VARCHAR NOT NULL, verdict VARCHAR NOT NULL, note VARCHAR NOT NULL, checker_family VARCHAR NOT NULL, reader_family VARCHAR NOT NULL, batch VARCHAR NOT NULL",
    "machine_releases": "release_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, reading_id VARCHAR NOT NULL, environment VARCHAR NOT NULL, store VARCHAR NOT NULL, store_revision VARCHAR NOT NULL, passage_id VARCHAR NOT NULL, selection_sha256 VARCHAR NOT NULL, release_name VARCHAR NOT NULL",
}
CONTRACT = "machine-reading-v1"
RECIPE = "compact-source-v1"
STATUSES = ("valid", "invalid", "model_error")
PERSON_VERDICTS = ("ok", "wrong", "unsure")
CONNECTION_VERDICTS = ("ok", "wrong_direction", "unsupported", "unsure")
ENVIRONMENTS = ("staging", "production")
REVIEW_STATUS = "machine_unreviewed"
NOTE = "Unreviewed machine readings. A sample was judged by a second model. No approved person, merge, date or graph edge."


def family(reader):
    return reader.split("-")[-1]


def reading_row(run_id, result, job):
    answer = result.get("answer")
    answer_json = encoded(answer) if isinstance(answer, dict) else None
    people = len(answer["people"]) if answer_json and isinstance(answer.get("people"), list) else None
    relationships = len(answer["relationships"]) if answer_json and isinstance(answer.get("relationships"), list) else None
    rid = key(result["job_id"], result["request_sha256"], sha(answer_json) if answer_json else "")
    return (rid, run_id, result["job_id"], job["focal_ref"], job_digest(job), family(result["reader"]), result["request_sha256"],
            result["recipe_version"], result["status"], str(result.get("detail") or ""),
            sha(answer_json) if answer_json else None, answer_json, people, relationships, REVIEW_STATUS)


def job_digest(job):
    from ownership.tile_ownership import digest
    return digest(job)


def project(manifest, results, jobs, checks, releases):
    """Every indexed row, from the saved inputs. `results` maps job ID to a saved result, `jobs` job ID to its
    frozen job, `checks` is a list of second-model records, `releases` a list of dicts."""
    require(manifest.get("contract") == CONTRACT, "Unknown machine reading contract")
    require(type(manifest.get("parent_snapshot")) is int and manifest["parent_snapshot"] >= 3, "Invalid machine parent snapshot")
    run_id = sha(encoded(manifest))
    rows = {table: [] for table in MACHINE_TABLES}
    rows["machine_runs"].append((run_id, CONTRACT, manifest["parent_snapshot"], encoded(manifest)))
    by_job = {}
    for jid in sorted(results):
        result = results[jid]
        require(result["status"] in STATUSES, f"Unknown reading status: {jid}")
        require(result["recipe_version"] == RECIPE, f"Unknown recipe: {jid}")
        require(jid in jobs and jobs[jid]["job_id"] == jid, f"Reading has no frozen job: {jid}")
        row = reading_row(run_id, result, jobs[jid])
        by_job[jid] = row[0]
        rows["machine_readings"].append(row)
    seen = set()
    for record in checks:
        require(record["status"] == "valid", "Only complete checks are stored")
        jid = record["job_id"]
        require(jid in by_job and results[jid]["status"] == "valid", f"Check names a reading that is not valid: {jid}")
        require(record["reader_family"] == family(results[jid]["reader"]), f"Check names the wrong reader family: {jid}")
        require(record["checker_family"] != record["reader_family"], f"A reading must be checked by the other family: {jid}")
        answer = record["answer"]
        require(answer["job_id"] == jid, "Check answer belongs to another job")
        for kind, field, verdicts in (("person", "people", PERSON_VERDICTS), ("connection", "connections", CONNECTION_VERDICTS)):
            for item in answer[field]:
                require(item["verdict"] in verdicts, f"Unknown {kind} verdict")
                cid = key(by_job[jid], kind, item["id"], record["checker_family"], record["batch"])
                require(cid not in seen, "Duplicate check")
                seen.add(cid)
                rows["machine_checks"].append((cid, run_id, by_job[jid], kind, item["id"], item["verdict"], str(item.get("note") or ""),
                                               record["checker_family"], record["reader_family"], record["batch"]))
    for release in releases:
        require(release["environment"] in ENVIRONMENTS, "Unknown release environment")
        for jid, passage in sorted(release["passages"].items()):
            require(jid in by_job, f"Release names an unread job: {jid}")
            rid = key(by_job[jid], release["environment"], release["store"], release["store_revision"])
            rows["machine_releases"].append((rid, run_id, by_job[jid], release["environment"], release["store"], release["store_revision"],
                                             passage, release["selection_sha256"], release["name"]))
    ids = [r[0] for r in rows["machine_releases"]]
    require(len(ids) == len(set(ids)), "Duplicate release row")
    return rows


def summary(results, checks):
    out = {"readings": len(results), "by_status": {}, "by_reader_family": {}, "sample_checks": {}}
    for result in results.values():
        out["by_status"][result["status"]] = out["by_status"].get(result["status"], 0) + 1
        fam = family(result["reader"])
        out["by_reader_family"][fam] = out["by_reader_family"].get(fam, 0) + 1
    for record in checks:
        bucket = out["sample_checks"].setdefault(f"{record['checker_family']}_checks_{record['reader_family']}", {"readings": 0, "people": {}, "connections": {}})
        bucket["readings"] += 1
        for field in ("people", "connections"):
            for item in record["answer"][field]:
                bucket[field][item["verdict"]] = bucket[field].get(item["verdict"], 0) + 1
    return out


def validate_machine(con):
    existing = {row[0] for row in con.execute("SHOW TABLES").fetchall()}
    if not existing.intersection(MACHINE_TABLES):
        return {}
    require(set(MACHINE_TABLES) <= existing, "Partial machine reading table schema")
    problems = []
    runs = {rid: json.loads(raw) for rid, raw in con.execute("SELECT run_id, manifest_json FROM machine_runs").fetchall()}
    for rid, manifest in runs.items():
        if sha(encoded(manifest)) != rid:
            problems.append("machine_runs: a run ID differs from its manifest")
        if manifest.get("contract") != CONTRACT:
            problems.append("machine_runs: unknown contract")
    for table in ("machine_readings", "machine_checks", "machine_releases"):
        bad = con.execute(f"SELECT count(*) FROM {table} t ANTI JOIN machine_runs r USING(run_id)").fetchone()[0]
        if bad:
            problems.append(f"{table}: {bad} rows name a missing run")
    for rid, status, answer_sha, answer_json, job_id, recipe, people, rels, review in con.execute(
            "SELECT reading_id, status, answer_sha256, answer_json, job_id, recipe_version, people_listed, relationships_listed, review_status FROM machine_readings").fetchall():
        if review != REVIEW_STATUS or recipe != RECIPE or status not in STATUSES:
            problems.append(f"machine_readings: unexpected status fields in {rid}")
        if answer_json is None:
            if answer_sha is not None or people is not None or rels is not None:
                problems.append(f"machine_readings: an empty answer has values in {rid}")
            continue
        answer = json.loads(answer_json)
        if sha(answer_json) != answer_sha or encoded(answer) != answer_json:
            problems.append(f"machine_readings: answer text differs from its hash in {rid}")
        if isinstance(answer, dict) and (len(answer.get("people", [])) != people or len(answer.get("relationships", [])) != rels):
            problems.append(f"machine_readings: counts differ from the answer in {rid}")
        if status == "valid" and (answer.get("job_id") != job_id or answer.get("schema_version") != RECIPE):
            problems.append(f"machine_readings: a valid answer belongs to another job in {rid}")
    answers = {rid: json.loads(raw) for rid, raw, status in con.execute("SELECT reading_id, answer_json, status FROM machine_readings WHERE answer_json IS NOT NULL").fetchall()}
    statuses = dict(con.execute("SELECT reading_id, status FROM machine_readings").fetchall())
    for cid, rid, kind, item, verdict in con.execute("SELECT check_id, reading_id, item_kind, item_id, verdict FROM machine_checks").fetchall():
        if statuses.get(rid) != "valid" or rid not in answers:
            problems.append(f"machine_checks: {cid[:12]} names a reading that is not valid")
            continue
        field, verdicts = ("people", PERSON_VERDICTS) if kind == "person" else ("relationships", CONNECTION_VERDICTS)
        if kind not in ("person", "connection") or item not in {x["id"] for x in answers[rid][field]} or verdict not in verdicts:
            problems.append(f"machine_checks: {cid[:12]} names an item or verdict the answer does not have")
    bad = con.execute("SELECT count(*) FROM machine_checks WHERE checker_family = reader_family OR reader_family != (SELECT reader_family FROM machine_readings r WHERE r.reading_id = machine_checks.reading_id)").fetchone()[0]
    if bad:
        problems.append(f"machine_checks: {bad} rows are not a check by the other family")
    bad = con.execute("SELECT count(*) FROM machine_releases t ANTI JOIN machine_readings r USING(reading_id)").fetchone()[0]
    if bad:
        problems.append(f"machine_releases: {bad} rows name a missing reading")
    bad = con.execute("SELECT count(*) FROM machine_releases WHERE environment NOT IN ('staging','production') OR passage_id NOT LIKE 'cs1-%'").fetchone()[0]
    if bad:
        problems.append(f"machine_releases: {bad} rows have an unknown environment or passage")
    require(not problems, "; ".join(problems))
    return {table: con.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in MACHINE_TABLES}


def read_json(path):
    return json.loads(Path(path).read_text())


def collect(results_dir, shards_dir, checks_dir, release_specs, parent_snapshot, control=None):
    """Read the saved inputs. `release_specs`: list of "NAME:ENVIRONMENT:STORE:SELECTION_JSON:MANIFEST_JSON"."""
    results = {}
    for path in sorted(glob.glob(str(Path(results_dir) / "*.json"))):
        result = read_json(path)
        results[result["job_id"]] = result
    jobs = {}
    for shard in sorted(glob.glob(str(Path(shards_dir) / "shard-*.jsonl"))):
        for line in Path(shard).read_text().splitlines():
            if line.strip():
                job = json.loads(line)
                if job["job_id"] in results:
                    jobs[job["job_id"]] = job
    checks = []
    for path in sorted(glob.glob(str(Path(checks_dir) / "c*.json"))):
        batch = Path(path).stem
        for record in read_json(path):
            if record["status"] == "valid":
                checks.append(dict(record, batch=batch))
    releases = []
    for spec in release_specs:
        name, environment, store, selection_path, manifest_path = spec.split(":")
        selection_text = Path(selection_path).read_text()
        selection = json.loads(selection_text)
        manifest = read_json(manifest_path)
        releases.append({"name": name, "environment": environment, "store": store, "store_revision": manifest["revision"],
                         "selection_sha256": sha(selection_text),
                         "passages": {c["jobId"]: "cs1-" + c["artifactHash"] for c in selection["cases"]}})
    from compact_source.validate import recipe_binding
    manifest = {"contract": CONTRACT, "parent_snapshot": parent_snapshot,
                "recipe": {"name": RECIPE, "binding_sha256": recipe_binding()["sha256"]},
                "source_jobs": "full-bavli-tiles v1",
                "summary": summary(results, checks),
                "releases": [{k: v for k, v in r.items() if k != "passages"} | {"readings": len(r["passages"])} for r in releases],
                "control": control or None, "status": NOTE}
    return manifest, results, jobs, checks, releases


def build(base, out, results_dir, shards_dir, checks_dir, release_specs, parent_snapshot, control=None):
    import duckdb
    from build import file_hash, validate
    require(base.is_file() and not out.exists(), "Use an existing base and a new output")
    manifest, results, jobs, checks, releases = collect(results_dir, shards_dir, checks_dir, release_specs, parent_snapshot, control)
    rows = project(manifest, results, jobs, checks, releases)
    part = out.with_name(out.name + ".part")
    if part.exists():
        part.unlink()
    shutil.copyfile(base, part)
    try:
        with duckdb.connect(str(part)) as con:
            con.execute("BEGIN")
            for table, ddl in MACHINE_TABLES.items():
                con.execute(f'CREATE TABLE IF NOT EXISTS "{table}" ({ddl})')
                for row in rows[table]:
                    old = con.execute(f'SELECT * FROM "{table}" WHERE {ddl.split()[0]}=?', [row[0]]).fetchall()
                    # A later run may find the same record again; its first run ID stays.
                    same = old and (old == [row] if table == "machine_runs" else old[0][2:] == row[2:])
                    require(not old or same, f"Machine reading key collision: {table}")
                    if not old:
                        con.execute(f'INSERT INTO "{table}" VALUES ({",".join("?" for _ in row)})', row)
            counts = validate(con)
            con.execute("COMMIT")
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    part.rename(out)
    return {"run_id": rows["machine_runs"][0][0], "base_snapshot": parent_snapshot,
            "new_rows": {t: len(r) for t, r in rows.items()}, "tables": counts, "source_sha256": file_hash(out)}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True, help="directory of saved result files")
    parser.add_argument("--shards", type=Path, required=True, help="directory holding the frozen job shards")
    parser.add_argument("--checks", type=Path, required=True, help="directory of second-model check files (c*.json)")
    parser.add_argument("--release", action="append", default=[], metavar="NAME:ENV:STORE:SELECTION:MANIFEST")
    parser.add_argument("--parent-snapshot", type=int, required=True)
    parser.add_argument("--control", type=Path, help="JSON summary of the planted-error control")
    args = parser.parse_args()
    print(json.dumps(build(args.base, args.out, args.results, args.shards, args.checks, args.release, args.parent_snapshot,
                           read_json(args.control) if args.control else None), indent=2))
