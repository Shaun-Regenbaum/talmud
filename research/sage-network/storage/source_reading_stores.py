"""Put checked source readings in one of two source-reading databases: Bavli or other texts.

A job goes to the store of the one corpus that all its sources name. Each store is its own D1
database with the unchanged shared-v1 schema. Its rows are the v1 importer's rows, compacted by
`source_reading_store` (format source-reading-store-v2). The legacy graph is not changed.

Checks, in order:
  - `changes_for` rebuilds the v1 rows with the unchanged importer, compacts them, and expands them
    again against the bundles. Only an exact round trip is accepted.
  - `extend_d1` calls `validate_changes`, which repeats that rebuild from the frozen inputs against
    the verified parent revision of the same store.
  - `verify_store` reads a store export back after import. Every passage must expand against the
    R2 artifact downloaded again from its key, and must equal the importer's rows for that bundle.

  route    --capture C --output DIR                     split a capture into one capture per store
  genesis  --store S --output DIR                       the empty first revision of a store
  prepare  --store S --capture C --parent-db DB --parent-revision R --ownership M --ownership-hash H
           --legacy-db DB --legacy-revision R --output DIR
  verify   --export SQL --manifest M --artifacts DIR --ownership M H [--parent-receipt R0] --receipt R
  readback --export SQL --manifest M --artifacts DIR --ownership M H --output FILE   every passage, stored and rebuilt
"""
import copy
import hashlib
import json
import sqlite3
import sys
import tempfile
from collections import Counter
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import source_readings as v1  # noqa: E402
import source_reading_store as compact_store  # noqa: E402
from prepare_d1 import encode  # noqa: E402
from shared_records import FORMAT as SHARED_FORMAT, record_table  # noqa: E402
from source_coverage import pinned_index, records as coverage_records  # noqa: E402

VERSION = 'source-reading-stores-v1'
READBACK_VERSION = 'source-reading-store-readback-v1'
# Each store accepts only its reviewed ownership manifest, the same pins the source-binding release used.
STORES = {
    'bavli': dict(database='talmud-source-readings-bavli', corpora=['bavli'], ownershipSource='full-bavli-tiles v1',
                  ownershipManifestSha256='42a7236ec9db64b1382f12ffe7493a38a096c71f4f1c75c229b3c9b9b7df5176'),
    'other': dict(database='talmud-source-readings-other',
                  corpora=['midrash-aggadah', 'midrash-halakhah', 'minor-tractates', 'mishnah', 'tosefta', 'yerushalmi'],
                  ownershipSource='full-other-texts-tiles v3',
                  ownershipManifestSha256='da0c4ed080e12faf1c2eedcdddae54576baaf5bccefc6b5ea0bf7ff7385498d5'),
}
NEWEST = "SELECT id FROM sage_graph_revisions WHERE state='verified' ORDER BY created_at DESC, id DESC LIMIT 1"
KINDS = v1.KINDS | {'source_reading_run'}
CHANGE_FIELDS = {'parentRevision', 'description', 'sourceReadingStore', 'sourceReadingVersion', 'sourceReadingBundles',
                 'sourceReadingInputs', 'sourceReadingOwnership', 'legacyGraphRevision', 'records'}
COLUMNS = 'record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json'


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def store_for(job):
    """The store of the one corpus that every source of the job names."""
    corpora = {s.get('provenance', {}).get('corpus') for s in job['sources']}
    require(len(corpora) == 1, 'A job must come from one corpus: ' + str(job.get('job_id')))
    corpus = next(iter(corpora))
    names = [name for name, store in STORES.items() if corpus in store['corpora']]
    require(len(names) == 1, 'Unknown corpus: ' + str(corpus))
    return names[0]


def store_block(name):
    require(name in STORES, 'Unknown source-reading store: ' + str(name))
    store = STORES[name]
    return dict(name=name, database=store['database'], corpora=list(store['corpora']),
                recordFormat=compact_store.FORMAT, importVersion=VERSION)


def revision_prefix(name):
    return 'source-readings-' + name + '-'


