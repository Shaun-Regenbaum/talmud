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
  verify   --export SQL --manifest M --artifacts DIR --ownership M H --receipt R
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
STORES = {
    'bavli': dict(database='talmud-source-readings-bavli', corpora=['bavli'], ownershipSource='full-bavli-tiles v1'),
    'other': dict(database='talmud-source-readings-other',
                  corpora=['midrash-aggadah', 'midrash-halakhah', 'minor-tractates', 'mishnah', 'tosefta', 'yerushalmi'],
                  ownershipSource='full-other-texts-tiles v3'),
}
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


def genesis(store):
    """The empty first revision of a store, as extend_d1 would write it. Nothing to verify but the schema."""
    manifest = dict(schemaVersion=1, parentRevision=None, change=f'Create the empty {store} source-reading store',
                    recordCount=0, countsByKind={}, recordSetSha256=digest(encode([])),
                    storageFormat=SHARED_FORMAT, sourceReadingStore=store_block(store))
    revision = revision_prefix(store) + digest(encode(manifest))[:20]
    quoted = lambda value: "'" + value.replace("'", "''") + "'"
    return {
        'import.sql': f"INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES ({quoted(revision)},{quoted(encode(manifest))},'loading');\n",
        'manifest.json': json.dumps(dict(revision=revision, **manifest), indent=2) + '\n',
        'activate.sql': f"UPDATE sage_graph_revisions SET state='verified' WHERE id={quoted(revision)} AND state='loading';\n",
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


def verify_store(export, manifest_path, artifacts, ownership_specs):
    """Read a store export back: every passage expands against its R2 artifact and equals the importer."""
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
        found = [item(r) for r in db.execute(f'SELECT {COLUMNS} FROM {record_table(db)} WHERE revision_id=? ORDER BY record_id',
                                             (manifest['revision'],))]
    require(all(r['kind'] in KINDS for r in found), 'Unexpected record kind in a source-reading store')
    runs = {r['data']['manifestSha256'] for r in found if r['kind'] == 'source_reading_run'}
    by_passage = {}
    for r in found:
        if r['kind'] != 'source_reading_run':
            by_passage.setdefault(r['passage_id'], []).append(r)
    used, bundles = set(), {}
    for pid, group in by_passage.items():
        envelopes = [r for r in group if r['kind'] == 'source_reading']
        require(len(envelopes) == 1, 'A passage needs exactly one source_reading envelope')
        provenance = envelopes[0]['data']['provenance']
        used.add(provenance['inputProof']['manifestSha256'])
        path = artifacts / (provenance['artifactSha256'] + '.json')
        require(path.exists(), 'Missing downloaded R2 artifact: ' + path.name)
        bundle = json.loads(path.read_text())
        # The downloaded file must be the artifact the envelope names before any of it is used.
        compact_store.verify_artifact(envelopes[0]['data'], bundle)
        require(store_for(bundle['job']) == store, 'Passage belongs to another store: ' + pid)
        coverage = [r for r in group if r['kind'] == 'source_reading_coverage']
        require(len(coverage) == 1, 'A store passage needs its ownership record')
        pins = {a['ownershipManifestSha256'] for a in coverage[0]['data']['sources']}
        require(len(pins) == 1 and next(iter(pins)) in indexes, 'Ownership manifest is not pinned for this check')
        expected = v1.records(bundle) + coverage_records(bundle['job'], pid, indexes[next(iter(pins))])
        require(expected[0]['passage_id'] == pid, 'Artifact belongs to another passage: ' + pid)
        expanded = compact_store.expand(group + [r for r in found if r['kind'] == 'source_reading_run'], {pid: bundle})
        require(sorted(expanded, key=lambda r: r['record_id']) == sorted(expected, key=lambda r: r['record_id']),
                'Stored passage differs from the importer: ' + pid)
        bundles[pid] = provenance['artifactSha256']
    require(runs == used, 'Run manifests differ from the readings that use them')
    return dict(checked, store=store, database=STORES[store]['database'], passages=len(by_passage),
                countsByKind=dict(sorted(Counter(r['kind'] for r in found).items())),
                artifactsChecked=len(bundles), matchesImporter=True)


def _read_rows(path, revision, keys):
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        require(db.execute('SELECT state FROM sage_graph_revisions WHERE id=?', (revision,)).fetchone() == ('verified',),
                'Revision is not verified: ' + revision)
        manifest = json.loads(db.execute('SELECT manifest_json FROM sage_graph_revisions WHERE id=?', (revision,)).fetchone()[0])
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
    else:
        specs = [dict(manifest=json.loads(Path(m).read_text()), expectedManifestSha256=h) for m, h in args.ownership]
        result = verify_store(args.export, args.manifest, args.artifacts, specs)
        args.receipt.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
