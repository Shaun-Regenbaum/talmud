"""Prepare an immutable graph revision from reviewed changes and a verified export."""
import argparse
import hashlib
import json
import sqlite3
import tempfile
from collections import Counter
from contextlib import closing
from pathlib import Path

from prepare_d1 import encode
from verify_d1 import verify

ALLOWED_KINDS = {'graph_node', 'source_identity', 'connection', 'name_occurrence', 'place_review'}

COLUMNS = 'record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json'


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def literal(value):
    return 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"


def prepare(export, manifest_path, changes_path, output):
    parent = json.loads(manifest_path.read_text())
    verify(export, manifest_path)
    changes = json.loads(changes_path.read_text())
    if changes['parentRevision'] != parent['revision']:
        raise ValueError('Changes refer to another parent revision')
    with tempfile.TemporaryDirectory() as temporary, closing(sqlite3.connect(Path(temporary) / 'graph.sqlite')) as db:
        db.execute('PRAGMA journal_mode=OFF')
        db.execute('PRAGMA synchronous=OFF')
        db.executescript(export.read_text())
        state = db.execute('SELECT state FROM sage_graph_revisions WHERE id=?',
                           (parent['revision'],)).fetchone()
        if state != ('verified',):
            raise ValueError('Parent revision is not verified')
        rows = {r[0]: r for r in db.execute(
            f'SELECT {COLUMNS} FROM sage_graph_records WHERE revision_id=?',
            (parent['revision'],))}
        changed = {}
        for item in changes['records']:
            key = item['record_id']
            if key in changed:
                raise ValueError('Duplicate change: ' + key)
            if item['kind'] not in ALLOWED_KINDS or not key.startswith(item['kind'] + ':'):
                raise ValueError('Unsupported review kind: ' + key)
            old = rows.get(key)
            if old and old[6] == 'user_correction':
                raise ValueError('Cannot replace a human correction: ' + key)
            if old and item.get('replacesSha256') != old[-2]:
                raise ValueError('Replacement must name the previous hash: ' + key)
            if not old and item.get('replacesSha256'):
                raise ValueError('Replacement does not exist: ' + key)
            if item['authority'] != 'source_review':
                raise ValueError('New records must be source reviews: ' + key)
            payload = encode(item['data'])
            row = (key, item['kind'], item.get('passage_id'), item.get('ref'),
                   item.get('subject_id'), item.get('object_id'), item['authority'],
                   item.get('decision'), digest(payload), payload)
            changed[key] = row
            rows[key] = row
        def payload(key):
            if key not in rows:
                raise ValueError('Missing record: ' + key)
            return json.loads(rows[key][-1])

        def member(person_key, node_id):
            pid, local = person_key.split('/')
            passage = payload('passage:' + pid)
            if not any(p['id'] == local for p in passage['people']):
                raise ValueError('Unknown passage person: ' + person_key)
            node = payload('graph_node:' + node_id)
            if person_key not in node.get('personKeys', []):
                raise ValueError('Person is not a member of node: ' + person_key)
            return passage

        for key, row in changed.items():
            data = json.loads(row[-1])
            if data.get('passageId', row[2]) != row[2] or data.get('ref', row[3]) != row[3]:
                raise ValueError('Payload passage index differs: ' + key)
            if row[1] in {'name_occurrence', 'source_identity', 'place_review'}:
                if data['personId'] != row[4]:
                    raise ValueError('Person index differs: ' + key)
            if row[1] in {'name_occurrence', 'source_identity'}:
                if data['personKey'].split('/')[0] != row[2]:
                    raise ValueError('Person passage differs: ' + key)
                member(data['personKey'], data['personId'])
            if row[1] == 'graph_node':
                if data['id'] != row[4] or key != 'graph_node:' + data['id']:
                    raise ValueError('Node index differs: ' + key)
                for person_key in data['personKeys']:
                    member(person_key, data['id'])
                profile = data.get('sourceProfile')
                if profile:
                    source = member(profile['personKey'], data['id'])
                    if not profile['quote'] or profile['quote'] not in source['source']['passage']:
                        raise ValueError('Profile quote differs: ' + key)
                    for place in profile.get('places', []):
                        source = payload('passage:' + place['passageId'])
                        if source['ref'] != place['ref'] or not place['quote'] or place['quote'] not in source['source']['passage']:
                            raise ValueError('Place quote differs: ' + key)
                        if not any(p.startswith(place['passageId'] + '/') for p in data['personKeys']):
                            raise ValueError('Place belongs to another passage: ' + key)
                    target = profile.get('resolvedTo')
                    if target:
                        member(profile['personKey'], target)
                        registry = payload('registry_person:' + target)
                        if profile.get('generation') != registry.get('generation'):
                            raise ValueError('Resolved generation differs: ' + key)
                    era = profile.get('era')
                    if era and (type(era.get('start')) is not int or type(era.get('end')) is not int or era['end'] <= era['start'] or not era.get('source', {}).get('url', '').startswith('https://') or not era.get('label') or not era.get('labelHe')):
                        raise ValueError('Invalid sourced era: ' + key)
            if row[2]:
                passage = rows.get('passage:' + row[2])
                if not passage:
                    raise ValueError('Missing passage: ' + key)
                source = json.loads(passage[-1])
                if row[3] != source['ref']:
                    raise ValueError('Passage reference differs: ' + key)
                for evidence in data.get('evidence', []):
                    text = source['source'].get(evidence['location'])
                    if not evidence['quote'] or not text or evidence['quote'] not in text:
                        raise ValueError('Quote does not match: ' + key)
            if row[1] == 'connection':
                if data['type'] not in {'family', 'intellectual', 'encounter', 'action'}:
                    raise ValueError('Unknown connection type: ' + key)
                if (row[4], row[5]) != (data['a'], data['b']):
                    raise ValueError('Connection indexes differ: ' + key)
                if not data.get('evidence'):
                    raise ValueError('Connection needs evidence: ' + key)
                for person in (data['a'], data['b']):
                    if 'graph_node:' + person not in rows:
                        raise ValueError('Connection person is missing: ' + key)
                    node = payload('graph_node:' + person)
                    if not any(p.startswith(row[2] + '/') for p in node.get('personKeys', [])):
                        raise ValueError('Connection person is outside passage: ' + key)
            if row[1] == 'name_occurrence':
                source = json.loads(rows['passage:' + data['passageId']][-1])['source']
                start, end = data['characterStart'], data['characterEnd']
                if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(source['passage']) or not data['quote']:
                    raise ValueError('Invalid name bounds: ' + key)
                if source['passage'][start:end] != data['quote']:
                    raise ValueError('Name span differs: ' + key)
                expected = digest(json.dumps(source, ensure_ascii=False, sort_keys=True))
                if data['sourceSha256'] != expected:
                    raise ValueError('Name source hash differs: ' + key)
        replaced_nodes = {r[4] for k, r in changed.items() if r[1] == 'graph_node'}
        for key, row in rows.items():
            if key in changed or not replaced_nodes.intersection((row[4], row[5])):
                continue
            data = json.loads(row[-1])
            if row[1] in {'name_occurrence', 'source_identity'}:
                member(data['personKey'], data['personId'])
            if row[1] == 'connection':
                for person in (data['a'], data['b']):
                    if not any(p.startswith(row[2] + '/') for p in payload('graph_node:' + person).get('personKeys', [])):
                        raise ValueError('Replacement invalidates existing connection: ' + key)
        ordered = [rows[k] for k in sorted(rows)]
        manifest = dict(schemaVersion=parent.get('schemaVersion', 1),
                        parentRevision=parent['revision'], change=changes['description'],
                        recordCount=len(rows), countsByKind=dict(sorted(Counter(r[1] for r in ordered).items())),
                        recordSetSha256=digest(encode([r[:-1] for r in ordered])),
                        changesSha256=digest(changes_path.read_text()))
        revision = 'sage-graph-' + digest(encode(manifest))[:20]
        sql = [f'INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES ({literal(revision)},{literal(encode(manifest))},\'loading\');']
        # Copy bounded ranges; exclude every changed key before inserting replacements.
        keys = sorted(rows)
        for start in range(0, len(keys), 2000):
            chunk = keys[start:start + 2000]
            excluded = [k for k in changed if chunk[0] <= k <= chunk[-1]]
            exclusion = (' AND record_id NOT IN (' + ','.join(map(literal, excluded)) + ')') if excluded else ''
            sql.append(f'INSERT INTO sage_graph_records(revision_id,{COLUMNS}) SELECT {literal(revision)},{COLUMNS} FROM sage_graph_records WHERE revision_id={literal(parent["revision"])} AND record_id>={literal(chunk[0])} AND record_id<={literal(chunk[-1])}{exclusion};')
        for key in sorted(changed):
            sql.append(f'INSERT INTO sage_graph_records(revision_id,{COLUMNS}) VALUES (' + ','.join(map(literal, (revision, *changed[key]))) + ');')
        script = '\n'.join(sql) + '\n'
        db.executescript(script)
        actual = list(db.execute(f'SELECT {COLUMNS} FROM sage_graph_records WHERE revision_id=? ORDER BY record_id', (revision,)))
        if actual != ordered:
            raise ValueError('SQL round trip differs')
        outputs = {
            'import.sql': script,
            'manifest.json': json.dumps(dict(revision=revision, **manifest), indent=2) + '\n',
            'activate.sql': f"UPDATE sage_graph_revisions SET state='verified' WHERE id={literal(revision)} AND state='loading';\n",
        }
        for name, content in outputs.items():
            target = output / name
            if target.exists() and target.read_text() != content:
                raise ValueError('Refusing to replace different output: ' + str(target))
        output.mkdir(parents=True, exist_ok=True)
        for name, content in outputs.items():
            target = output / name
            pending = target.with_suffix(target.suffix + '.part')
            pending.write_text(content)
            pending.replace(target)
        return dict(revision=revision, changedRecords=len(changed), recordCount=len(rows))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['export', 'manifest', 'changes', 'output']:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.export, args.manifest, args.changes, args.output)))
