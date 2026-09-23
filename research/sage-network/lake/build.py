"""Import existing evidence without promoting it into accepted graph decisions."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

import duckdb
from prophex_lake.core import ident, q

from schema import FAMILIES, TABLES, VERSION


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def key(*values):
    return digest(encoded(values))


def file_hash(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


class Staging:
    def __init__(self, root):
        self.paths = {t: root / f"{t}.jsonl" for t in TABLES}
        self.files = {t: p.open("w") for t, p in self.paths.items()}
        self.counts = dict.fromkeys(TABLES, 0)

    def add(self, table, *values):
        # The declared order is also the INSERT column order.
        names = [c.strip().split()[0] for c in TABLES[table].split(",")]
        require(len(values) == len(names), f"wrong field count: {table}")
        self.files[table].write(encoded(dict(zip(names, values))) + "\n")
        self.counts[table] += 1

    def close(self):
        for stream in self.files.values():
            stream.close()

    def load(self, con):
        for table, ddl in TABLES.items():
            con.execute(f"CREATE TABLE IF NOT EXISTS {ident(table)} ({ddl})")
            if not self.counts[table]:
                continue
            columns = {c.strip().split()[0]: c.strip().split()[1] for c in ddl.split(",")}
            types = "{" + ", ".join(f"{q(n)}: {q(t)}" for n, t in columns.items()) + "}"
            con.execute(f"CREATE OR REPLACE TEMP TABLE incoming AS SELECT * FROM read_json({q(str(self.paths[table]))}, format='newline_delimited', columns={types}, maximum_object_size=134217728)")
            pk = next(iter(columns))
            require(con.execute(f"SELECT count(*) FROM (SELECT {ident(pk)} FROM incoming GROUP BY ALL HAVING count(*)>1)").fetchone()[0] == 0, f"duplicate input key: {table}")
            # An old key can be reused only when every field still matches.
            different = con.execute(f"SELECT count(*) FROM incoming i JOIN {ident(table)} o USING ({ident(pk)}) WHERE i IS DISTINCT FROM o").fetchone()[0]
            require(different == 0, f"existing row would change: {table}")
            con.execute(f"INSERT OR IGNORE INTO {ident(table)} SELECT * FROM incoming")


def validate(con):
    from pilot_store import validate_pilot
    from followup_store import validate_research
    problems = []
    joins = (
        ("source_segments", "unit_id", "source_units", "unit_id"),
        ("input_files", "ingest_id", "ingests", "ingest_id"),
        ("legacy_pairs", "file_id", "input_files", "file_id"),
        ("legacy_first_pass", "file_id", "input_files", "file_id"),
        ("legacy_readings", "file_id", "input_files", "file_id"),
        ("review_cases", "document_id", "review_documents", "document_id"),
        ("review_sources", "case_id", "review_cases", "case_id"),
        ("review_claims", "case_id", "review_cases", "case_id"),
        ("review_claim_sources", "claim_id", "review_claims", "claim_id"),
        ("review_claim_sources", "review_source_id", "review_sources", "review_source_id"),
    )
    for child, fk, parent, pk in joins:
        missing = con.execute(f"SELECT count(*) FROM {child} c ANTI JOIN {parent} p ON c.{fk}=p.{pk}").fetchone()[0]
        if missing:
            problems.append(f"{child}: {missing} missing {parent} rows")
    for table, col, checksum in (("source_units", "document_json", "unit_id"), ("source_segments", "text", "text_sha256"), ("review_sources", "text", "text_sha256"), ("review_documents", "document_json", "sha256")):
        bad = con.execute(f"SELECT count(*) FROM {table} WHERE sha256({col}) != {checksum}").fetchone()[0]
        if bad:
            problems.append(f"{table}: {bad} hash mismatches")
    bad = con.execute("SELECT count(*) FROM review_claim_sources l JOIN review_claims c USING(claim_id) JOIN review_sources s USING(review_source_id) WHERE c.case_id != s.case_id OR l.start_offset < 0 OR l.end_offset > length(s.text) OR l.end_offset <= l.start_offset OR substring(s.text, l.start_offset+1, l.end_offset-l.start_offset) != c.quote").fetchone()[0]
    if bad:
        problems.append(f"review_claim_sources: {bad} wrong evidence spans")
    missing = con.execute("SELECT count(*) FROM review_claims c ANTI JOIN review_claim_sources s USING(claim_id)").fetchone()[0]
    if missing:
        problems.append(f"review_claims: {missing} without evidence")
    bad = con.execute("SELECT count(*) FROM source_units u LEFT JOIN (SELECT unit_id, count(*) n, count(DISTINCT ordinal) unique_n FROM source_segments GROUP BY unit_id) s USING(unit_id) WHERE coalesce(n,0) != segment_count OR coalesce(unique_n,0) != segment_count").fetchone()[0]
    if bad:
        problems.append(f"source_units: {bad} incomplete segment lists")
    bad = con.execute("SELECT count(*) FROM source_segments s JOIN source_units u USING(unit_id) WHERE s.ordinal < 0 OR s.ordinal >= u.segment_count OR s.text IS DISTINCT FROM json_extract_string(u.document_json, '/segments/' || s.ordinal::VARCHAR) OR s.ref IS DISTINCT FROM u.unit_ref || ':' || json_extract_string(u.document_json, '/addresses/' || s.ordinal::VARCHAR)").fetchone()[0]
    if bad:
        problems.append(f"source_segments: {bad} differ from their saved source unit")
    for table, filename in (("legacy_pairs", "pairs-final.jsonl"), ("legacy_first_pass", "pair-kinds.jsonl"), ("legacy_readings", "pair-read.jsonl")):
        bad = con.execute(f"SELECT count(*) FROM input_files f LEFT JOIN (SELECT file_id, count(*) n, count(DISTINCT ordinal) unique_n, min(ordinal) first_n, max(ordinal) last_n, sha256(string_agg(payload_json || chr(10), '' ORDER BY ordinal)) hash FROM {table} GROUP BY file_id) r USING(file_id) WHERE f.relative_path=? AND (coalesce(n,0) != f.row_count OR unique_n != n OR first_n != 0 OR last_n != n-1 OR hash != f.sha256)", [filename]).fetchone()[0]
        if bad:
            problems.append(f"{table}: {bad} input file counts or hashes differ")
        bad = con.execute(f"SELECT count(*) FROM {table} WHERE pair_key IS DISTINCT FROM json_extract_string(payload_json, '$.key')").fetchone()[0]
        if bad:
            problems.append(f"{table}: {bad} keys differ from saved rows")
    for column, field in (("ref", "ref"), ("name_a", "a"), ("name_b", "b"), ("label", "kind"), ("direction", "direction"), ("sure", "sure")):
        cast = "::BOOLEAN" if column == "sure" else ""
        bad = con.execute(f"SELECT count(*) FROM legacy_pairs WHERE {column} IS DISTINCT FROM json_extract_string(payload_json, '$.{field}'){cast}").fetchone()[0]
        if bad:
            problems.append(f"legacy_pairs: {bad} {column} values differ from saved rows")
    for column, field in (("corpus", "corpus"), ("work", "work"), ("edition", "witness"), ("unit_ref", "ref"), ("segment_count", "nSegments"), ("segments_sha256", "sha256")):
        cast = "::BIGINT" if column == "segment_count" else ""
        bad = con.execute(f"SELECT count(*) FROM source_units WHERE {column} IS DISTINCT FROM json_extract_string(document_json, '$.{field}'){cast}").fetchone()[0]
        if bad:
            problems.append(f"source_units: {bad} {column} values differ from original documents")
    # Each indexed review record must still be the reading saved in its document.
    for did, raw in con.execute("SELECT document_id, document_json FROM review_documents WHERE filename='ontology-review-data.json'").fetchall():
        document = json.loads(raw)
        indexed = con.execute("SELECT local_id, payload_json FROM review_cases WHERE document_id=?", [did]).fetchall()
        require(dict(indexed) == {c['id']: encoded(c) for c in document['cases']}, "review_cases differ from their original review document")
    for cid, raw in con.execute("SELECT case_id, payload_json FROM review_cases").fetchall():
        case = json.loads(raw)
        saved_sources = con.execute("SELECT payload_json FROM review_sources WHERE case_id=? ORDER BY review_source_id", [cid]).fetchall()
        require(sorted(x[0] for x in saved_sources) == sorted(encoded(s) for s in case['sources']), "review_sources differ from their original case")
        saved_claims = con.execute("SELECT payload_json FROM review_claims WHERE case_id=? ORDER BY ordinal", [cid]).fetchall()
        require([x[0] for x in saved_claims] == [encoded(s) for s in case['claims']], "review_claims differ from their original case")
    for table, fields in (("review_cases", {"local_id":"id", "ref":"ref", "title":"title"}), ("review_sources", {"ref":"ref", "text":"hebrew", "text_sha256":"hebrew_sha256"}), ("review_claims", {"subject":"subject", "relation":"relation", "object":"object", "quote":"quote", "branch":"branch", "status":"status"})):
        for column, field in fields.items():
            bad = con.execute(f"SELECT count(*) FROM {table} WHERE {ident(column)} IS DISTINCT FROM json_extract_string(payload_json, '$.{field}')").fetchone()[0]
            if bad:
                problems.append(f"{table}: {bad} {column} values differ from original records")
    require(not problems, "; ".join(problems))
    validate_pilot(con)
    validate_research(con)
    present = {row[0] for row in con.execute("SHOW TABLES").fetchall()}
    return {t: con.execute(f"SELECT count(*) FROM {ident(t)}").fetchone()[0] for t in TABLES if t in present}


def build(source_root, evidence_root, out, base=None):
    require(duckdb.__version__ == "1.5.5", "Use the pinned DuckDB 1.5.5 environment")
    require(not out.exists(), f"output already exists: {out}")
    manifest_path = source_root / "manifest.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    checkpoint = evidence_root / "checkpoint"
    review_names = ["ontology-review-data.json", "ontology-review-concepts.json", "ontology-review-examples.json", "ontology-review-peer-check.json", "ontology-review-crosscheck.json", "relation-cases-report-data.json", "relation-cases-sources.json"]
    review_inputs = {n: (checkpoint / n).read_bytes() for n in review_names}
    pair_names = {"legacy_pairs": "pairs-final.jsonl", "legacy_first_pass": "pair-kinds.jsonl", "legacy_readings": "pair-read.jsonl"}
    checksums = {"manifest.json": digest(manifest_bytes), **{f"checkpoint/{n}": digest(b) for n, b in review_inputs.items()}, **{n: file_hash(evidence_root / n) for n in pair_names.values()}}
    expected = {(u["corpus"], u["work"], u["witness"], u["unit"], u["sha256"]): u for u in manifest["units"]}
    require(len(expected) == len(manifest["units"]), "duplicate unit in source manifest")
    out.parent.mkdir(parents=True, exist_ok=True)
    part = out.with_name(out.name + ".part")
    require(not part.exists(), f"unfinished build exists: {part}; inspect it before retrying")
    excluded = []
    found = set()
    unit_inputs = []
    with tempfile.TemporaryDirectory(prefix="sage-import-") as tmp:
        staging = Staging(Path(tmp))
        try:
            for path in sorted((source_root / "raw").rglob("*.json")):
                raw = path.read_bytes()
                u = json.loads(raw)
                match = (u["corpus"], u["work"], u["witness"], u["unit"], u["sha256"])
                relative = path.relative_to(source_root).as_posix()
                if match not in expected:
                    excluded.append(relative)
                    continue
                require(match not in found, f"duplicate source unit: {relative}")
                require(all(u.get(field) == value for field, value in expected[match].items()), f"source metadata differs from manifest: {relative}")
                found.add(match)
                segments = u["segments"]
                actual = digest(json.dumps(segments, ensure_ascii=False, separators=(",", ":")))
                require(actual == u["sha256"], f"source unit hash mismatch: {relative}")
                require(u["nSegments"] == len(segments) == len(u["addresses"]) == expected[match]["nSegments"], f"source unit count mismatch: {relative}")
                require(len(set(u["addresses"])) == len(segments), f"duplicate source address: {relative}")
                uid = digest(raw)
                unit_inputs.append({"path": relative, "sha256": uid, "bytes": len(raw), "rows": len(segments)})
                staging.add("source_units", uid, u["corpus"], u["work"], u["witness"], u["ref"], len(segments), actual, raw.decode())
                for n, (address, text) in enumerate(zip(u["addresses"], segments)):
                    require(isinstance(text, str), f"non-text source segment: {relative}:{address}")
                    staging.add("source_segments", key(uid, address), uid, n, f'{u["ref"]}:{address}', text, digest(text))
                if len(found) % 2500 == 0:
                    print(f"Validated {len(found):,} source units", flush=True)
            require(found == set(expected), f"source manifest has {len(set(expected)-found)} missing units")
            inputs = {"checksums": checksums, "units": unit_inputs, "excluded_unlisted_files": excluded, "source_manifest": manifest}
            ingest_id = key(VERSION, inputs)
            staging.add("ingests", ingest_id, VERSION, encoded(inputs))
            for unit in unit_inputs:
                staging.add("input_files", key(ingest_id, unit["path"]), ingest_id, unit["path"], unit["sha256"], unit["bytes"], unit["rows"])
            staging.add("review_documents", key("manifest.json", digest(manifest_bytes)), "manifest.json", digest(manifest_bytes), manifest_bytes.decode())
            for table, filename in pair_names.items():
                path = evidence_root / filename
                fid = key(ingest_id, filename)
                n = 0
                seen = set()
                with path.open(newline="") as stream:
                    for line in stream:
                        require(line.endswith("\n") and not line.endswith("\r\n"), f"expected LF-terminated JSONL: {filename}")
                        p = json.loads(line)
                        require(p["key"] not in seen, f"duplicate pair key: {filename}:{p['key']}")
                        seen.add(p["key"])
                        rid = key(fid, p["key"])
                        if table == "legacy_pairs":
                            staging.add(table, rid, fid, n, p["key"], p["ref"], p["a"], p["b"], p.get("kind"), p.get("direction"), p.get("sure"), line[:-1])
                        else:
                            staging.add(table, rid, fid, n, p["key"], line[:-1])
                        n += 1
                require(file_hash(path) == checksums[filename], f"input changed during import: {filename}")
                staging.add("input_files", fid, ingest_id, filename, checksums[filename], path.stat().st_size, n)
            for filename, raw in review_inputs.items():
                did = key(filename, digest(raw))
                staging.add("review_documents", did, filename, digest(raw), raw.decode())
                staging.add("input_files", key(ingest_id, filename), ingest_id, f"checkpoint/{filename}", digest(raw), len(raw), 1)
            raw = review_inputs["ontology-review-data.json"]
            doc = json.loads(raw)
            did = key("ontology-review-data.json", digest(raw))
            require(len(doc["cases"]) == doc["new_case_count"], "review case count mismatch")
            for c in doc["cases"]:
                cid = key(did, c["id"])
                staging.add("review_cases", cid, did, c["id"], c["ref"], c["title"], encoded(c["genre"]), encoded(c))
                sources = []
                for ordinal, s in enumerate(c["sources"]):
                    require(digest(s["hebrew"]) == s["hebrew_sha256"], f"review source hash mismatch: {s['ref']}")
                    sid = key(cid, ordinal)
                    sources.append((sid, s))
                    staging.add("review_sources", sid, cid, s["ref"], s.get("edition", s.get("hebrew_edition")), s["hebrew"], s["hebrew_sha256"], encoded(s))
                for ordinal, claim in enumerate(c["claims"]):
                    qid = key(cid, ordinal)
                    quote = claim["quote"]
                    require(bool(quote), f"empty review quote: {c['id']}:{ordinal}")
                    staging.add("review_claims", qid, cid, ordinal, claim["subject"], claim["relation"], claim["object"], quote, claim["branch"], claim["status"], encoded(claim))
                    matches = []
                    stored_span = claim.get("original", {}).get("evidence")
                    stored_span = stored_span if isinstance(stored_span, dict) else None
                    for sid, source in sources:
                        if claim["refs"] and source["ref"] not in claim["refs"]:
                            continue
                        offset = source["hebrew"].find(quote)
                        while offset >= 0:
                            if not stored_span or (source["ref"] == stored_span["ref"] and offset == stored_span["start"] and offset+len(quote) == stored_span["end"]):
                                matches.append((sid, offset))
                            offset = source["hebrew"].find(quote, offset+1)
                    require(bool(matches), f"review quote not found: {c['id']}:{ordinal}")
                    match_status = "stored_span" if stored_span else "unique_quote" if len(matches) == 1 else "candidate_quote"
                    for sid, offset in matches:
                        staging.add("review_claim_sources", key(qid, sid, offset), qid, sid, offset, offset+len(quote), match_status)
            for family in FAMILIES:
                staging.add("relation_families", *family)
        finally:
            staging.close()
        if base:
            shutil.copyfile(base, part)
        con = duckdb.connect(str(part))
        try:
            con.execute("BEGIN")
            staging.load(con)
            counts = validate(con)
            con.execute("COMMIT")
        finally:
            con.close()
        part.rename(out)
    report = {"ingest_id": ingest_id, "importer_version": VERSION, "duckdb_version": duckdb.__version__, "tables": counts, "new_input_rows": staging.counts, "excluded_unlisted_files": excluded, "source_file_sha256": file_hash(out), "status": "Data copied and checked; interpretations remain provisional."}
    out.with_suffix(".import.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    return report


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source-root", type=Path, required=True)
    p.add_argument("--evidence-root", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--base", type=Path, help="Previously pulled release; keep all prior records")
    args = p.parse_args()
    print(json.dumps(build(args.source_root, args.evidence_root, args.out, args.base), ensure_ascii=False, indent=2))
