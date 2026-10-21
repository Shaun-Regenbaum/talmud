"""Prepare and check name_candidates records for the graph. Offline: no remote access and no database writes.

A record is built only from checked inputs:
- the graph parent revision, from a verified local export: registry rows, reviewed and human decisions, older
  readings and their source bindings;
- each source reading's rows as checked. A reading the graph holds is read from the graph. A reading a source-reading
  store holds comes from that store's read-back file (`source-reading-store-readback-v1`), which the store owner
  writes only after a full read-back rebuilds every passage from its R2 artifact.

Each candidate cites the person, passage and source_reading rows exactly as stored (store, revision, stored hash and
format) together with the rebuilt v1 hash. The check rebuilds every record from the same inputs, refuses any
difference, and re-checks human precedence, coverage at every mention and the alias guards on its own.

The extend_d1 wiring waits until the source-reading store change (PR #802) lands, so the two do not edit the same
lines.
Usage:
  name_candidates_import.py prepare --graph EXPORT.sqlite --revision R [--readback FILE ...] --output DIR
  name_candidates_import.py check --graph EXPORT.sqlite --revision R [--readback FILE ...] --changes DIR/changes.json
"""
import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'identity'))
import name_candidates as nc  # noqa: E402
from prepare_d1 import encode as d1_encode  # noqa: E402
from shared_records import record_table  # noqa: E402

VERSION = 'name-candidates-import-v1'
READBACK = 'source-reading-store-readback-v1'
STORES = ('bavli', 'other')
V1_FORMAT = 'source_readings.records v1 row'
STORE_FORMAT = 'source-reading-store-v2'
READING_KINDS = ('passage', 'person', 'claim', 'source_reading', 'source_reading_coverage', 'source_reading_unit')
COLUMNS = 'record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json'
DATA = Path(__file__).resolve().parents[3] / 'packages/talmud/src/lib/data'
DESCRIPTION = 'Add first registry suggestions for people in checked source readings'


def require(value, message):
    if not value:
        raise ValueError(message)


def d1_hash(data):
    """The payload hash D1 stores (prepare_d1.encode)."""
    return hashlib.sha256(d1_encode(data).encode()).hexdigest()


def read_graph(path, revision):
    """A verified graph revision from a local export, with its record set checked against its manifest."""
    with sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True) as db:
        saved = db.execute('SELECT manifest_json,state FROM sage_graph_revisions WHERE id=?', (revision,)).fetchone()
        require(saved and saved[1] == 'verified', 'Graph revision is not verified: ' + revision)
        manifest = dict(json.loads(saved[0]), revision=revision)
        rows = list(db.execute(f'SELECT {COLUMNS} FROM {record_table(db)} WHERE revision_id=? ORDER BY record_id', (revision,)))
    require(len(rows) == manifest['recordCount'], 'Graph record count differs from its manifest')
    require(hashlib.sha256(d1_encode([list(r[:-1]) for r in rows]).encode()).hexdigest() == manifest['recordSetSha256'],
            'Graph record set differs from its manifest')
    return rows, manifest


def row_dict(row):
    return dict(zip(COLUMNS.split(',')[:-2], row[:8]), data=json.loads(row[-1]))


def graph_passages(rows):
    """Source readings the graph itself holds: there the stored row is the v1 row."""
    out = {}
    readings = {r[2] for r in rows if r[1] == 'source_reading'}
    for row in rows:
        if row[2] in readings and row[1] in READING_KINDS:
            p = out.setdefault(row[2], dict(store='graph', revision=None, stored={}, v1=[], v1Sha256={}))
            p['stored'][row[0]] = dict(recordId=row[0], kind=row[1], payloadSha256=row[-2], payloadFormat=V1_FORMAT)
            p['v1'].append(row_dict(row))
            p['v1Sha256'][row[0]] = row[-2]
    return out


