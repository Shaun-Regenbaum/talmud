"""Compile source readings, or run a bounded external JSON reader and compile it."""

import argparse
import atexit
import concurrent.futures
import fcntl
import hashlib
import json
import os
import signal
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

from validate import canonical, check, sha

ROOT = Path(__file__).resolve().parent
LIVE = set()
LOCK = threading.Lock()


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_suffix(path.suffix + ".part")
    part.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    part.replace(path)


def stop_children():
    with LOCK:
        for proc in list(LIVE):
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def interrupted(signum, frame):
    stop_children()
    raise SystemExit(128 + signum)


def file_sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_attempt(jid, stdout, stderr, returncode, timed_out):
    """Transport logs are private diagnostics and never part of the publication."""
    record = {"stdout": stdout, "stderr": stderr, "returncode": returncode,
              "timed_out": timed_out, "finished_at": datetime.now(timezone.utc).isoformat()}
    path = ROOT / "attempts" / jid / f"{sha(canonical(record))}.transport.json"
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Create with private permissions before any diagnostic bytes reach disk.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return path


def recipe():
    return {name: file_sha(ROOT / name) for name in ("reader.md", "contract.py", "schema.json", "validate.py")}


def process(item, command, timeout, recipe_hashes, execution_label):
    jid = item["job_id"]
    job_path, output_path = ROOT / "inputs" / f"{jid}.json", ROOT / "outputs" / f"{jid}.json"
    compiled_path = ROOT / "compiled" / f"{jid}.json"
    status = {"job_id": jid, "checked_at": datetime.now(timezone.utc).isoformat()}
    try:
        if file_sha(job_path) != item["input_sha256"]:
            raise ValueError("frozen input hash differs")
        job = json.loads(job_path.read_text())
        if compiled_path.exists():
            old = json.loads(compiled_path.read_text())
            check(job, old["record"])
            if old["input_sha256"] != item["input_sha256"] or old["recipe_hashes"] != recipe_hashes:
                raise ValueError("compiled reading uses a different input or recipe; make a new run")
            if not output_path.exists() or old["output_sha256"] != file_sha(output_path):
                raise ValueError("raw output changed after compilation; preserve it as a new revision")
            if canonical(check(job, json.loads(output_path.read_text()))) != canonical({"record": old["record"], "resolved_anchors": old["resolved_anchors"]}):
                raise ValueError("compiled record differs from raw output")
            return {**status, "status": "resumed", "claims": len(old["record"]["claims"])}
        if command and not output_path.exists():
            payload = {"instructions": (ROOT / "reader.md").read_text(), "schema": json.loads((ROOT / "schema.json").read_text()), "job": job}
            with subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  text=True, start_new_session=True) as proc:
                with LOCK:
                    LIVE.add(proc)
                timed_out = False
                try:
                    stdout, stderr = proc.communicate(canonical(payload), timeout=timeout)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    stdout, stderr = proc.communicate()
                    timed_out = True
                finally:
                    with LOCK:
                        LIVE.discard(proc)
                attempt_log = save_attempt(jid, stdout, stderr, proc.returncode, timed_out)
                if timed_out:
                    raise TimeoutError(f"reader exceeded {timeout}s; private log: {attempt_log}")
                if proc.returncode:
                    raise ValueError(f"reader exited {proc.returncode}; private log: {attempt_log}")
                # Keep the actual response even when JSON parsing or validation fails.
                attempt_path = ROOT / "attempts" / jid / f"{sha(stdout)}.txt"
                attempt_path.parent.mkdir(parents=True, exist_ok=True)
                attempt_path.write_text(stdout)
                result = json.loads(stdout)
                check(job, result)
                atomic(output_path, result)
        if not output_path.exists():
            raise FileNotFoundError("reading has not been saved")
        raw = output_path.read_text()
        attempt_path = ROOT / "attempts" / jid / f"{sha(raw)}.json"
        attempt_path.parent.mkdir(parents=True, exist_ok=True)
        attempt_path.write_text(raw)
        compiled = check(job, json.loads(raw))
        atomic(compiled_path, {**compiled, "input_sha256": item["input_sha256"], "output_sha256": sha(raw),
                               "recipe_hashes": recipe_hashes, "execution": execution_label,
                               "validation": "structural_only", "compiled_at": status["checked_at"]})
        return {**status, "status": "compiled", "claims": len(compiled["record"]["claims"])}
    except Exception as error:
        return {**status, "status": "failed", "error_type": type(error).__name__, "reason": str(error)}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--reader-command-json", help="JSON array of command arguments; no shell interpolation")
    p.add_argument("--execution-label", default="parallel independent passage reading")
    p.add_argument("--timeout", type=int, default=600)
    p.add_argument("--workers", type=int, choices=range(1, 5), default=2)
    p.add_argument("--job", action="append")
    args = p.parse_args()
    if args.timeout < 1:
        p.error("timeout must be positive")
    command = json.loads(args.reader_command_json) if args.reader_command_json else None
    if command is not None and (not isinstance(command, list) or not command or any(not isinstance(x, str) for x in command)):
        p.error("reader-command-json must be a nonempty array of strings")
    manifest = json.loads((ROOT / "manifest.json").read_text())
    jobs = [j for j in manifest["jobs"] if not args.job or j["job_id"] in args.job]
    if args.job and set(args.job) != {j["job_id"] for j in jobs}:
        p.error("unknown job")
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, interrupted)
    atexit.register(stop_children)
    with (ROOT / ".run.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        hashes, rows = recipe(), []
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            waiting = iter(jobs)
            active = {}
            def submit():
                item = next(waiting, None)
                if item:
                    active[pool.submit(process, item, command, args.timeout, hashes, args.execution_label)] = item["job_id"]
            for _ in range(args.workers):
                submit()
            while active:
                done, _ = concurrent.futures.wait(active, return_when=concurrent.futures.FIRST_COMPLETED)
                for future in done:
                    active.pop(future)
                    row = future.result()
                    rows.append(row)
                    atomic(ROOT / "status" / f"{row['job_id']}.json", row)
                    print(json.dumps(row, ensure_ascii=False), flush=True)
                    submit()
        summary = {"manifest_sha256": file_sha(ROOT / "manifest.json"), "recipe_hashes": hashes,
                   "jobs": sorted(rows, key=lambda x: x["job_id"]),
                   "complete": all(r["status"] != "failed" for r in rows)}
        atomic(ROOT / "run-check.json", summary)
        return 0 if summary["complete"] else 1


if __name__ == "__main__":
    sys.exit(main())
