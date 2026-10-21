"""Prepare and check name_candidates records for the graph. Offline: no remote access and no database writes.

A record is built only from checked inputs:
- the graph parent revision, from a verified local export: registry rows, reviewed and human decisions, older
  readings and their source bindings;
- each source reading's rows as checked. A reading the graph holds is read from the graph. A reading a source-reading
  store holds comes from that store's read-back file (`source-reading-store-readback-v1`), which the store owner
  writes only after a full read-back rebuilds every passage from its R2 artifact;
- a pin file root writes for the release (`name-candidates-release-pins-v1`). It names the graph revision and record
  set, and for each read-back file: the sha256 of its exact bytes, the store and its physical database, the revision,
  record set and parent, the export hash, the ownership manifest, the reviewed producer code, and that root found the
  store revision verified. The read-back receipt does not cover the passages, so only that outside pin binds them: a
  file whose bytes differ from its pin is refused, whatever its own fields say. A file never pins itself.

Every JSON input is read strictly: a repeated key or a non-finite number is refused.

Each candidate cites the person, passage and source_reading rows exactly as stored (store, revision, stored hash and
format) together with the rebuilt v1 hash. The check rebuilds every record from the same inputs, refuses any
difference, and re-checks human precedence, coverage at every mention and the alias guards on its own.

The extend_d1 wiring waits until the source-reading store change (PR #802) lands, so the two do not edit the same
lines.
Usage:
  name_candidates_import.py prepare --graph EXPORT.sqlite --revision R --pins PINS [--readback FILE ...] --output DIR
  name_candidates_import.py check --graph EXPORT.sqlite --revision R --pins PINS [--readback FILE ...] --changes CHANGES
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
PINS = 'name-candidates-release-pins-v1'
STORES = ('bavli', 'other')
# The physical store databases and their reviewed ownership manifests (the hashes the source-binding release used).
DATABASES = {'bavli': 'talmud-source-readings-bavli', 'other': 'talmud-source-readings-other'}
REVIEWED_OWNERSHIP = {'bavli': '42a7236ec9db64b1382f12ffe7493a38a096c71f4f1c75c229b3c9b9b7df5176',
                      'other': 'da0c4ed080e12faf1c2eedcdddae54576baaf5bccefc6b5ea0bf7ff7385498d5'}
READBACK_FIELDS = {'version', 'store', 'revision', 'parentRevision', 'recordSetSha256', 'readBack', 'readBackSha256', 'complete', 'passages'}
PIN_FIELDS = {'sha256', 'store', 'database', 'revision', 'recordSetSha256', 'parentRevision', 'exportSha256',
              'ownershipManifestSha256', 'revisionState', 'producer'}
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


def strict_json(text):
    """json.loads that refuses a repeated key or a non-finite number, so one file cannot be read two ways."""
    def pairs(items):
        keys = [k for k, _ in items]
        require(len(keys) == len(set(keys)), 'Repeated JSON key')
        return dict(items)

    def constant(name):
        raise ValueError('Non-finite JSON number: ' + name)
    return json.loads(text.decode() if isinstance(text, bytes) else text, object_pairs_hook=pairs, parse_constant=constant)


def read_graph(path, revision):
    """A verified graph revision from a local export: every payload matches its hash, and the record set its manifest."""
    with sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True) as db:
        saved = db.execute('SELECT manifest_json,state FROM sage_graph_revisions WHERE id=?', (revision,)).fetchone()
        require(saved and saved[1] == 'verified', 'Graph revision is not verified: ' + revision)
        manifest = dict(strict_json(saved[0]), revision=revision)
        rows = list(db.execute(f'SELECT {COLUMNS} FROM {record_table(db)} WHERE revision_id=? ORDER BY record_id', (revision,)))
    for row in rows:
        require(hashlib.sha256(row[-1].encode()).hexdigest() == row[-2], 'Graph payload differs from its hash: ' + row[0])
        strict_json(row[-1])
    require(len(rows) == manifest['recordCount'], 'Graph record count differs from its manifest')
    require(hashlib.sha256(d1_encode([list(r[:-1]) for r in rows]).encode()).hexdigest() == manifest['recordSetSha256'],
            'Graph record set differs from its manifest')
    return rows, manifest


def load_pins(data):
    """Root's release pins, from their own file. Nothing here is ever taken from the files the pins cover."""
    return checked_pins(strict_json(data))


