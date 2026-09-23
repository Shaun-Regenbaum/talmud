"""Restore a fixed source investigation and its source-file map from the lake."""

import argparse
import hashlib
import json
from pathlib import Path

import duckdb

from followup_store import validate_research


def restore(database, run_id, out):
    out = out.resolve()
    with duckdb.connect(str(database), read_only=True) as con:
        validate_research(con)
        runs = con.execute("SELECT manifest_json FROM research_runs WHERE run_id=?", [run_id]).fetchall()
        if len(runs) != 1:
            raise ValueError("No unique research run with that ID")
        manifest = json.loads(runs[0][0])
        rows = con.execute("SELECT path,sha256,content FROM research_files WHERE run_id=? ORDER BY path", [run_id]).fetchall()
    if len(rows) != len(manifest["files"]):
        raise ValueError("Saved file count differs from the manifest")
    from followup_store import raw_bytes
    output = {relative: raw_bytes(manifest, relative, content) for relative, _, content in rows}
    if "manifest.json" in output:
        raise ValueError("Research file conflicts with the restore manifest")
    output["manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    for relative, checksum, content in rows:
        if hashlib.sha256(content.encode()).hexdigest() != checksum:
            raise ValueError(f"Saved hash differs: {relative}")
    for relative, raw in output.items():
        path = (out / relative).resolve()
        if not path.is_relative_to(out) or Path(relative).is_absolute() or ".." in Path(relative).parts:
            raise ValueError(f"Unsafe saved path: {relative}")
        if path.exists() and path.read_bytes() != raw:
            raise ValueError(f"Refusing to replace a different file: {relative}")
        if path.with_name(path.name + ".part").exists():
            raise ValueError(f"Unfinished restore file already exists: {relative}")
    for relative, raw in output.items():
        path = out / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            part = path.with_name(path.name + ".part")
            with part.open("xb") as stream:
                stream.write(raw)
            part.replace(path)
    return {"run_id": run_id, "restored_files": len(rows), "manifest": str(out / "manifest.json")}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(restore(args.database, args.run_id, args.out)))