def item(row):
    return dict(record_id=row[0], kind=row[1], passage_id=row[2], ref=row[3], subject_id=row[4], object_id=row[5],
                authority=row[6], decision=row[7], data=json.loads(row[-1]))


def passage_id(bundle):
    return v1.records(bundle)[0]['passage_id']


def changes_for(store, bundles, parent_revision, input_artifacts, ownership, legacy_revision, existing=None):
    """`existing`: record ID -> compact row already in the parent revision of the same store."""
    block = store_block(store)
    require(isinstance(bundles, list) and bool(bundles), 'No source readings')
    for bundle in bundles:
        require(store_for(bundle['job']) == store, 'Job belongs to another store: ' + str(bundle['job'].get('job_id')))
    require(ownership is not None, 'A source-reading store needs a pinned ownership manifest')
    require(ownership['manifest']['manifest'].get('sourceVersion') == STORES[store]['ownershipSource'],
            'Ownership manifest belongs to another store')
    require(ownership['expectedManifestSha256'] == STORES[store]['ownershipManifestSha256'],
            'Ownership manifest is not the reviewed one for this store')
    require(isinstance(legacy_revision, str) and legacy_revision.startswith('sage-graph-'),
            'Name the verified legacy graph revision these readings were checked against')
    # The unchanged importer rebuilds every v1 row from the frozen inputs, with publication ownership.
    rows = v1.changes_for(bundles, parent_revision, input_artifacts, None, ownership)['records']
    compacted = compact_store.compact(rows)
    require(compact_store.expand(compacted, {passage_id(b): b for b in bundles}) == rows,
            'Compact rows do not rebuild the importer rows exactly')
    existing = existing or {}
    changed = []
    for row in compacted:
        old = existing.get(row['record_id'])
        if old is not None:
            require(old == row, 'Existing store record differs: ' + row['record_id'])
        else:
            changed.append(row)
    return dict(parentRevision=parent_revision, description=f'Add compact initial source readings to the {store} store',
                sourceReadingStore=block, sourceReadingVersion=v1.VERSION, sourceReadingBundles=copy.deepcopy(bundles),
                sourceReadingInputs=copy.deepcopy(input_artifacts), sourceReadingOwnership=copy.deepcopy(ownership),
                legacyGraphRevision=legacy_revision, records=changed)


def is_store(manifest):
    return 'sourceReadingStore' in manifest


def validate_changes(changes, rows, parent):
    """Called by extend_d1 for a store parent. A store holds compact source readings and nothing else."""
    require(is_store(parent), 'Compact source readings go to a source-reading store, not the graph')
    require(set(changes) == CHANGE_FIELDS, 'A source-reading store import cannot carry other changes')
    store = changes['sourceReadingStore'].get('name')
    require(changes['sourceReadingStore'] == store_block(store) == parent['sourceReadingStore'],
            'Parent revision belongs to another source-reading store')
    require(parent['revision'].startswith(revision_prefix(store)), 'Parent revision belongs to another source-reading store')
    require(changes['sourceReadingVersion'] == v1.VERSION, 'Unknown source reading import')
    existing = {key: item(row) for key, row in rows.items()}
    expected = changes_for(store, changes['sourceReadingBundles'], changes['parentRevision'], changes['sourceReadingInputs'],
                           changes['sourceReadingOwnership'], changes['legacyGraphRevision'], existing)
    require(changes == expected, 'Store records differ from strict reconstruction')


def quoted(value):
    return "'" + value.replace("'", "''") + "'"


def _newest_is(parent):
    if parent is None:
        return "NOT EXISTS (SELECT 1 FROM sage_graph_revisions WHERE state='verified')"
    return f'({NEWEST})={quoted(parent)}'


def _stop_unless(revision, state):
    # SQL scripts cannot raise. This member row has no version, so NOT NULL refuses it (and so do the
    # shared-record triggers of migration 0003). It is inserted only when the check fails, which stops the script.
    return (f"INSERT INTO sage_graph_revision_members(revision_id,record_id,version_id) SELECT {quoted(revision)},"
            f"'store-release-check',NULL WHERE NOT EXISTS (SELECT 1 FROM sage_graph_revisions WHERE id={quoted(revision)} "
            f"AND state={quoted(state)});")


