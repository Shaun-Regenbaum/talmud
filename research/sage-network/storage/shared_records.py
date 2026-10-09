"""Store each complete record version once and publish immutable memberships."""
import hashlib
from pathlib import Path

from prepare_d1 import encode

COLUMNS = 'record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json'
FORMAT = 'shared-v1'


def literal(value):
    return 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"


def record_table(db):
    found = db.execute("SELECT 1 FROM sqlite_master WHERE type='view' AND name='sage_graph_all_records'").fetchone()
    return 'sage_graph_all_records' if found else 'sage_graph_records'


def ensure_schema(db):
    if record_table(db) == 'sage_graph_records':
        root = Path(__file__).resolve().parents[3]
        db.executescript((root / 'packages/talmud/migrations-sage-graph/0003_shared_records.sql').read_text())


def version_hash(row):
    # Include indexed fields too: identical text with different attribution is a different version.
    return hashlib.sha256(encode(row).encode()).hexdigest()


def verify_members(db, revision):
    if db.execute('SELECT 1 FROM sage_graph_records WHERE revision_id=? LIMIT 1', (revision,)).fetchone():
        raise ValueError('Shared revision contains copied records')
    fields = ','.join('v.' + field for field in COLUMNS.split(','))
    for row in db.execute(
        f'SELECT m.record_id,v.version_sha256,{fields} FROM sage_graph_revision_members m '
        'LEFT JOIN sage_graph_record_versions v ON v.id=m.version_id WHERE m.revision_id=?',
        (revision,),
    ):
        if row[0] != row[2] or row[1] != version_hash(row[2:]):
            raise ValueError('Shared record version or membership differs: ' + row[0])


def statements(parent, revision, rows, changed):
    sql = []
    inherited = sorted(set(rows) - set(changed))
    if parent.get('storageFormat') == FORMAT:
        for start in range(0, len(inherited), 2000):
            chunk = inherited[start:start + 2000]
            excluded = [k for k in changed if chunk[0] <= k <= chunk[-1]]
            exclusion = (' AND record_id NOT IN (' + ','.join(map(literal, excluded)) + ')') if excluded else ''
            sql.append(
                'INSERT INTO sage_graph_revision_members(revision_id,record_id,version_id) '
                f'SELECT {literal(revision)},record_id,version_id FROM sage_graph_revision_members '
                f'WHERE revision_id={literal(parent["revision"])} '
                f'AND record_id>={literal(chunk[0])} AND record_id<={literal(chunk[-1])}{exclusion};')
    else:
        # A bounded map seeds versions directly from the existing database. Payloads stay remote.
        fields = ','.join('r.' + field for field in COLUMNS.split(','))
        for start in range(0, len(inherited), 200):
            chunk = inherited[start:start + 200]
            values = ','.join(f'({literal(key)},{literal(version_hash(rows[key]))})' for key in chunk)
            expected = 'WITH expected(record_id,version_sha256) AS (VALUES ' + values + ') '
            sql.append(expected + f'INSERT INTO sage_graph_record_versions(version_sha256,{COLUMNS}) '
                       f'SELECT e.version_sha256,{fields} FROM expected e '
                       'JOIN sage_graph_all_records r ON r.record_id=e.record_id '
                       f'AND r.revision_id={literal(parent["revision"])} '
                       'WHERE NOT EXISTS (SELECT 1 FROM sage_graph_record_versions v '
                       'WHERE v.version_sha256=e.version_sha256);')
            sql.append(expected + 'INSERT INTO sage_graph_revision_members(revision_id,record_id,version_id) '
                       f'SELECT {literal(revision)},e.record_id,v.id FROM expected e '
                       'JOIN sage_graph_record_versions v ON v.version_sha256=e.version_sha256;')
    for key in sorted(changed):
        row = changed[key]
        sha = version_hash(row)
        sql.append(f'INSERT INTO sage_graph_record_versions(version_sha256,{COLUMNS}) SELECT '
                   + ','.join(map(literal, (sha, *row)))
                   + ' WHERE NOT EXISTS (SELECT 1 FROM sage_graph_record_versions '
                   + f'WHERE version_sha256={literal(sha)});')
        sql.append('INSERT INTO sage_graph_revision_members(revision_id,record_id,version_id) '
                   f'SELECT {literal(revision)},{literal(key)},id FROM sage_graph_record_versions '
                   f'WHERE version_sha256={literal(sha)};')
    if any(len(s.encode()) > 100_000 for s in sql):
        raise ValueError('Shared record statement exceeds the database statement limit')
    return sql
