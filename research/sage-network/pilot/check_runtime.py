"""Transport and storage regressions using temporary copies of real readings.

These are software checks, not research measurements. No source text is invented.
Damaged records and external-reader diagnostics stay in temporary directories.
"""

import atexit
import contextlib
import copy
import io
import json
import os
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

import run
from validate import Invalid, check

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "lake"))
import pilot_store

RECIPE_FILES = ("reader.md", "contract.py", "schema.json", "validate.py")
DIAGNOSTIC = "Transport regression diagnostic; not research data.\n"
READER = """
import json, os, pathlib, subprocess, sys, time
payload = json.load(sys.stdin)
response, mode, pid_path = sys.argv[1:]
assert payload['job']['job_id'] == json.loads(pathlib.Path(response).read_text())['job_id']
sys.stdout.write(pathlib.Path(response).read_text())
sys.stdout.flush()
sys.stderr.write('Transport regression diagnostic; not research data.\\n')
sys.stderr.flush()
if mode == 'nonzero':
    sys.exit(7)
if mode == 'timeout':
    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
    pathlib.Path(pid_path).write_text(json.dumps([os.getpid(), child.pid]))
    time.sleep(60)
"""


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def stage(root, items, with_outputs=False):
    root.mkdir(parents=True)
    for name in RECIPE_FILES:
        shutil.copyfile(ROOT / name, root / name)
    for item in items:
        jid = item["job_id"]
        for folder in ("inputs", "outputs") if with_outputs else ("inputs",):
            (root / folder).mkdir(exist_ok=True)
            shutil.copyfile(ROOT / folder / f"{jid}.json", root / folder / f"{jid}.json")
    return root


def transport(root, item, mode):
    fixture = root / "response.json"
    shutil.copyfile(ROOT / "outputs" / f"{item['job_id']}.json", fixture)
    command = [sys.executable, "-c", READER, str(fixture), mode, str(root / "pids.json")]
    with patch.object(run, "ROOT", root):
        row = run.process(item, command, 2, run.recipe(), "temporary transport regression")
    logs = list((root / "attempts" / item["job_id"]).glob("*.transport.json"))
    require(len(logs) == 1, "external attempt must save one transport log")
    log = json.loads(logs[0].read_text())
    require(log["stdout"] == fixture.read_text(), "transport log lost or changed stdout")
    require(log["stderr"] == DIAGNOSTIC, "transport log lost or changed stderr")
    require(stat.S_IMODE(logs[0].stat().st_mode) == 0o600, "transport log is not private")
    require(not run.LIVE, "finished external reader remains in live-process registry")
    return row, log


def process_running(pid):
    result = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True, check=False)
    require(result.returncode in (0, 1), "could not inspect timed-out process")
    state = result.stdout.strip()
    return bool(state) and not state.startswith("Z")


def check_stopped(root):
    pids = json.loads((root / "pids.json").read_text())
    require(len(pids) == 2, "timeout reader did not record its child process")
    deadline = time.monotonic() + 3
    while any(process_running(pid) for pid in pids) and time.monotonic() < deadline:
        time.sleep(0.05)
    require(not any(process_running(pid) for pid in pids), "timed-out reader or descendant is still alive")


def cleanup_timeout(root):
    path = root / "pids.json"
    if path.exists():
        for pid in json.loads(path.read_text()):
            if process_running(pid):
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass


def storage_files(item, manifest, packs):
    """Select one real challenge job and only the packs belonging to it."""
    jid = item["job_id"]
    selected = copy.deepcopy(manifest)
    selected["jobs"] = [copy.deepcopy(item)]
    files = {"manifest.json": json.dumps(selected, ensure_ascii=False)}
    for name in (*RECIPE_FILES, f"inputs/{jid}.json", f"outputs/{jid}.json", f"compiled/{jid}.json"):
        files[name] = (ROOT / name).read_text()
    selected_packs = copy.deepcopy(packs)
    selected_packs["packs"] = [p for p in selected_packs["packs"] if p["job_id"] == jid]
    ids = {p["id"] for p in selected_packs["packs"]}
    selected_packs["decisions"] = [d for d in selected_packs["decisions"] if d["pack_id"] in ids]
    files["evidence-packs.json"] = json.dumps(selected_packs, ensure_ascii=False)
    return files