def checked_pins(pins):
    require(isinstance(pins, dict) and pins.get('version') == PINS and set(pins) == {'version', 'graph', 'readbacks'}, 'Not a name_candidates release pin file')
    require(set(pins['graph']) == {'revision', 'recordSetSha256'}, 'Graph pin must name the revision and record set')
    require(all(set(x) == PIN_FIELDS for x in pins['readbacks']), 'Each read-back pin needs exactly: ' + ', '.join(sorted(PIN_FIELDS)))
    for x in pins['readbacks']:
        require(x['store'] in STORES and x['database'] == DATABASES[x['store']], 'A read-back pin names another database')
        require(x['revisionState'] == 'verified', 'Root must find the store revision verified before pinning it')
        require(isinstance(x['producer'], dict) and set(x['producer']) == {'commit', 'codeSha256'} and all(x['producer'].values()),
                'A read-back pin must name the reviewed producer commit and code hash')
    require(len({x['sha256'] for x in pins['readbacks']}) == len(pins['readbacks']), 'A read-back file is pinned twice')
    return pins


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


def back_count(f, key):
    value = (f.get('readBack') or {}).get(key)
    return value if isinstance(value, int) else bool(value)


def readback_passages(files, pins, reviewed_ownership=REVIEWED_OWNERSHIP):
    """Passages from store read-back files. Each file's exact bytes must equal a pin in root's release pins, and every
    pinned file must be given; then the store owner's full read-back must have passed."""
    pinned = {x['sha256']: x for x in pins['readbacks']}
    given = [hashlib.sha256(raw).hexdigest() for raw in files]
    require(len(set(given)) == len(given), 'A read-back file is given twice')
    require(set(given) == set(pinned), 'Read-back files differ from the release pins')
    out, sources = {}, []
    for raw, file_sha in zip(files, given):
        f, pin = strict_json(raw), pinned[file_sha]
        require((f.get('store'), f.get('revision'), f.get('recordSetSha256'), f.get('parentRevision')) ==
                (pin['store'], pin['revision'], pin['recordSetSha256'], pin['parentRevision']), 'Read-back file names another revision than its pin')
        require(f.get('version') == READBACK and f.get('store') in STORES, 'Not a source-reading store read-back file')
        # Checked readings (checked-source-store-v1) are typed, reviewed items, not original reading rows. This version
        # does not match them, so a file that holds any is refused outright, never read in part.
        require(not f.get('checkedPassages') and not back_count(f, 'checkedPassages'),
                'This importer version does not read checked readings; they are held for a separate rule')
        require(set(f) <= READBACK_FIELDS | {'checkedPassages'}, 'Read-back file has fields this version does not know: '
                + ', '.join(sorted(set(f) - READBACK_FIELDS - {'checkedPassages'})))
        require(pin['ownershipManifestSha256'] == reviewed_ownership[pin['store']], 'The pinned ownership manifest is not the reviewed one')
        back = f['readBack']
        require(f.get('complete') is True and back.get('matchesImporter') is True, 'The read-back did not check every passage')
        require(d1_hash(back) == f['readBackSha256'], 'Read-back receipt differs from its hash')
        require((back.get('store'), back.get('revision'), back.get('recordSetSha256'), back.get('parentRevision')) ==
                (f['store'], f['revision'], f['recordSetSha256'], f.get('parentRevision')), 'Read-back receipt names another revision')
        require(back.get('passagesChecked') == back.get('passages') == len(f['passages']), 'The read-back did not rebuild every passage')
        require((back.get('database'), back.get('exportSha256')) == (pin['database'], pin['exportSha256']), 'The read-back read another database or export than its pin')
        # The receipt covers the passages (passagesSha256) and the verified state; readBackSha256 covers the receipt.
        require(back.get('passagesSha256') == d1_hash(f['passages']), 'Passages differ from the read-back receipt')
        require(back.get('revisionState') == 'verified', 'The read-back was of a revision that is not verified')
        for pid, p in f['passages'].items():
            require(pid not in out, 'A passage is in two read-back files: ' + pid)
            stored = {s['recordId']: s for s in p['stored']}
            require(len(stored) == len(p['stored']) and all(s['payloadFormat'] == STORE_FORMAT for s in stored.values()),
                    'Stored rows repeat or are not compact store rows: ' + pid)
            v1 = [x['row'] for x in p['v1']]
            hashes = {x['row']['record_id']: x['v1PayloadSha256'] for x in p['v1']}
            require(set(hashes) == set(stored) and len(hashes) == len(v1), 'Stored and rebuilt rows differ: ' + pid)
            coverage = [r for r in v1 if r['kind'] == 'source_reading_coverage']
            require(len(coverage) == 1 and {s.get('ownershipManifestSha256') for s in coverage[0]['data']['sources']} == {pin['ownershipManifestSha256']},
                    'A passage is owned under another manifest than its pin: ' + pid)
            for row in v1:
                require(row['passage_id'] == pid and stored[row['record_id']]['kind'] == row['kind'], 'Row belongs elsewhere: ' + row['record_id'])
                require(d1_hash(row['data']) == hashes[row['record_id']], 'Rebuilt row differs from its v1 hash: ' + row['record_id'])
            out[pid] = dict(store=f['store'], revision=f['revision'], stored=stored, v1=v1, v1Sha256=hashes)
        sources.append(dict(store=f['store'], revision=f['revision'], parentRevision=f.get('parentRevision'),
                            recordSetSha256=f['recordSetSha256'], readBackSha256=f['readBackSha256'], fileSha256=file_sha,
                            database=pin['database'], exportSha256=pin['exportSha256'], ownershipManifestSha256=pin['ownershipManifestSha256'],
                            producer=pin['producer']))
    return out, sorted(sources, key=nc.encode)


