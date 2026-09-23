"""Read and publish the sage lake through the shared Prophex lake library."""

import argparse
import fcntl
import json
import os
import sys
from contextlib import contextmanager
from pathlib import Path

import duckdb
from prophex_lake import core, index
from prophex_lake.config import Settings

from build import file_hash, require, validate
from schema import LAKE, STORAGE_VERSION, TABLES


def guard_append_only(con, target):
    """Refuse a release that drops or changes any previously stored record."""
    for table in core.tables(con, target):
        require(table in TABLES, f"unknown existing table needs review: {table}")
        require(core.columns(con, "src", table) == core.columns(con, target, table), f"schema change needs review: {table}")
        missing = con.execute(f"SELECT count(*) FROM (SELECT * FROM {core.ident(target)}.{core.ident(table)} EXCEPT SELECT * FROM src.{core.ident(table)})").fetchone()[0]
        require(missing == 0, f"release would drop or change {missing} old rows in {table}; build from a pulled base")


def guard_research_parents(con, target, snapshot):
    """A newly published research run must name the snapshot it extends."""
    if "research_runs" not in core.tables(con, "src"):
        return
    existing = set()
    if "research_runs" in core.tables(con, target):
        existing = {row[0] for row in con.execute(f"SELECT run_id FROM {core.ident(target)}.research_runs").fetchall()}
    for run_id, parent in con.execute("SELECT run_id,parent_snapshot FROM src.research_runs").fetchall():
        if run_id not in existing:
            require(parent == snapshot, f"new research run names parent snapshot {parent}, but current snapshot is {snapshot}")


@contextmanager
def write_lock(settings):
    if settings.catalog.startswith("postgres:"):
        lock_path = os.environ.get("SAGE_LAKE_WRITE_LOCK")
        require(lock_path, "Postgres writes require SAGE_LAKE_WRITE_LOCK on the shared writer host")
        path = Path(lock_path)
    else:
        path = Path(settings.catalog.partition(":")[2]) / "sage_network.publish.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("another sage lake publish is running; retry after it finishes") from None
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def publish(path, expected_snapshot, message, settings, initialize=False):
    with write_lock(settings):
        return _publish_locked(path, expected_snapshot, message, settings, initialize)


def _publish_locked(path, expected_snapshot, message, settings, initialize=False):
    with duckdb.connect(str(path), read_only=True) as source:
        require(set(core.tables(source, source.execute("SELECT current_database()").fetchone()[0])) == set(TABLES), "release table list does not match the import contract")
        counts = validate(source)
    source_hash = file_hash(path)
    with duckdb.connect() as con:
        con.execute(f"ATTACH {core.q(str(path))} AS src (READ_ONLY)")
        target = core.attach(con, LAKE, settings, read_only=False, create=initialize)
        actual = core.current_snapshot(con, target)
        require(actual == expected_snapshot, f"lake changed: expected {expected_snapshot}, found {actual}; pull it again")
        guard_append_only(con, target)
        guard_research_parents(con, target, actual)
        result = core.push(con, LAKE, source="src", target=target, author="sage-network", message=message, extra={"source_sha256": source_hash, "storage_contract": STORAGE_VERSION, "append_only": True})
    # Export even after a no-op: a previous commit may have succeeded just before
    # its index export failed. Retrying must repair that read path.
    if settings.catalog.startswith("postgres:"):
        result["index_copy"] = index.export(LAKE, settings, log=core.log)
    return {**result, "tables": counts, "source_sha256": source_hash}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("command", choices=("push", "pull", "verify", "tables", "snapshots"))
    p.add_argument("--database", type=Path)
    p.add_argument("--snapshot", type=int)
    p.add_argument("--expected-snapshot", type=int)
    p.add_argument("--initialize", action="store_true")
    p.add_argument("--message")
    args = p.parse_args()
    require(duckdb.__version__ == "1.5.5", "Use DuckDB 1.5.5")
    settings = Settings.from_env()
    try:
        if args.command == "push":
            require(args.database and args.database.is_file(), "push requires an existing --database")
            require(args.expected_snapshot is not None and args.message, "push requires --expected-snapshot and --message")
            require(not settings.uses_index_copy, "push needs the server's writable catalog")
            require(not args.initialize or args.expected_snapshot == 0, "initialize requires --expected-snapshot 0")
            result = publish(args.database, args.expected_snapshot, args.message, settings, args.initialize)
        else:
            with duckdb.connect() as con:
                target = core.attach(con, LAKE, settings, snapshot=args.snapshot)
                snapshot = core.current_snapshot(con, target)
                if args.command == "pull":
                    require(args.database is not None and not args.database.exists(), "pull requires a new --database path")
                    args.database.parent.mkdir(parents=True, exist_ok=True)
                    result = core.pull(con, LAKE, lake_alias=target, out=args.database)
                    args.database.with_suffix(".lake.json").write_text(json.dumps(result, indent=2)+"\n")
                elif args.command == "verify":
                    require(args.database and args.database.is_file(), "verify requires an existing --database")
                    con.execute(f"ATTACH {core.q(str(args.database))} AS src (READ_ONLY)")
                    expected, actual = core.fingerprints(con, "src"), core.fingerprints(con, target)
                    differences = core.compare(expected, actual, keys=LAKE.keys)
                    require(not differences, f"lake read-back differs: {differences}")
                    result = {"snapshot": snapshot, "verified_tables": len(actual), "rows": {t: x["rows"] for t, x in actual.items()}, "differences": {}}
                elif args.command == "tables":
                    result = {"snapshot": snapshot, "tables": {t: con.execute(f"SELECT count(*) FROM {target}.{core.ident(t)}").fetchone()[0] for t in core.tables(con, target)}}
                else:
                    result = {"snapshots": con.execute(f"SELECT snapshot_id, snapshot_time::VARCHAR, commit_message FROM {target}.snapshots() ORDER BY snapshot_id").fetchall()}
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as error:
        print(settings.redact(str(error)), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
