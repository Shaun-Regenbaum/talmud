"""Verify preservation and reject damaged copies of actual source investigations."""

import copy
import json
import sys
import tempfile
from pathlib import Path

import duckdb

from followup_store import CONTRACTS, collect, project, read_exact, validate_research
from pilot_store import sha


def main():
    root = Path(__file__).resolve().parent.parent / "followup-v1"
    base, release = map(Path, sys.argv[1:3])
    checks = []
    jobs = sorted(p.parent.name for p in (root / "cases").glob("*/completion.json"))
    manifest, files = collect(root, jobs, 2)
    project(manifest, files)
    checks.append(f"Real {len(jobs)}-case projection passes")

    def reject(name, change, phrase):
        m, f = copy.deepcopy(manifest), copy.deepcopy(files)
        change(m, f)
        try:
            project(m, f)
        except ValueError as error:
            assert phrase in str(error), (name, str(error))
        else:
            raise AssertionError(f"Damage was accepted: {name}")
        checks.append(name)

    def change_dossier(m, f, jid, mutate):
        item = next(c for c in m["cases"] if c["job_id"] == jid)
        path = item["dossier"]
        d = json.loads(f[path])
        mutate(d)
        f[path] = json.dumps(d, ensure_ascii=False)
        m["files"][path] = sha(f[path])

    reject("Changed source file rejected", lambda m, f: f.__setitem__(m["cases"][0]["source_files"]["S1"], "damaged test copy"), "Research file hash differs")
    reject("Missing source file rejected", lambda m, f: f.pop(m["cases"][0]["source_files"]["S1"]), "Research file list differs")
    reject("Changed quote with updated dossier hash rejected", lambda m, f: change_dossier(m, f, "challenge-09", lambda d: d["findings"][0]["evidence"][0].update(exact_quote="DELIBERATELY DAMAGED TEST QUOTATION")), "Quotation not found")
    reject("Wrong occurrence offset rejected", lambda m, f: change_dossier(m, f, "random-yerushalmi-02", lambda d: d["findings"][0]["evidence"][0].update(start=0)), "Declared quote offsets differ")
    reject("Wrong quotation count rejected", lambda m, f: change_dossier(m, f, "random-yerushalmi-02", lambda d: d["findings"][0]["evidence"][0].update(occurrences_in_segment=999)), "Declared quotation count differs")

    def change_review(m, f, field, value):
        path = m["cases"][0]["review"]
        review = json.loads(f[path])
        review[field] = value
        f[path] = json.dumps(review)
        m["files"][path] = sha(f[path])
    reject("Review of different dossier rejected", lambda m, f: change_review(m, f, "dossier_sha256", "0"*64), "Review is for different dossier bytes")
    reject("Historical approval rejected", lambda m, f: change_review(m, f, "historical_graph_eligible", True), "cannot approve a historical graph")
    reject("Widened review status rejected", lambda m, f: change_review(m, f, "status", "approved_for_graph"), "Unknown research review status")
    reject("Unknown review authority rejected", lambda m, f: change_review(m, f, "authority", "anyone"), "Unknown research review authority")
    reject("Absolute source path rejected", lambda m, f: change_dossier(m, f, m["cases"][0]["job_id"], lambda d: d["sources"][0].update(saved_file="/tmp/DELIBERATELY-DAMAGED-TEST-PATH.json")), "must be a relative path")
    reject("One-character quotation rejected", lambda m, f: change_dossier(m, f, m["cases"][0]["job_id"], lambda d: d["findings"][0]["evidence"][0].update(exact_quote=next(ch for ch in f[m["cases"][0]["source_files"][d["findings"][0]["evidence"][0]["source_id"]]] if not ch.isspace()))), "too short")

    def unlink_review(m, f):
        m["cases"][0].pop("review")
    reject("Unlinked review rejected", unlink_review, "review linkage differs")

    def stale_completion(m, f):
        path = f"cases/{m['cases'][0]['job_id']}/completion.json"
        c = json.loads(f[path])
        c["files"]["reading.md"] = "0" * 64
        f[path] = json.dumps(c)
        m["files"][path] = sha(f[path])
    reject("Stale completion record rejected", stale_completion, "Completed research file differs")

    relative, pinned = CONTRACTS[manifest["contract"]]
    def edited_checker(m, f):
        f[relative] = f[relative] + "\n# DELIBERATELY DAMAGED TEST COPY\n"
        m["files"][relative] = sha(f[relative])
    reject("Edited stored checker rejected", edited_checker, "Stored checker differs")
    reject("Changed checker pin rejected", lambda m, f: m.__setitem__("validator_sha256", "0"*64), "Research validator differs")
    reject("Malformed superseded run rejected", lambda m, f: m.__setitem__("supersedes_run_id", "short"), "Invalid superseded research run")

    def damaged_binary(m, f):
        # Use a stored image if one exists; otherwise add a labelled test image to a copy.
        path = next(iter(m.get("binary_files", {})), None)
        if path is None:
            import base64, hashlib
            path = f"cases/{m['cases'][0]['job_id']}/work/TEST-DAMAGE.png"
            raw = b"\x89PNG\r\n\x1a\nTEST DAMAGE COPY"
            f[path] = base64.b64encode(raw).decode()
            m.setdefault("binary_files", {})[path] = hashlib.sha256(raw).hexdigest()
        import base64
        f[path] = base64.b64encode(base64.b64decode(f[path]) + b"DAMAGED").decode()
        m["files"][path] = sha(f[path])
    reject("Changed image bytes rejected", damaged_binary, "Binary research file differs")

    import importlib.util
    spec = importlib.util.spec_from_file_location("frozen_checker", Path(__file__).resolve().parent / relative)
    frozen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(frozen)
    assert frozen.quote_matches(b"\xff\xd8\xff\xe0 binary image bytes", "any words")["mode"] == "not_found"
    checks.append("A quotation cited from an image is reported as not found, not a crash")

    with tempfile.TemporaryDirectory() as directory:
        tree = Path(directory).resolve()
        (tree / "real.txt").write_text("test file")
        (tree / "link.txt").symlink_to(tree / "real.txt")
        (tree / "crlf.txt").write_bytes(b"line one\r\nline two\r\n")
        (tree / "legacy.txt").write_bytes("\u05e9\u05dc\u05d5\u05dd".encode("cp1255"))
        try:
            read_exact(tree / "link.txt", tree)
        except ValueError as error:
            assert "Linked file refused" in str(error)
        else:
            raise AssertionError("A linked file was read")
        assert read_exact(tree / "crlf.txt", tree).encode() == (tree / "crlf.txt").read_bytes()
        try:
            read_exact(tree / "legacy.txt", tree)
        except ValueError as error:
            assert "not UTF-8" in str(error)
        else:
            raise AssertionError("Non-UTF-8 text was accepted")
        checks.append("Linked files refused, line endings kept byte for byte, non-UTF-8 text refused")

    with duckdb.connect(str(release)) as con:
        quoted_base = "'" + str(base).replace("'", "''") + "'"
        con.execute(f"ATTACH {quoted_base} AS old (READ_ONLY)")
        old_tables = [r[0] for r in con.execute("SELECT table_name FROM information_schema.tables WHERE table_catalog='old'").fetchall()]
        for table in old_tables:
            for left, right in ((f'old."{table}"', f'main."{table}"'), (f'main."{table}"', f'old."{table}"')):
                assert con.execute(f"SELECT count(*) FROM (SELECT * FROM {left} EXCEPT SELECT * FROM {right})").fetchone()[0] == 0, table
        checks.append(f"All fields in the {len(old_tables)} earlier tables are unchanged")
        validate_research(con)
        checks.append("All stored research rows rebuild from saved files")
        con.execute("BEGIN")
        con.execute("UPDATE research_findings SET claim='DELIBERATELY DAMAGED TEST COPY' WHERE finding_id=(SELECT finding_id FROM research_findings LIMIT 1)")
        try:
            validate_research(con)
        except ValueError as error:
            assert "Indexed research rows differ" in str(error)
            checks.append("Changed indexed finding rejected")
        else:
            raise AssertionError("Changed indexed finding was accepted")
        finally:
            con.execute("ROLLBACK")
        orphan = dict(manifest, supersedes_run_id="f" * 64)
        rows = project(orphan, files)
        con.execute("BEGIN")
        try:
            con.execute("INSERT INTO research_runs VALUES (?,?,?,?)", rows["research_runs"][0])
            try:
                validate_research(con)
            except ValueError as error:
                assert "supersedes a run that is not stored" in str(error), str(error)
                checks.append("Run superseding a missing run rejected")
            else:
                raise AssertionError("A run superseding a missing run was accepted")
        finally:
            con.execute("ROLLBACK")
        with tempfile.TemporaryDirectory() as directory:
            for name, content in files.items():
                path = Path(directory) / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content.encode())
            restored = {name: (Path(directory) / name).read_bytes().decode() for name in files}
            assert project(manifest, restored) == project(manifest, files)
            checks.append("Restored files reproduce the same indexed records")
    report = {"passed_checks": len(checks), "checks": checks,
              "note": "Damage tests use temporary copies of actual research. They do not create research evidence. Structural checks do not approve interpretations."}
    (root / "storage-tests.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