def revision_sql(revision, manifest, parent):
    """The loading revision row of a store release. It is inserted only in its own store and only on top of
    its parent while that parent is still the newest verified revision. Otherwise the script stops."""
    own = quoted(revision_prefix(manifest['sourceReadingStore']['name']) + '%')
    insert = (f"INSERT INTO sage_graph_revisions(id,manifest_json,state) SELECT {quoted(revision)},{quoted(encode(manifest))},"
              f"'loading' WHERE {_newest_is(parent)} AND NOT EXISTS (SELECT 1 FROM sage_graph_revisions WHERE id NOT LIKE {own});")
    return [insert, _stop_unless(revision, 'loading')]


def activate_sql(revision, parent):
    """Activate only while the parent is still the newest verified revision, so two releases built on one
    parent, or activated out of order, cannot both become current. The release must also sort after its
    parent, or readers would keep the parent. A refused activation stops the script."""
    later = '' if parent is None else (f" AND (created_at,id)>(SELECT created_at,id FROM sage_graph_revisions "
                                       f"WHERE id={quoted(parent)})")
    return (f"UPDATE sage_graph_revisions SET state='verified' WHERE id={quoted(revision)} AND state='loading' "
            f"AND {_newest_is(parent)}{later};\n{_stop_unless(revision, 'verified')}\n")


def genesis(store):
    """The empty first revision of a store, as extend_d1 would write it. Nothing to verify but the schema."""
    manifest = dict(schemaVersion=1, parentRevision=None, change=f'Create the empty {store} source-reading store',
                    recordCount=0, countsByKind={}, recordSetSha256=digest(encode([])),
                    storageFormat=SHARED_FORMAT, sourceReadingStore=store_block(store))
    revision = revision_prefix(store) + digest(encode(manifest))[:20]
    return {
        'import.sql': '\n'.join(revision_sql(revision, manifest, None)) + '\n',
        'manifest.json': json.dumps(dict(revision=revision, **manifest), indent=2) + '\n',
        'activate.sql': activate_sql(revision, None),
    }


def route(capture):
    """Split a capture into one capture per store. Every bundle goes to exactly one store."""
    out = {name: dict(bundles=[], inputArtifacts={}) for name in STORES}
    for bundle in capture['bundles']:
        part = out[store_for(bundle['job'])]
        part['bundles'].append(bundle)
        key = bundle['inputProof']['sha256']
        part['inputArtifacts'][key] = capture['inputArtifacts'][key]
    receipt = dict(version=VERSION, bundles=len(capture['bundles']),
                   stores={name: dict(bundles=len(p['bundles']), jobIds=[b['job']['job_id'] for b in p['bundles']])
                           for name, p in out.items()})
    require(sum(s['bundles'] for s in receipt['stores'].values()) == len(capture['bundles']), 'Routing lost a bundle')
    return out, receipt


def verify_store(export, manifest_path, artifacts, ownership_specs, parent_receipt=None, full=False):
    """Read a store export back after an import. Records new in this revision are rebuilt from their R2
    artifacts, downloaded again, and must equal the importer's rows. Records kept from the parent must be
    the parent's exact versions; the parent's own read-back receipt covers them. With `full`, every
    passage is rebuilt, whatever its parent's receipt says."""
    return _read_back(export, manifest_path, artifacts, ownership_specs, parent_receipt, full)[0]


def readback(export, manifest_path, artifacts, ownership_specs):
    """Every passage of a store revision, as stored and as the v1 importer rebuilds it, for consumers that
    cite stored rows. Every passage is rebuilt from its R2 artifact first; nothing is written otherwise."""
    receipt, passages = _read_back(export, manifest_path, artifacts, ownership_specs, None, True)
    # A consumer cites a published revision, never one still loading.
    require(receipt['revisionState'] == 'verified', 'Only a verified revision can be read back for citing')
    # The receipt covers the rows too, so it cannot travel with edited ones.
    receipt = dict(receipt, passagesSha256=digest(encode(passages)))
    return dict(version=READBACK_VERSION, store=receipt['store'], revision=receipt['revision'],
                parentRevision=receipt['parentRevision'], recordSetSha256=receipt['recordSetSha256'],
                readBack=receipt, readBackSha256=digest(encode(receipt)), complete=True, passages=passages)


