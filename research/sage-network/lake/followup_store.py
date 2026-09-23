"""Keep source investigations and their reviews as additive, provisional records."""

import base64
import hashlib
import importlib.util
import json
import shutil
from pathlib import Path

from pilot_store import encoded, key, require, sha

RESEARCH_TABLES = {
    "research_runs": "run_id VARCHAR PRIMARY KEY, contract VARCHAR NOT NULL, parent_snapshot BIGINT NOT NULL, manifest_json VARCHAR NOT NULL",
    "research_files": "file_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, path VARCHAR NOT NULL, sha256 VARCHAR NOT NULL, content VARCHAR NOT NULL",
    "research_cases": "case_id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, job_id VARCHAR NOT NULL, focal_ref VARCHAR NOT NULL, review_status VARCHAR NOT NULL, historical_graph_eligible BOOLEAN NOT NULL, payload_json VARCHAR NOT NULL",
    "research_sources": "source_id VARCHAR PRIMARY KEY, case_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, file_id VARCHAR NOT NULL, address VARCHAR NOT NULL, edition VARCHAR NOT NULL, sha256 VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "research_findings": "finding_id VARCHAR PRIMARY KEY, case_id VARCHAR NOT NULL, local_id VARCHAR NOT NULL, kind VARCHAR NOT NULL, claim VARCHAR NOT NULL, confidence VARCHAR NOT NULL, payload_json VARCHAR NOT NULL",
    "research_citations": "citation_id VARCHAR PRIMARY KEY, finding_id VARCHAR NOT NULL, source_id VARCHAR NOT NULL, ordinal BIGINT NOT NULL, exact_quote VARCHAR NOT NULL, match_mode VARCHAR NOT NULL, locations_json VARCHAR NOT NULL",
}
CONTRACT = "source-investigation-v1"
# Image and PDF files (for example manuscript page photographs) are stored as base64 text.
# The manifest keeps the SHA256 of their raw bytes under binary_files.
BINARY_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".tif", ".tiff", ".pdf"}
# Each contract names a frozen checker file and its pinned hash. A stored run is
# always re-checked with the checker its contract names. Changed checks need a new
# contract entry and file; editing a frozen file fails here before any release.
CONTRACTS = {
    CONTRACT: ("validators/source_investigation_v1.py", "55a11ec11c59a72e6f01e5aa58b4be195e75169fa83c84f7a4018fba89470400"),
}


