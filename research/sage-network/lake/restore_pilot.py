"""Restore a fixed pilot's files from a pulled lake version, checking every hash."""

import argparse
import hashlib
from pathlib import Path

import duckdb


def restore(database, run_id, out):
    out = out.resolve()
    with duckdb.connect(str(database), read_only=True) as con:
        rows = con.execute("SELECT path,sha256,content FROM extraction_files WHERE run_id=? ORDER BY path", [run_id]).fetchall()
    if not rows:
        raise ValueError("No files for that run in this database")
    for relative, checksum, content in rows:
        path = (out / relative).resolve()
        if not path.is_relative_to(out) or Path(relative).is_absolute():
            raise ValueError(f"Unsafe saved path: {relative}")
        raw = content.encode()
        if hashlib.sha256(raw).hexdigest() != checksum:
            raise ValueError(f"Saved hash differs: {relative}")
        if path.exists() and path.read_bytes() != raw:
            raise ValueError(f"Refusing to replace a different file: {path}")
    for relative, checksum, content in rows:
        path = out / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            part = path.with_name(path.name + ".part")
            with part.open("xb") as stream:
                stream.write(content.encode())
            part.replace(path)
    return {"run_id": run_id, "restored_files": len(rows)}


if __name__ == "__main__":
    import json
    p = argparse.ArgumentParser()
    p.add_argument("--database", required=True, type=Path)
    p.add_argument("--run-id", required=True)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()
    print(json.dumps(restore(args.database, args.run_id, args.out)))