def _read_back(export, manifest_path, artifacts, ownership_specs, parent_receipt, full):
    from verify_d1 import verify
    checked = verify(export, manifest_path)
    manifest = json.loads(manifest_path.read_text())
    store = manifest.get('sourceReadingStore', {}).get('name')
    require(manifest.get('sourceReadingStore') == store_block(store), 'Not a source-reading store revision')
    require(manifest['revision'].startswith(revision_prefix(store)) and manifest.get('storageFormat') == SHARED_FORMAT,
            'Store revision ID or storage format differs')
    indexes = {spec['expectedManifestSha256']: pinned_index(spec) for spec in ownership_specs}
    with tempfile.TemporaryDirectory() as temporary, closing(sqlite3.connect(Path(temporary) / 'store.sqlite')) as db:
        db.executescript(export.read_text())
        raw = list(db.execute(f'SELECT {COLUMNS} FROM {record_table(db)} WHERE revision_id=? ORDER BY record_id',
                              (manifest['revision'],)))
        found = [item(r) for r in raw]
        hashes = {r[0]: r[8] for r in raw}
        members = lambda revision: dict(db.execute(
            'SELECT record_id,version_id FROM sage_graph_revision_members WHERE revision_id=?', (revision,)))
        mine, inherited = members(manifest['revision']), {}
        state = db.execute('SELECT state FROM sage_graph_revisions WHERE id=?', (manifest['revision'],)).fetchone()[0]
        parent = manifest.get('parentRevision')
        if parent:
            inherited = members(parent)
            require(all(mine.get(key) == version for key, version in inherited.items()),
                    'A store release cannot change or drop a parent record')
            parent_manifest = json.loads(db.execute('SELECT manifest_json FROM sage_graph_revisions WHERE id=?',
                                                    (parent,)).fetchone()[0])
            if inherited and not full:
                require(isinstance(parent_receipt, dict) and parent_receipt.get('revision') == parent
                        and parent_receipt.get('matchesImporter') is True
                        and parent_receipt.get('recordSetSha256') == parent_manifest['recordSetSha256'],
                        'The parent revision needs its own read-back receipt')
    require(all(r['kind'] in KINDS for r in found), 'Unexpected record kind in a source-reading store')
    runs = [r for r in found if r['kind'] == 'source_reading_run']
    for r in runs:
        key = v1.digest(r['data']['manifest'])
        require(r == dict(record_id='source_reading_run:' + key, kind='source_reading_run', passage_id=None, ref=None,
                          subject_id=None, object_id=None, authority='screening', decision='needs_review',
                          data=dict(format=compact_store.FORMAT, manifestSha256=key, manifest=r['data']['manifest'])),
                'Run row differs from its manifest: ' + r['record_id'])
    by_passage = {}
    for r in found:
        if r['kind'] != 'source_reading_run':
            by_passage.setdefault(r['passage_id'], []).append(r)
    used, bundles, passages = set(), {}, {}
    for pid, group in by_passage.items():
        envelopes = [r for r in group if r['kind'] == 'source_reading']
        require(len(envelopes) == 1, 'A passage needs exactly one source_reading envelope')
        provenance = envelopes[0]['data']['provenance']
        used.add(provenance['inputProof']['manifestSha256'])
        if not full and all(r['record_id'] in inherited for r in group):
            continue  # unchanged since the parent, whose receipt covers it
        path = artifacts / (provenance['artifactSha256'] + '.json')
        require(path.exists(), 'Missing downloaded R2 artifact: ' + path.name)
        # The downloaded bytes must be the artifact the envelope names before any of it is parsed.
        raw = path.read_bytes()
        require(hashlib.sha256(raw).hexdigest() == provenance['artifactSha256'] and len(raw) == provenance['artifactBytes'],
                'Downloaded R2 file differs from its envelope: ' + path.name)
        bundle = json.loads(raw)
        compact_store.verify_artifact(envelopes[0]['data'], bundle)
        require(store_for(bundle['job']) == store, 'Passage belongs to another store: ' + pid)
        coverage = [r for r in group if r['kind'] == 'source_reading_coverage']
        require(len(coverage) == 1, 'A store passage needs its ownership record')
        pins = {a['ownershipManifestSha256'] for a in coverage[0]['data']['sources']}
        require(len(pins) == 1 and next(iter(pins)) in indexes, 'Ownership manifest is not pinned for this check')
        require(next(iter(pins)) == STORES[store]['ownershipManifestSha256'], 'Ownership manifest is not the reviewed one')
        expected = v1.records(bundle) + coverage_records(bundle['job'], pid, indexes[next(iter(pins))])
        require(expected[0]['passage_id'] == pid, 'Artifact belongs to another passage: ' + pid)
        expanded = compact_store.expand(group + runs, {pid: bundle})
        require(sorted(expanded, key=lambda r: r['record_id']) == sorted(expected, key=lambda r: r['record_id']),
                'Stored passage differs from the importer: ' + pid)
        bundles[pid] = provenance['artifactSha256']
        stored = [dict(recordId=r['record_id'], kind=r['kind'], payloadSha256=hashes[r['record_id']],
                       payloadFormat=r['data']['format']) for r in group]
        rebuilt = [dict(row=r, v1PayloadSha256=digest(encode(r['data']))) for r in expanded]
        require({s['recordId'] for s in stored} == {r['row']['record_id'] for r in rebuilt},
                'Stored and rebuilt rows differ: ' + pid)
        passages[pid] = dict(artifactSha256=provenance['artifactSha256'], stored=stored, v1=rebuilt)
    require({r['data']['manifestSha256'] for r in runs} == used, 'Run manifests differ from the readings that use them')
    receipt = dict(checked, store=store, database=STORES[store]['database'], recordSetSha256=manifest['recordSetSha256'],
                   parentRevision=parent, passages=len(by_passage), passagesChecked=len(bundles),
                   passagesFromParent=len(by_passage) - len(bundles),
                   countsByKind=dict(sorted(Counter(r['kind'] for r in found).items())),
                   artifactsChecked=len(bundles), matchesImporter=True, revisionState=state)
    return receipt, passages


