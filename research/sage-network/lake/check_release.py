"""Check a real release, including refusal of damaged copies and stale writes."""

import argparse
import json
import shutil
import tempfile
from pathlib import Path

import duckdb
from prophex_lake import core
from prophex_lake.config import Settings

from build import require, validate
from manage import guard_append_only, publish, write_lock
from schema import LAKE


def refuses(fn, message):
    try:
        fn()
    except ValueError as error:
        require(message in str(error), f"wrong refusal: {error}")
    else:
        raise ValueError(f"missing refusal: {message}")


def check(path):
    with tempfile.TemporaryDirectory(prefix="sage-lake-check-") as name:
        root = Path(name)
        copied = root / "copy.duckdb"
        shutil.copyfile(path, copied)
        with duckdb.connect(str(copied)) as con:
            counts = validate(con)
            con.execute("BEGIN")
            con.execute("DELETE FROM source_segments WHERE segment_id=(SELECT min(segment_id) FROM source_segments)")
            refuses(lambda: validate(con), "incomplete segment lists")
            con.execute("ROLLBACK")
            con.execute("BEGIN")
            con.execute("UPDATE source_segments SET ref=(SELECT max(ref) FROM source_segments) WHERE segment_id=(SELECT min(segment_id) FROM source_segments)")
            refuses(lambda: validate(con), "differ from their saved source unit")
            con.execute("ROLLBACK")
            con.execute("BEGIN")
            con.execute("UPDATE review_sources SET text=substring(text,2) WHERE review_source_id=(SELECT min(review_source_id) FROM review_sources)")
            refuses(lambda: validate(con), "hash mismatches")
            con.execute("ROLLBACK")
            con.execute("BEGIN")
            con.execute("UPDATE review_claims SET subject=object WHERE claim_id=(SELECT min(claim_id) FROM review_claims WHERE subject != object)")
            refuses(lambda: validate(con), "subject values differ")
            con.execute("ROLLBACK")
            con.execute("BEGIN")
            con.execute("DELETE FROM review_claim_sources WHERE claim_id=(SELECT min(claim_id) FROM review_claims)")
            con.execute("DELETE FROM review_claims WHERE claim_id=(SELECT min(claim_id) FROM review_claims)")
            refuses(lambda: validate(con), "review_claims differ from their original case")
            con.execute("ROLLBACK")
            con.execute("BEGIN")
            con.execute("UPDATE review_claim_sources SET start_offset=start_offset+1 WHERE link_id=(SELECT min(link_id) FROM review_claim_sources)")
            refuses(lambda: validate(con), "wrong evidence spans")
            con.execute("ROLLBACK")
        settings = Settings(f"duckdb:{root / 'catalog'}", str(root / "files"), None, None, "unused")
        first = publish(path, 0, "Check a real release locally", settings, initialize=True)
        again = publish(path, first["snapshot"], "Check an unchanged release", settings)
        require(again.get("unchanged") is True, "unchanged release made a new version")
        with write_lock(settings):
            refuses(lambda: publish(path, first["snapshot"], "Concurrent write must fail", settings), "another sage lake publish")
        refuses(lambda: publish(path, 0, "Stale write must fail", settings), "lake changed")
        with duckdb.connect(str(copied)) as con:
            con.execute("DELETE FROM legacy_pairs WHERE record_id=(SELECT min(record_id) FROM legacy_pairs)")
        refuses(lambda: publish(copied, first["snapshot"], "Missing old row must fail", settings), "input file counts or hashes differ")
        with duckdb.connect() as con:
            alias = core.attach(con, LAKE, settings, snapshot=first["snapshot"])
            con.execute(f"ATTACH {core.q(str(copied))} AS src (READ_ONLY)")
            refuses(lambda: guard_append_only(con, alias), "would drop or change")
            restored = root / "restored.duckdb"
            result = core.pull(con, LAKE, lake_alias=alias, out=restored)
        with duckdb.connect(str(restored), read_only=True) as con:
            require(validate(con) == counts, "restored row counts differ")
        return {"tables_checked": counts, "local_snapshot": first["snapshot"], "verified_roundtrip_tables": result["verified_tables"], "checks": ["real source hashes", "evidence spans", "missing segment refusal", "wrong passage reference refusal", "damaged text refusal", "changed claim refusal", "deleted claim refusal", "wrong offset refusal", "unchanged push makes no version", "concurrent write refusal", "stale write refusal", "old row removal refusal", "snapshot pull and read-back"]}


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("database", type=Path)
    args = p.parse_args()
    print(json.dumps(check(args.database), indent=2))