def checker(contract=CONTRACT):
    require(contract in CONTRACTS, "Unknown source investigation contract")
    relative, pinned = CONTRACTS[contract]
    path = Path(__file__).resolve().parent / relative
    require(sha(path.read_bytes().decode()) == pinned, f"Frozen checker was edited: {relative}")
    spec = importlib.util.spec_from_file_location(contract.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.contract_file = relative
    return module


def raw_bytes(manifest, path, content):
    if path in manifest.get("binary_files", {}):
        data = base64.b64decode(content, validate=True)
        require(hashlib.sha256(data).hexdigest() == manifest["binary_files"][path], f"Binary research file differs: {path}")
        return data
    return content.encode()


def address(source):
    return next(source[field] for field in ("url", "url_or_path", "url_or_input_path", "input_path", "source_url") if source.get(field))


def project(manifest, files):
    require(manifest.get("contract") in CONTRACTS, "Unknown source investigation contract")
    require(type(manifest.get("parent_snapshot")) is int and manifest["parent_snapshot"] >= 2, "Invalid research parent snapshot")
    require(isinstance(manifest.get("cases"), list) and manifest["cases"], "Research cases are empty")
    require(set(manifest["files"]) == set(files), "Research file list differs")
    paths = set()
    for path, content in files.items():
        require(isinstance(path, str) and path and path not in (".", "..") and "\\" not in path and Path(path).as_posix() == path and not Path(path).is_absolute() and ".." not in Path(path).parts, "Unsafe research file path")
        require(path.casefold() not in paths, "Research file paths collide ignoring case")
        paths.add(path.casefold())
        require(sha(content) == manifest["files"][path], f"Research file hash differs: {path}")
    require(set(manifest.get("binary_files", {})) <= set(files), "Binary file list names a missing file")
    for path in manifest.get("binary_files", {}):
        require(Path(path).suffix.lower() in BINARY_SUFFIXES, f"Unexpected binary file type: {path}")
        raw_bytes(manifest, path, files[path])
    module = checker(manifest["contract"])
    require(CONTRACTS[manifest["contract"]][1] == manifest["validator_sha256"], "Research validator differs from saved contract")
    require(files.get(module.contract_file) is not None and sha(files[module.contract_file]) == manifest["validator_sha256"], "Stored checker differs from the frozen contract file")
    supersedes = manifest.get("supersedes_run_id")
    require(supersedes is None or (isinstance(supersedes, str) and len(supersedes) == 64), "Invalid superseded research run")
    rid = sha(encoded(manifest))
    rows = {table: [] for table in RESEARCH_TABLES}
    rows["research_runs"].append((rid, CONTRACT, manifest["parent_snapshot"], encoded(manifest)))
    for path, content in files.items():
        rows["research_files"].append((key(rid, path), rid, path, sha(content), content))
    seen_jobs = set()
    for item in manifest["cases"]:
        jid = item["job_id"]
        require(isinstance(jid, str) and jid and Path(jid).name == jid and jid not in (".", ".."), "Unsafe research job ID")
        require(jid not in seen_jobs, "Duplicate research job")
        seen_jobs.add(jid)
        require(item["dossier"] == f"cases/{jid}/dossier.json", "Research dossier path differs from job")
        dossier = json.loads(files[item["dossier"]])
        require(dossier["job_id"] == jid, "Research job differs from dossier")
        def read_source(source):
            path = item["source_files"][source["source_id"]]
            return raw_bytes(manifest, path, files[path])
        checked = module.check(dossier, read_source)
        require(checked["valid"], f"Research source checks fail for {jid}: {checked['errors']}")
        cid = key(rid, jid)
        review_path = f"cases/{jid}/review.json"
        require((item.get("review") == review_path) if review_path in files else not item.get("review"), "Research review linkage differs from saved files")
        review = json.loads(files[item["review"]]) if item.get("review") else None
        if review is not None:
            require(isinstance(review, dict) and review, "Research review is empty or malformed")
            require(review["job_id"] == jid, "Review job differs")
            require(review["dossier_sha256"] == sha(files[item["dossier"]]), "Review is for different dossier bytes")
            require(review.get("historical_graph_eligible") is False, "Research review cannot approve a historical graph")
            require(review.get("status") in ("changes_required", "qualified_proposals", "no_changes_proposed", "needs_more_context"), "Unknown research review status")
            require(review.get("authority") in ("automated_review", "human_review"), "Unknown research review authority")
            require(isinstance(review.get("scope"), str) and review["scope"].strip(), "Research review scope is missing")
            require(isinstance(review.get("findings"), list) and review["findings"], "Research review findings are missing")
            for finding in review["findings"]:
                require(isinstance(finding, dict) and all(isinstance(finding.get(field), str) and finding[field].strip() for field in ("target", "decision", "reason")), "Research review finding is malformed")
        completion = json.loads(files[f"cases/{jid}/completion.json"])
        require(completion.get("job_id") == jid and completion.get("status") == "source_research_saved", "Research completion marker differs")
        require(set(completion.get("files", {})) == {"dossier.json", "reading.md"}, "Research completion files differ")
        for name, expected in completion["files"].items():
            require(sha(files[f"cases/{jid}/{name}"]) == expected, "Completed research file differs")
        rows["research_cases"].append((cid, rid, jid, dossier["focal_ref"], review["status"] if review else "not_independently_reviewed", False, encoded(dossier)))
        for source in dossier["sources"]:
            sid = source["source_id"]
            rows["research_sources"].append((key(cid, sid), cid, sid, key(rid, item["source_files"][sid]), address(source), source["edition"], source["sha256"], encoded(source)))
        for finding in dossier["findings"]:
            fid = finding["finding_id"]
            rows["research_findings"].append((key(cid, fid), cid, fid, finding["kind"], finding["claim"], finding["confidence"], encoded(finding)))
        for citation in checked["citations"]:
            fid, sid, n = citation["finding_id"], citation["source_id"], citation["evidence_index"]
            rows["research_citations"].append((key(cid, fid, n), key(cid, fid), key(cid, sid), n, citation["exact_quote"], citation["mode"], encoded(citation["locations"])))
    return rows


def read_exact(path, root):
    """Read one file byte for byte; refuse links, anything outside root and non-UTF-8 text."""
    require(not any(part.is_symlink() for part in [path, *path.parents] if part.is_relative_to(root)), f"Linked file refused: {path}")
    require(path.resolve().is_relative_to(root), f"File outside the research tree: {path}")
    try:
        return path.read_bytes().decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError(f"File is not UTF-8 text: {path}") from error


def collect(root, jobs, parent_snapshot, supersedes_run_id=None):
    root = root.resolve()
    pilot = root.parent / "pilot"
    tree = root.parent
    files, cases, binary = {}, [], {}

    def add(path, relative):
        if path.suffix.lower() in BINARY_SUFFIXES:
            require(not any(part.is_symlink() for part in [path, *path.parents] if part.is_relative_to(tree)), f"Linked file refused: {path}")
            data = path.read_bytes()
            files[relative] = base64.b64encode(data).decode("ascii")
            binary[relative] = hashlib.sha256(data).hexdigest()
        else:
            files[relative] = read_exact(path, tree)
    for jid in jobs:
        require(jid and Path(jid).name == jid and jid not in (".", ".."), "Unsafe job ID")
        case = root / "cases" / jid
        require((case / "reading.md").is_file(), f"Research reading is unfinished: {jid}")
        require((case / "completion.json").is_file(), f"Research completion record is missing: {jid}")
        dossier = json.loads(read_exact(case / "dossier.json", tree))
        for path in sorted(case.rglob("*")):
            if "__pycache__" in path.parts or path.name.startswith(".") or path.suffix == ".part":
                continue
            require(not path.is_symlink(), f"Linked file refused: {path}")
            if path.is_file():
                add(path, path.relative_to(root).as_posix())
        source_files = {}
        for source in dossier["sources"]:
            require(not Path(source["saved_file"]).is_absolute(), f"Absolute source path: {jid}/{source['source_id']}")
            path = (case / source["saved_file"]).resolve()
            if path.is_relative_to(case):
                relative = path.relative_to(root).as_posix()
            else:
                require(path.is_relative_to(pilot), f"Source outside case and pilot: {jid}/{source['source_id']}")
                relative = "inputs/pilot/" + path.relative_to(pilot).as_posix()
                add(path, relative)
            source_files[source["source_id"]] = relative
        item = {"job_id": jid, "dossier": f"cases/{jid}/dossier.json", "source_files": source_files}
        if (case / "review.json").exists():
            item["review"] = f"cases/{jid}/review.json"
        cases.append(item)
    for name in ("README.md", "queue.json", "baseline-hashes.json", "validate.py", "check_validation.py", "validation-tests.json"):
        files[name] = read_exact(root / name, tree)
    for name in ("report.html", "report-data.json", "case-counts.csv", "examples.json", "build_report.py", "report-template.html", "base.css", "report.css"):
        if (root / name).is_file():
            files[name] = read_exact(root / name, tree)
    for directory in ("figures", "synthesis", "storage-review"):
        for path in sorted((root / directory).glob("*")):
            if path.is_file() and not path.name.startswith("."):
                files[path.relative_to(root).as_posix()] = read_exact(path, tree)
    relative, pinned = CONTRACTS[CONTRACT]
    files[relative] = read_exact(Path(__file__).resolve().parent / relative, Path(__file__).resolve().parent)
    manifest = {"contract": CONTRACT, "parent_snapshot": parent_snapshot,
                "input_package": {"slug": "talmud/sage-network-passage-pilot", "revision": 1},
                "validator_sha256": pinned, "cases": cases,
                "files": {name: sha(content) for name, content in sorted(files.items())},
                "status": "Provisional source research. Reviews may reject proposed graph changes. No historical graph approval."}
    if binary:
        manifest["binary_files"] = dict(sorted(binary.items()))
    if supersedes_run_id:
        manifest["supersedes_run_id"] = supersedes_run_id
    project(manifest, files)
    return manifest, files


def validate_research(con):
    existing = {row[0] for row in con.execute("SHOW TABLES").fetchall()}
    if not existing.intersection(RESEARCH_TABLES):
        return {}
    require(set(RESEARCH_TABLES) <= existing, "Partial research table schema")
    expected = {table: [] for table in RESEARCH_TABLES}
    runs = dict(con.execute("SELECT run_id, manifest_json FROM research_runs").fetchall())
    superseded = [json.loads(raw).get("supersedes_run_id") for raw in runs.values()]
    superseded = [rid for rid in superseded if rid]
    require(all(rid in runs for rid in superseded), "A research run supersedes a run that is not stored")
    require(len(superseded) == len(set(superseded)), "Two research runs supersede the same run")
    for rid, raw in runs.items():
        files = dict(con.execute("SELECT path, content FROM research_files WHERE run_id=?", [rid]).fetchall())
        rows = project(json.loads(raw), files)
        require(rows["research_runs"][0][0] == rid, "Research run ID differs")
        for table, records in rows.items():
            expected[table].extend(records)
    for table, records in expected.items():
        actual = con.execute(f'SELECT * FROM "{table}"').fetchall()
        require(sorted(actual) == sorted(records), f"Indexed research rows differ from saved files: {table}")
    return {table: len(records) for table, records in expected.items()}


def build(base, out, root, jobs, parent_snapshot, supersedes_run_id=None):
    import duckdb
    from build import file_hash, validate
    require(base.is_file() and not out.exists(), "Use an existing base and a new output")
    manifest, files = collect(root, jobs, parent_snapshot, supersedes_run_id)
    rows = project(manifest, files)
    part = out.with_name(out.name + ".part")
    if part.exists():
        part.unlink()  # left by an earlier failed build of this same output
    shutil.copyfile(base, part)
    try:
        with duckdb.connect(str(part)) as con:
            con.execute("BEGIN")
            for table, ddl in RESEARCH_TABLES.items():
                con.execute(f'CREATE TABLE IF NOT EXISTS "{table}" ({ddl})')
                for row in rows[table]:
                    old = con.execute(f'SELECT * FROM "{table}" WHERE {ddl.split()[0]}=?', [row[0]]).fetchall()
                    require(not old or old == [row], f"Research key collision: {table}")
                    if not old:
                        con.execute(f'INSERT INTO "{table}" VALUES ({",".join("?" for _ in row)})', row)
            counts = validate(con)
            con.execute("COMMIT")
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    part.rename(out)
    return {"run_id": rows["research_runs"][0][0], "base_snapshot": parent_snapshot,
            "cases": len(jobs), "new_rows": {t: len(r) for t, r in rows.items()},
            "tables": counts, "source_sha256": file_hash(out)}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--case", action="append", dest="jobs", required=True)
    parser.add_argument("--parent-snapshot", type=int, required=True)
    parser.add_argument("--supersedes-run-id")
    args = parser.parse_args()
    print(json.dumps(build(args.base, args.out, args.root, args.jobs, args.parent_snapshot, args.supersedes_run_id), indent=2))