def readback_passages(files):
    """Passages from store read-back files, each refused unless the store owner's full read-back passed."""
    out, sources = {}, []
    for f in files:
        require(f.get('version') == READBACK and f.get('store') in STORES, 'Not a source-reading store read-back file')
        back = f['readBack']
        require(f.get('complete') is True and back.get('matchesImporter') is True, 'The read-back did not check every passage')
        require(d1_hash(back) == f['readBackSha256'], 'Read-back receipt differs from its hash')
        require((back.get('store'), back.get('revision'), back.get('recordSetSha256'), back.get('parentRevision')) ==
                (f['store'], f['revision'], f['recordSetSha256'], f.get('parentRevision')), 'Read-back receipt names another revision')
        require(back.get('passagesChecked') == back.get('passages') == len(f['passages']), 'The read-back did not rebuild every passage')
        for pid, p in f['passages'].items():
            require(pid not in out, 'A passage is in two read-back files: ' + pid)
            stored = {s['recordId']: s for s in p['stored']}
            require(len(stored) == len(p['stored']) and all(s['payloadFormat'] == STORE_FORMAT for s in stored.values()),
                    'Stored rows repeat or are not compact store rows: ' + pid)
            v1 = [x['row'] for x in p['v1']]
            hashes = {x['row']['record_id']: x['v1PayloadSha256'] for x in p['v1']}
            require(set(hashes) == set(stored) and len(hashes) == len(v1), 'Stored and rebuilt rows differ: ' + pid)
            for row in v1:
                require(row['passage_id'] == pid and stored[row['record_id']]['kind'] == row['kind'], 'Row belongs elsewhere: ' + row['record_id'])
                require(d1_hash(row['data']) == hashes[row['record_id']], 'Rebuilt row differs from its v1 hash: ' + row['record_id'])
            out[pid] = dict(store=f['store'], revision=f['revision'], stored=stored, v1=v1, v1Sha256=hashes)
        sources.append(dict(store=f['store'], revision=f['revision'], parentRevision=f.get('parentRevision'),
                            recordSetSha256=f['recordSetSha256'], readBackSha256=f['readBackSha256']))
    return out, sorted(sources, key=nc.encode)


def readings(graph_rows, readbacks):
    held, sources = readback_passages(readbacks)
    own = graph_passages(graph_rows)
    both = set(own) & set(held)
    require(not both, 'A reading is in the graph and in a store; the graph copy wins, so the store copy cannot be cited: ' + ', '.join(sorted(both)))
    return {**own, **held}, sources


def build(graph_rows, graph_manifest, readbacks, he_aliases_bytes, duplicates_bytes):
    parent = graph_manifest['revision']
    require(not any(r[1] == nc.KIND for r in graph_rows), 'The parent already holds name_candidates records; this version only adds')
    passages, sources = readings(graph_rows, readbacks)
    registry = nc.registry_index([(r[0], r[-2], r[-1]) for r in graph_rows if r[1] == 'registry_person'], json.loads(he_aliases_bytes))
    duplicates = json.loads(duplicates_bytes)['duplicates']
    decisions = nc.Decisions(graph_rows)
    spans = nc.older_occurrences([(r[0], r[1], r[2], r[-1]) for r in graph_rows if r[1] in ('passage', 'person') and r[2] not in passages],
                                 [json.loads(r[-1]) for r in graph_rows if r[1] == 'source_binding'])
    groups = [passages[pid]['v1'] for pid in sorted(passages)]
    cases, held = nc.build(groups, registry, duplicates, parent, spans, decisions)
    for case in cases:
        p = passages[case['passageId']]
        for name in ('person', 'passage', 'sourceReading'):
            b = case['bindings'][name]
            stored = p['stored'][b['recordId']]
            require(b['v1PayloadSha256'] == p['v1Sha256'][b['recordId']], 'Rebuilt v1 hash differs: ' + b['recordId'])
            b.update(store=p['store'], revision=p['revision'] or parent, payloadSha256=stored['payloadSha256'], payloadFormat=stored['payloadFormat'])
    producer = dict(nc.envelope(registry, parent, he_aliases_bytes, duplicates_bytes), importer=VERSION,
                    importerFileSha256=nc.sha256_file(__file__), graphRecordSetSha256=graph_manifest['recordSetSha256'], sources=sources)
    return dict(version=VERSION, parentRevision=parent, description=DESCRIPTION, nameCandidateInputs=producer,
                records=[nc.record(case, producer) for case in cases], held=held)


