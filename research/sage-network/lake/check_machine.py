"""Verify a machine reading release and reject damaged copies of it.

usage: check_machine.py BASE RELEASE
BASE is the pulled snapshot the release was built on. RELEASE is the built database.
Every damage check edits a temporary copy of RELEASE and expects `validate_machine` to refuse it.
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

import duckdb

from machine_store import MACHINE_TABLES, validate_machine
from pilot_store import encoded, sha


def main():
    base, release = map(Path, sys.argv[1:3])
    checks = []
    with duckdb.connect(str(release), read_only=True) as con:
        counts = validate_machine(con)
        checks.append(f"Release validates: {counts}")
    with duckdb.connect(str(release), read_only=True) as con:
        con.execute(f"ATTACH '{base}' AS old_snapshot (READ_ONLY)")
        tables = [t[0] for t in con.execute("SELECT table_name FROM duckdb_tables() WHERE database_name = 'old_snapshot'").fetchall()]
        for table in tables:
            lost = con.execute(f'SELECT count(*) FROM (SELECT * FROM old_snapshot."{table}" EXCEPT SELECT * FROM main."{table}")').fetchone()[0]
            assert lost == 0, f"{table}: {lost} earlier rows are missing or changed"
        checks.append(f"All {len(tables)} earlier tables keep every earlier row exactly")

    def damaged(name, sql, phrase):
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "copy.duckdb"
            shutil.copyfile(release, copy)
            with duckdb.connect(str(copy)) as con:
                con.execute(sql)
                try:
                    validate_machine(con)
                except ValueError as error:
                    assert phrase in str(error), (name, str(error))
                else:
                    raise AssertionError(f"Damage was accepted: {name}")
        checks.append(name)

    damaged("An answer changed without its hash", "UPDATE machine_readings SET answer_json = replace(answer_json, 'p1', 'p9') WHERE reading_id = (SELECT reading_id FROM machine_readings WHERE status = 'valid' LIMIT 1)", "differs from its hash")
    damaged("A reading's counts changed", "UPDATE machine_readings SET people_listed = people_listed + 1 WHERE reading_id = (SELECT reading_id FROM machine_readings WHERE status = 'valid' LIMIT 1)", "counts differ")
    damaged("A reading marked reviewed", "UPDATE machine_readings SET review_status = 'reviewed' WHERE reading_id = (SELECT reading_id FROM machine_readings LIMIT 1)", "unexpected status")
    damaged("A check names an item the answer does not have", "UPDATE machine_checks SET item_id = 'p999' WHERE check_id = (SELECT check_id FROM machine_checks WHERE item_kind = 'person' LIMIT 1)", "names an item or verdict")
    damaged("A check has a verdict of the other kind", "UPDATE machine_checks SET verdict = 'unsupported' WHERE check_id = (SELECT check_id FROM machine_checks WHERE item_kind = 'person' LIMIT 1)", "names an item or verdict")
    damaged("A check by the reader's own family", "UPDATE machine_checks SET checker_family = reader_family WHERE check_id = (SELECT check_id FROM machine_checks LIMIT 1)", "not a check by the other family")
    damaged("A check of an invalid reading", "UPDATE machine_readings SET status = 'invalid' WHERE reading_id = (SELECT reading_id FROM machine_checks LIMIT 1)", "not valid")
    damaged("A release of a missing reading", "UPDATE machine_releases SET reading_id = 'missing' WHERE release_id = (SELECT release_id FROM machine_releases LIMIT 1)", "name a missing reading")
    damaged("A release to an unknown environment", "UPDATE machine_releases SET environment = 'elsewhere' WHERE release_id = (SELECT release_id FROM machine_releases LIMIT 1)", "unknown environment")
    damaged("A run ID that differs from its manifest", "UPDATE machine_runs SET manifest_json = replace(manifest_json, 'machine-reading-v1', 'machine-reading-v2')", "differs from its manifest")
    damaged("A reading that names a missing run", "UPDATE machine_readings SET run_id = 'missing' WHERE reading_id = (SELECT reading_id FROM machine_readings LIMIT 1)", "name a missing run")
    print(json.dumps({"checks": checks}, indent=2))


if __name__ == "__main__":
    main()