def readings(graph_rows, readbacks, pins, reviewed_ownership=REVIEWED_OWNERSHIP):
    held, sources = readback_passages(readbacks, pins, reviewed_ownership)
    own = graph_passages(graph_rows)
    both = set(own) & set(held)
    require(not both, 'A reading is in the graph and in a store; the graph copy wins, so the store copy cannot be cited: ' + ', '.join(sorted(both)))
    return {**own, **held}, sources


def build(graph_rows, graph_manifest, readbacks, pins, he_aliases_bytes, duplicates_bytes, reviewed_ownership=REVIEWED_OWNERSHIP):
    """readbacks: the exact bytes of each read-back file. pins: root's release pins, from load_pins.
    reviewed_ownership: the reviewed ownership manifest per store; only tests on a test-made store pass another."""
    parent = graph_manifest['revision']
    pins = checked_pins(pins)
    require(pins['graph'] == dict(revision=parent, recordSetSha256=graph_manifest['recordSetSha256']), 'The graph parent differs from the release pins')
    require(not any(r[1] == nc.KIND for r in graph_rows), 'The parent already holds name_candidates records; this version only adds')
    passages, sources = readings(graph_rows, readbacks, pins, reviewed_ownership)
    registry = nc.registry_index([(r[0], r[-2], r[-1]) for r in graph_rows if r[1] == 'registry_person'], strict_json(he_aliases_bytes))
    duplicates = strict_json(duplicates_bytes)['duplicates']
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
                    importerFileSha256=nc.sha256_file(__file__), graphRecordSetSha256=graph_manifest['recordSetSha256'], sources=sources,
                    pinsSha256=d1_hash(pins))
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


def validate_changes(changes, graph_rows, graph_manifest, readbacks, pins, he_aliases_bytes, duplicates_bytes, reviewed_ownership=REVIEWED_OWNERSHIP):
    """Rebuild everything from the same inputs and refuse any difference; then check the rules a second time."""
    expected = build(graph_rows, graph_manifest, readbacks, pins, he_aliases_bytes, duplicates_bytes, reviewed_ownership)
    require(nc.encode(changes) == nc.encode(expected), 'Changes differ from a rebuild from the checked inputs')
    passages, _ = readings(graph_rows, readbacks, pins, reviewed_ownership)
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
    parser.add_argument('--pins', type=Path, required=True, help="Root's release pins; never generated from the inputs they pin")
    parser.add_argument('--readback', type=Path, action='append', default=[])
    parser.add_argument('--output', type=Path)
    parser.add_argument('--changes', type=Path)
    args = parser.parse_args()
    rows, manifest = read_graph(args.graph, args.revision)
    readbacks = [p.read_bytes() for p in args.readback]
    pins = load_pins(args.pins.read_bytes())
    aliases, duplicates = (DATA / 'rabbi-he-aliases.json').read_bytes(), (DATA / 'rabbi-duplicates.json').read_bytes()
    if args.step == 'prepare':
        require(args.output and not args.output.exists(), 'Give a new --output folder')
        changes = build(rows, manifest, readbacks, pins, aliases, duplicates)
        result = validate_changes(changes, rows, manifest, readbacks, pins, aliases, duplicates)
        args.output.mkdir(parents=True)
        (args.output / 'changes.json').write_text(json.dumps(changes, ensure_ascii=False, sort_keys=True, indent=1) + '\n')
    else:
        result = validate_changes(strict_json(args.changes.read_bytes()), rows, manifest, readbacks, pins, aliases, duplicates)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