def projected(files):
    manifest = {"version": "runtime-check-not-research-data", "files": {p: pilot_store.sha(t) for p, t in files.items()}}
    return pilot_store.project(manifest, files)


def refuses(fn, expected):
    try:
        fn()
    except (ValueError, Invalid) as error:
        require(expected in str(error), f"expected rejection {expected}; got {type(error).__name__}: {error}")
    else:
        raise AssertionError(f"damaged record was accepted: {expected}")


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    packs = json.loads((ROOT / "evidence-packs.json").read_text())
    pack_jobs = {p["job_id"] for p in packs["packs"]}
    item = next(j for j in manifest["jobs"] if j["job_id"] in pack_jobs)
    other = next(j for j in manifest["jobs"] if j["job_id"] != item["job_id"] and j["job_id"].startswith("challenge-"))
    jid = item["job_id"]
    checks = []

    def passed(name):
        checks.append({"check": name, "passed": True})

    with tempfile.TemporaryDirectory(prefix="passage-runtime-check-") as directory:
        temporary = Path(directory)
        success = stage(temporary / "success", [item])
        row, log = transport(success, item, "success")
        require(row["status"] == "compiled" and log["returncode"] == 0 and log["timed_out"] is False, "external success did not compile")
        checked = check(json.loads((success / "inputs" / f"{jid}.json").read_text()), json.loads((success / "outputs" / f"{jid}.json").read_text()))
        compiled_path = success / "compiled" / f"{jid}.json"
        compiled = json.loads(compiled_path.read_text())
        require(checked == {"record": compiled["record"], "resolved_anchors": compiled["resolved_anchors"]}, "compiled success differs from validation")
        passed("external_success_preserves_streams_and_compiles")
        original = {p: p.read_bytes() for p in (compiled_path, success / "outputs" / f"{jid}.json")}
        with patch.object(run, "ROOT", success):
            resumed = run.process(item, ["/nonexistent-reader-must-not-run"], 2, run.recipe(), "resume regression")
        require(resumed["status"] == "resumed", "unchanged reading failed to resume")
        require(all(p.read_bytes() == data for p, data in original.items()), "resume changed a saved reading")
        passed("resume_does_not_rerun_or_rewrite")

        damaged = copy.deepcopy(compiled)
        damaged["record"]["episode"]["notes"].append("Temporary corruption check, not research data.")
        write(compiled_path, damaged)
        with patch.object(run, "ROOT", success):
            rejected = run.process(item, None, 2, run.recipe(), "corruption regression")
        require(rejected["status"] == "failed" and "compiled record differs from raw output" in rejected["reason"], "corrupt compiled record resumed")
        require((success / "outputs" / f"{jid}.json").read_bytes() == original[success / "outputs" / f"{jid}.json"], "compiled rejection changed raw output")
        passed("resume_rejects_compiled_record_changed_against_raw")
        compiled_path.write_bytes(original[compiled_path])
        raw_path = success / "outputs" / f"{jid}.json"
        raw_path.write_bytes(original[raw_path] + b"\n")
        with patch.object(run, "ROOT", success):
            rejected = run.process(item, None, 2, run.recipe(), "raw corruption regression")
        require(rejected["status"] == "failed" and "raw output changed" in rejected["reason"], "changed raw bytes resumed")
        passed("resume_rejects_changed_raw_bytes")

        failure = stage(temporary / "nonzero", [item])
        row, log = transport(failure, item, "nonzero")
        require(row["status"] == "failed" and log["returncode"] == 7 and log["timed_out"] is False, "nonzero status was lost")
        require(not (failure / "compiled" / f"{jid}.json").exists() and not (failure / "outputs" / f"{jid}.json").exists(), "failed reader created an accepted output")
        passed("nonzero_exit_keeps_private_streams_and_status")

        timeout = stage(temporary / "timeout", [item])
        try:
            row, log = transport(timeout, item, "timeout")
            require(row["status"] == "failed" and row["error_type"] == "TimeoutError" and log["timed_out"] is True and log["returncode"] == -signal.SIGKILL, "timeout status was lost")
            require(not (timeout / "outputs" / f"{jid}.json").exists(), "timed-out reader created an accepted output")
            check_stopped(timeout)
            passed("timeout_preserves_private_streams_and_kills_process_group")
        finally:
            cleanup_timeout(timeout)

        mixed = stage(temporary / "mixed", [item, other], with_outputs=True)
        good_output = mixed / "outputs" / f"{jid}.json"
        preserved = good_output.read_bytes()
        bad_output = mixed / "outputs" / f"{other['job_id']}.json"
        bad_output.write_text("{")
        selected = copy.deepcopy(manifest)
        selected["jobs"] = [item, other]
        write(mixed / "manifest.json", selected)
        handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
        try:
            with patch.object(run, "ROOT", mixed), patch.object(sys, "argv", ["run.py", "--workers", "2"]), contextlib.redirect_stdout(io.StringIO()):
                status = run.main()
        finally:
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
            atexit.unregister(run.stop_children)
        summary = json.loads((mixed / "run-check.json").read_text())
        states = {r["job_id"]: r["status"] for r in summary["jobs"]}
        require(status == 1 and summary["complete"] is False, "mixed batch falsely reported success")
        require(states == {jid: "compiled", other["job_id"]: "failed"}, "failed job stopped the valid job")
        require(good_output.read_bytes() == preserved and (mixed / "compiled" / f"{jid}.json").exists(), "failed job erased good output")
        require(not (mixed / "compiled" / f"{other['job_id']}.json").exists(), "invalid job was compiled")
        passed("one_failed_job_preserves_successful_job_and_fails_batch")

        files = storage_files(item, manifest, packs)
        rows = projected(files)
        require(len(rows["extraction_readings"]) == 1 and rows["extraction_claims"], "real storage fixture failed")
        passed("storage_accepts_actual_challenge_reading_and_applicable_packs")
        dangling = dict(files)
        record = json.loads(dangling[f"outputs/{jid}.json"])
        record["claims"][0]["roles"].append({"role": "addressee", "entity": "__missing_runtime_check__"})
        altered = json.loads(dangling[f"compiled/{jid}.json"])
        altered["record"] = record
        dangling[f"outputs/{jid}.json"] = json.dumps(record, ensure_ascii=False)
        altered["output_sha256"] = pilot_store.sha(dangling[f"outputs/{jid}.json"])
        dangling[f"compiled/{jid}.json"] = json.dumps(altered, ensure_ascii=False)
        refuses(lambda: projected(dangling), "entity_reference")
        passed("storage_rejects_dangling_role_after_refreshing_all_hashes")

        bad_anchors = dict(files)
        altered = json.loads(bad_anchors[f"compiled/{jid}.json"])
        sources = {s["source_id"]: s["text"] for s in json.loads(files[f"inputs/{jid}.json"])["sources"]}
        moved = False
        for anchor in altered["resolved_anchors"]:
            text = sources[anchor["source_id"]]
            start = text.find(anchor["quote"])
            while start >= 0:
                if start != anchor["start"]:
                    anchor["start"], anchor["end"] = start, start + len(anchor["quote"])
                    moved = True
                    break
                start = text.find(anchor["quote"], start + 1)
            if moved:
                break
        require(moved, "real challenge fixture needs a repeated quote for the occurrence check")
        bad_anchors[f"compiled/{jid}.json"] = json.dumps(altered, ensure_ascii=False)
        refuses(lambda: projected(bad_anchors), "compiled evidence differs from full validation")
        passed("storage_rejects_wrong_quote_occurrence_with_matching_text_span")

    result = {"status": "passed", "scope": "Software transport and storage checks only; not research data or semantic validation.", "source_jobs": [jid, other["job_id"]], "checks": checks}
    run.atomic(ROOT / "runtime-checks.json", result)
    print(json.dumps({"status": result["status"], "checks": len(checks)}))


if __name__ == "__main__":
    main()
