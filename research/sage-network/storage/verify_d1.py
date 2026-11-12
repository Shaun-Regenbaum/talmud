"""Verify every stored payload and indexed field in a remote D1 SQL export."""
import argparse
import hashlib
import json
import sqlite3
import tempfile
from pathlib import Path
from prepare_d1 import encode
from shared_records import FORMAT, record_table, verify_members


def load_sql(db, path, chunk=64_000_000):
    """Run a big SQL export in chunks of whole statements. One executescript string is capped near 1 GB."""
    pending, size = [], 0
    with open(path, encoding='utf-8') as handle:
        for line in handle:
            pending.append(line)
            size += len(line)
            if size >= chunk and sqlite3.complete_statement(''.join(pending[-50:])) and line.rstrip().endswith(';'):
                db.executescript(''.join(pending))
                pending, size = [], 0
    if pending:
        db.executescript(''.join(pending))


def verify(export, manifest_path):
    manifest = json.loads(manifest_path.read_text())
    with tempfile.TemporaryDirectory() as temporary:
        db = sqlite3.connect(Path(temporary) / 'readback.sqlite')
        db.execute('PRAGMA journal_mode=OFF')
        db.execute('PRAGMA synchronous=OFF')
        load_sql(db, export)
        revision = db.execute('SELECT manifest_json,state FROM sage_graph_revisions WHERE id=?',
                              (manifest['revision'],)).fetchone()
        expected = {k: v for k, v in manifest.items() if k != 'revision'}
        if not revision or json.loads(revision[0]) != expected:
            raise ValueError('Remote manifest does not match')
        if manifest.get('storageFormat') == FORMAT:
            verify_members(db, manifest['revision'])
        rows = db.execute(f'''SELECT record_id,kind,passage_id,ref,subject_id,object_id,authority,
                             decision,payload_sha256,payload_json FROM {record_table(db)}
                             WHERE revision_id=? ORDER BY record_id''', (manifest['revision'],))
        indexed = []
        for row in rows:
            payload = row[-1]
            json.loads(payload)
            if hashlib.sha256(payload.encode()).hexdigest() != row[-2]:
                raise ValueError('Remote payload changed: ' + row[0])
            indexed.append(row[:-1])
        if len(indexed) != manifest['recordCount']:
            raise ValueError('Remote record count differs')
        if hashlib.sha256(encode(indexed).encode()).hexdigest() != manifest['recordSetSha256']:
            raise ValueError('Remote indexed fields or record hashes differ')
        result = dict(revision=manifest['revision'], verifiedRecords=len(indexed),
                      exportSha256=hashlib.sha256(export.read_bytes()).hexdigest(),
                      indexedAndPayloadsMatch=True)
        print(json.dumps(result))
        return result


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('export', type=Path)
    p.add_argument('manifest', type=Path)
    p.add_argument('--receipt', type=Path, required=True)
    a = p.parse_args()
    result = verify(a.export, a.manifest)
    a.receipt.write_text(json.dumps(result, indent=2) + '\n')
