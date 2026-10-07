"""Prepare an immutable database import from saved source and review records."""
import argparse
import collections
import hashlib
import json
import sqlite3
from pathlib import Path


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def literal(value):
    return 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"


def prepare(classification, sources, identity, registry_path, out):
    out.mkdir(parents=True, exist_ok=True)
    summary = json.loads((classification / 'summary.json').read_text())
    claims_path = classification / 'classified-claims.jsonl'
    if not summary['complete'] or digest(claims_path) != summary['fileHashes'][claims_path.name]:
        raise ValueError('Incomplete or changed classifications')
    evidence_path = identity / 'evidence-reviewed-all-nine.json'
    accepted_path = identity / 'accepted-records-v1.json'
    evidence = json.loads(evidence_path.read_text())
    accepted = json.loads(accepted_path.read_text())
    registry = json.loads(registry_path.read_text())
    # Acceptance uses a deliberately different serialization with spaces.
    source_hash = hashlib.sha256(json.dumps(evidence, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if accepted['evidenceSha256'] != source_hash:
        raise ValueError('Accepted records reference different evidence')
    manifest = dict(schemaVersion=1, sourceFiles={
        'classification': digest(claims_path), 'identityEvidence': digest(evidence_path),
        'acceptedRecords': digest(accepted_path), 'registry': digest(registry_path)},
        meaning='Stored records retain their own decisions. Storage does not confirm unresolved identities.',
        pagePlacement='Saved character anchors are not approved rendered-page token positions.')
    records = {}

    def add(kind, key, value, passage=None, ref=None, subject=None, object_id=None,
            authority='source_review', decision=None):
        rid = f'{kind}:{key}'
        if rid in records:
            raise ValueError(f'Duplicate record: {rid}')
        payload = encode(value)
        records[rid] = (kind, passage, ref, subject, object_id, authority, decision,
                        hashlib.sha256(payload.encode()).hexdigest(), payload)

    passages, pack_hashes = {}, {}
    for path in sorted(sources.glob('*/PACK.md')):
        pack_hashes[path.parent.name] = digest(path)
        for passage in json.loads(path.read_text())['passages']:
            if passage['id'] in passages:
                raise ValueError('Duplicate passage')
            passages[passage['id']] = passage
            add('passage', passage['id'], passage, passage['id'], passage['ref'], authority='source')
            for person in passage['people']:
                add('person', f"{passage['id']}/{person['id']}", person,
                    passage['id'], passage['ref'], authority='source')
    for passage in evidence['passages'] + evidence['userCorrections']['sources']:
        original = passages[passage['id']]
        if any(passage[k] != original[k] for k in ('ref', 'source', 'people')):
            raise ValueError('Identity source differs from classification source')
    expected_claims = {f"{p['id']}/{c['id']}" for p in passages.values() for c in p['claims']}
    seen_claims = set()
    claim_count = 0
    for line in claims_path.open():
        row = json.loads(line)
        if pack_hashes[row['sourcePack']] != row['packSha256']:
            raise ValueError('Changed source pack')
        p = passages[row['passageId']]
        if row['ref'] != p['ref'] or row['claim'] not in p['claims']:
            raise ValueError('Classification differs from source claim')
        if row['id'] != row['passageId'] + '/' + row['claim']['id']:
            raise ValueError('Claim ID differs from its source')
        seen_claims.add(row['id'])
        participants = [p['localId'] for p in row['participants']]
        add('claim', row['id'], row, row['passageId'], row['ref'],
            participants[0] if participants else None,
            participants[1] if len(participants) > 1 else None,
            'classification', row['classification']['decision'])
        claim_count += 1
    if seen_claims != expected_claims:
        raise ValueError('Missing or extra source claims')
    if claim_count != summary['claims'] or len(passages) != summary['passages']:
        raise ValueError('Source totals do not match classification summary')
    for row in summary['withheld']:
        add('withheld', row['id'], row, row['id'], row['ref'], decision='withheld')
    for slug, row in registry['rabbis'].items():
        add('registry_person', slug, row, subject=slug, authority='registry')
    for row in evidence['proposedGroups']:
        add('identity_group', row['id'], row, subject=row.get('registrySlug'), decision='proposed')
    for row in evidence['localPersonAssignments']:
        add('identity_assignment', row['dossierId'] + '/' + row['personKey'], row,
            row['passageId'], passages[row['passageId']]['ref'], decision=row['status'])
    for i, row in enumerate(evidence['findings']):
        add('identity_finding', str(i), row)
    for category in ('registryCorrections', 'groupComparisons'):
        for i, row in enumerate(evidence['reviewOverlays'][category]):
            add('identity_review', f'{category}/{i}', row)
    for row in accepted['identities']:
        pid = row['personKey'].split('/')[0]
        add('accepted_identity', row['personKey'], row, pid, passages[pid]['ref'], row['personId'], decision='accepted')
    for i, row in enumerate(accepted['occurrences']):
        add('name_occurrence', str(i), row, row['passageId'], row['ref'], row['personId'], decision='page_placement_pending')
    for row in accepted['connections']:
        add('connection', row['id'], row, row['passageId'], row['ref'], row['a'], row['b'], 'user_correction', row['decision'])
    for i, row in enumerate(accepted['exclusions']):
        add('exclusion', str(i), row, row['passageId'], passages[row['passageId']]['ref'], authority='user_correction', decision='excluded')
    for row in accepted['nodes']:
        add('graph_node', row['id'], row, subject=row['id'], decision='resolved' if row['identityResolved'] else 'unresolved')
    checks = json.loads((identity / 'page-text-check-v1/checks.json').read_text())
    for i, row in enumerate(checks['checks']):
        add('page_placement', str(i), row, row['personKey'].split('/')[0], row['ref'], decision=row['status'])
    manifest['counts'] = dict(sorted(collections.Counter(v[0] for v in records.values()).items()))
    manifest['recordCount'] = len(records)
    manifest['recordSetSha256'] = hashlib.sha256(encode([(k, *v[:-1]) for k, v in sorted(records.items())]).encode()).hexdigest()
    revision = 'sage-graph-' + hashlib.sha256(encode(manifest).encode()).hexdigest()[:20]
    schema = Path(__file__).parents[3] / 'packages/talmud/migrations-sage-graph/0001_graph.sql'
    sql = [schema.read_text(), f'INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES ({literal(revision)},{literal(encode(manifest))},\'loading\');']
    for rid, values in sorted(records.items()):
        # Keep every SQL statement below D1's 100 KB limit, including long passages.
        payload = values[-1]
        parts = [payload[i:i + 8000] for i in range(0, len(payload), 8000)]
        row = (revision, rid, *values[:-1], parts[0])
        sql.append('INSERT INTO sage_graph_records VALUES (' + ','.join(map(literal, row)) + ');')
        for part in parts[1:]:
            sql.append(f'UPDATE sage_graph_records SET payload_json=payload_json||{literal(part)} WHERE revision_id={literal(revision)} AND record_id={literal(rid)};')
    if max(len(s.encode()) for s in sql) >= 100000:
        raise ValueError('SQL statement exceeds the import limit')
    sql_text = '\n'.join(sql) + '\n'
    target = out / 'import.sql'
    if target.exists() and target.read_text() != sql_text:
        raise ValueError('Output already contains a different import')
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript(sql_text)
    actual = list(db.execute('SELECT record_id,payload_sha256,payload_json FROM sage_graph_records ORDER BY record_id'))
    if len(actual) != len(records):
        raise ValueError('Local import dropped records')
    for rid, checksum, payload in actual:
        if hashlib.sha256(payload.encode()).hexdigest() != checksum or json.loads(payload) != json.loads(records[rid][-1]):
            raise ValueError('Local import changed a record')
    target.write_text(sql_text)
    (out / 'manifest.json').write_text(json.dumps(dict(revision=revision, **manifest), indent=2) + '\n')
    print(json.dumps(dict(revision=revision, records=len(records), counts=manifest['counts'], sqlBytes=len(sql_text.encode()))))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for name in ('classification', 'sources', 'identity', 'registry', 'out'):
        p.add_argument('--' + name, type=Path, required=True)
    a = p.parse_args()
    prepare(a.classification, a.sources, a.identity, a.registry, a.out)