def alias_guards_hold(mention, text):
    """No alias that must not name a father, or must not run into a longer name, survives at this mention."""
    printed = nc.forms(mention['quote'])
    names = {f['name'] for f in printed['forms']}
    for hit in mention['exact']:
        guard = hit.get('guard')
        # A hit from the one-letter retry carries that letter as its prefix, as in match_mention.
        prefix = printed['prefix'] if hit['form'] in names else printed['text'][0]
        if guard and (mention['nextWord'] in guard['notFollowedBy'] or
                      (guard['notAfterPatronymic'] and nc.after_patronymic(text, mention['start'], prefix))):
            return False
    return True


def validate_changes(changes, graph_rows, graph_manifest, readbacks, he_aliases_bytes, duplicates_bytes):
    """Rebuild everything from the same inputs and refuse any difference; then check the rules a second time."""
    expected = build(graph_rows, graph_manifest, readbacks, he_aliases_bytes, duplicates_bytes)
    require(nc.encode(changes) == nc.encode(expected), 'Changes differ from a rebuild from the checked inputs')
    passages, _ = readings(graph_rows, readbacks)
    decisions = nc.Decisions(graph_rows)
    for record in changes['records']:
        data, key = record['data'], record['subject_id']
        require(record['kind'] == nc.KIND and record['record_id'] == f'{nc.KIND}:v1/{key}' and record['object_id'] is None, 'Bad record: ' + key)
        require((record['authority'], record['decision']) == ('screening', 'needs_review'), 'A suggestion is never accepted: ' + key)
        require(data['accepted'] is False and data['historicalIdentityResolved'] is False and data['candidateMetadataVerified'] is False,
                'A suggestion is never accepted: ' + key)
        require(data['producer'] == changes['nameCandidateInputs'] and data['personKey'] == key and record['passage_id'] == data['passageId'],
                'Record names other inputs: ' + key)
        require(not decisions.about(key), 'A reviewed or human decision covers this person: ' + key)
        require({x['occurrenceKey'] for x in data['olderReading']['covered']} != {m['occurrenceKey'] for m in data['mentions']},
                'Older readings cover every mention: ' + key)
        texts = {s['source_id']: s['text'] for s in next(r for r in passages[data['passageId']]['v1'] if r['kind'] == 'passage')['data']['sourceSegments']}
        require(all(alias_guards_hold(m, texts[m['sourceId']]) for m in data['mentions']), 'An alias guard would refuse this match: ' + key)
        if data['status'] == 'tentative':
            found = [h for m in data['mentions'] for h in m['exact'] if h['slug'] == data['suggestion']]
            chosen = next(c for c in data['candidates'] if c['slug'] == data['suggestion'])
            require(data['clearestShape'] == 'full' and not any(m['notes'] for m in data['mentions']) and found
                    and not any(h['registryLabels'] or h.get('readings') for h in found) and chosen['registryDuplicate'] is None,
                    'A tentative suggestion needs one exact full name: ' + key)
        for b in (data['bindings'][n] for n in ('person', 'passage', 'sourceReading')):
            stored = passages[data['passageId']]['stored'][b['recordId']]
            require((b['payloadSha256'], b['payloadFormat']) == (stored['payloadSha256'], stored['payloadFormat']) and b['store'] and b['revision'],
                    'A citation differs from the stored row: ' + b['recordId'])
    return dict(records=len(changes['records']), held=len(changes['held']), parentRevision=changes['parentRevision'], matchesRebuild=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('step', choices=['prepare', 'check'])
    parser.add_argument('--graph', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--readback', type=Path, action='append', default=[])
    parser.add_argument('--output', type=Path)
    parser.add_argument('--changes', type=Path)
    args = parser.parse_args()
    rows, manifest = read_graph(args.graph, args.revision)
    readbacks = [json.loads(p.read_text()) for p in args.readback]
    aliases, duplicates = (DATA / 'rabbi-he-aliases.json').read_bytes(), (DATA / 'rabbi-duplicates.json').read_bytes()
    if args.step == 'prepare':
        require(args.output and not args.output.exists(), 'Give a new --output folder')
        changes = build(rows, manifest, readbacks, aliases, duplicates)
        result = validate_changes(changes, rows, manifest, readbacks, aliases, duplicates)
        args.output.mkdir(parents=True)
        (args.output / 'changes.json').write_text(json.dumps(changes, ensure_ascii=False, sort_keys=True, indent=1) + '\n')
    else:
        result = validate_changes(json.loads(args.changes.read_text()), rows, manifest, readbacks, aliases, duplicates)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