def _read_rows(path, revision, keys):
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        require(db.execute('SELECT state FROM sage_graph_revisions WHERE id=?', (revision,)).fetchone() == ('verified',),
                'Revision is not verified: ' + revision)
        manifest = dict(json.loads(db.execute('SELECT manifest_json FROM sage_graph_revisions WHERE id=?', (revision,)).fetchone()[0]),
                        newest=db.execute(NEWEST).fetchone()[0] == revision)
        table = record_table(db)
        rows = {}
        for start in range(0, len(keys), 100):
            chunk = keys[start:start + 100]
            query = f'SELECT {COLUMNS} FROM {table} WHERE revision_id=? AND record_id IN ({",".join("?" for _ in chunk)})'
            rows.update((r[0], r) for r in db.execute(query, (revision, *chunk)))
        return manifest, rows


def prepare(store, capture, parent_db, parent_revision, ownership, legacy_db, legacy_revision, output):
    index = pinned_index(ownership)
    bundles, held = [], []
    for bundle in capture['bundles']:
        try:
            v1.checked_bundle(bundle)
            # A store reading always records ownership, so a job outside the manifest waits for one.
            index.sources_for(bundle['job'])
        except (ValueError, KeyError, TypeError) as error:
            held.append(dict(jobId=bundle.get('job', {}).get('job_id'), bundleSha256=v1.digest(bundle),
                             status='needs_review', reason=str(error)))
        else:
            bundles.append(bundle)
    require(bool(bundles), 'No fully validated readings; no import created')
    used = {b['inputProof']['sha256'] for b in bundles}
    inputs = {key: capture['inputArtifacts'][key] for key in used}
    keys = sorted({r['record_id'] for b in bundles for r in compact_store.records(b, index)})
    parent, existing = _read_rows(parent_db, parent_revision, keys)
    require(parent.get('sourceReadingStore') == store_block(store), 'Parent revision belongs to another store')
    require(parent['newest'], 'A store release must extend the newest verified revision')
    # The legacy graph keeps its own copy of older readings, and the reader prefers it. A store must
    # never hold a reading the graph already has, so a human correction there cannot be shadowed.
    legacy, overlap = _read_rows(legacy_db, legacy_revision, keys)
    require(not is_store(legacy), 'The legacy revision is a source-reading store')
    require(not overlap, 'The legacy graph already holds these records: ' + ', '.join(sorted(overlap)[:5]))
    changes = changes_for(store, bundles, parent_revision, inputs, ownership, legacy_revision,
                          {k: item(r) for k, r in existing.items()})
    output.mkdir(parents=True, exist_ok=False)
    (output / 'artifacts').mkdir()
    for bundle in bundles:
        (output / 'artifacts' / (v1.digest(bundle) + '.json')).write_text(
            json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False))
    for name, value in [('changes.json', changes), ('held.json', held)]:
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    return dict(store=store, records=len(changes['records']), held=len(held), parentRevision=parent_revision)


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('route')
    p.add_argument('--capture', type=Path, required=True); p.add_argument('--output', type=Path, required=True)
    p = sub.add_parser('genesis')
    p.add_argument('--store', choices=sorted(STORES), required=True); p.add_argument('--output', type=Path, required=True)
    p = sub.add_parser('prepare')
    p.add_argument('--store', choices=sorted(STORES), required=True)
    for name in ('--capture', '--parent-db', '--ownership', '--legacy-db', '--output'):
        p.add_argument(name, type=Path, required=True)
    for name in ('--parent-revision', '--ownership-hash', '--legacy-revision'):
        p.add_argument(name, required=True)
    p = sub.add_parser('verify')
    for name in ('--export', '--manifest', '--artifacts', '--receipt'):
        p.add_argument(name, type=Path, required=True)
    p.add_argument('--ownership', nargs=2, action='append', required=True, metavar=('MANIFEST_JSON', 'REVIEWED_SHA256'))
    p.add_argument('--parent-receipt', type=Path, help="The parent revision's read-back receipt, unless it is empty")
    p = sub.add_parser('readback')
    for name in ('--export', '--manifest', '--artifacts', '--output'):
        p.add_argument(name, type=Path, required=True)
    p.add_argument('--ownership', nargs=2, action='append', required=True, metavar=('MANIFEST_JSON', 'REVIEWED_SHA256'))
    args = parser.parse_args()
    if args.command == 'route':
        parts, receipt = route(json.loads(args.capture.read_text()))
        args.output.mkdir(parents=True, exist_ok=False)
        for name, part in parts.items():
            if part['bundles']:
                (args.output / f'capture-{name}.json').write_text(json.dumps(part, ensure_ascii=False) + '\n')
        (args.output / 'routing.json').write_text(json.dumps(receipt, indent=2) + '\n')
        result = {name: s['bundles'] for name, s in receipt['stores'].items()}
    elif args.command == 'genesis':
        args.output.mkdir(parents=True, exist_ok=False)
        for name, content in genesis(args.store).items():
            (args.output / name).write_text(content)
        result = json.loads(genesis(args.store)['manifest.json'])
    elif args.command == 'prepare':
        ownership = dict(manifest=json.loads(args.ownership.read_text()), expectedManifestSha256=args.ownership_hash)
        result = prepare(args.store, json.loads(args.capture.read_text()), args.parent_db, args.parent_revision,
                         ownership, args.legacy_db, args.legacy_revision, args.output)
    elif args.command == 'readback':
        specs = [dict(manifest=json.loads(Path(m).read_text()), expectedManifestSha256=h) for m, h in args.ownership]
        result = readback(args.export, args.manifest, args.artifacts, specs)
        args.output.write_text(json.dumps(result, ensure_ascii=False) + '\n')
        result = {k: result[k] for k in ('store', 'revision', 'recordSetSha256', 'readBackSha256')}
    else:
        specs = [dict(manifest=json.loads(Path(m).read_text()), expectedManifestSha256=h) for m, h in args.ownership]
        parent = json.loads(args.parent_receipt.read_text()) if args.parent_receipt else None
        result = verify_store(args.export, args.manifest, args.artifacts, specs, parent)
        args.receipt.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
