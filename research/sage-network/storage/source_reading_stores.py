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
# A store under contract 2 holds checked source readings as well. A store moves to it only by an
# explicit upgrade revision; the compact rows and their decoder stay as they are.
CONTRACT_2 = 'source-reading-stores-v2'
READBACK_VERSION = 'source-reading-store-readback-v1'
# Checked rows a read-back carries in full, so consumers such as the name-candidate importer cite rows the receipt covers.
CHECKED_ROWS_FOR_CONSUMERS = ('checked_reading', 'checked_person', 'checked_ownership', 'checked_coverage', 'checked_decision')
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
# Every kind a store revision may hold, compact or checked; a contract 1 store refuses the checked ones.
STORE_KINDS = KINDS | {'checked_reading', 'checked_person', 'checked_connection', 'checked_decision',
                       'checked_coverage', 'checked_unit', 'checked_ownership'}
CHANGE_FIELDS = {'parentRevision', 'description', 'sourceReadingStore', 'sourceReadingVersion', 'sourceReadingBundles',
                 'sourceReadingInputs', 'sourceReadingOwnership', 'legacyGraphRevision', 'records'}
CHECKED_FIELDS = {'parentRevision', 'description', 'sourceReadingStore', 'checkedSelection', 'checkedRootApprovals',
                  'checkedBundles', 'sourceReadingOwnership', 'legacyGraphRevision', 'records'}
UPGRADE_FIELDS = {'parentRevision', 'description', 'sourceReadingStoreUpgrade', 'records'}
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


def store_block(name, contract=1):
    require(name in STORES, 'Unknown source-reading store: ' + str(name))
    store = STORES[name]
    base = dict(name=name, database=store['database'], corpora=list(store['corpora']))
    if contract == 1:
        return dict(base, recordFormat=compact_store.FORMAT, importVersion=VERSION)
    require(contract == 2, 'Unknown source-reading store contract')
    import checked_source_store
    return dict(base, recordFormats=[compact_store.FORMAT, checked_source_store.FORMAT], importVersion=CONTRACT_2)


def contract_of(block):
    """1 or 2 for a known block of a known store, else None."""
    name = block.get('name') if isinstance(block, dict) else None
    return next((c for c in (1, 2) if name in STORES and block == store_block(name, c)), None)


def pinned_ownership(store, ownership):
    require(ownership is not None, 'A source-reading store needs a pinned ownership manifest')
    require(ownership['manifest']['manifest'].get('sourceVersion') == STORES[store]['ownershipSource'],
            'Ownership manifest belongs to another store')
    require(ownership['expectedManifestSha256'] == STORES[store]['ownershipManifestSha256'],
            'Ownership manifest is not the reviewed one for this store')


def upgrade_changes(block, parent_revision):
    """The explicit revision that lets a store hold checked readings. It adds and changes no record."""
    require(contract_of(block) == 1, 'Only a contract 1 store can be upgraded')
    return dict(parentRevision=parent_revision, description=f"Let the {block['name']} store hold checked source readings",
                sourceReadingStoreUpgrade=dict(fromBlock=block, toBlock=store_block(block['name'], 2)), records=[])


def revision_prefix(name):
    return 'source-readings-' + name + '-'


def item(row):
    return dict(record_id=row[0], kind=row[1], passage_id=row[2], ref=row[3], subject_id=row[4], object_id=row[5],
                authority=row[6], decision=row[7], data=json.loads(row[-1]))


def passage_id(bundle):
    return v1.records(bundle)[0]['passage_id']


def changes_for(store, bundles, parent_revision, input_artifacts, ownership, legacy_revision, existing=None, block=None):
    """`existing`: record ID -> compact row already in the parent revision of the same store. `block` is
    the parent's store block, contract 1 by default."""
    block = block or store_block(store)
    require(contract_of(block) and block['name'] == store, 'Unknown store block')
    require(isinstance(bundles, list) and bool(bundles), 'No source readings')
    for bundle in bundles:
        require(store_for(bundle['job']) == store, 'Job belongs to another store: ' + str(bundle['job'].get('job_id')))
    pinned_ownership(store, ownership)
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


def validate_changes(changes, rows, parent, checked_selections=()):
    """Called by extend_d1 for a store parent. A store holds compact and checked source readings and
    nothing else. Returns the store block of the new revision. `checked_selections` are the SHA-256s of
    root's checked release selections, given by the caller and never taken from the changes."""
    require(is_store(parent), 'Compact source readings go to a source-reading store, not the graph')
    block = parent['sourceReadingStore']
    store = block.get('name') if isinstance(block, dict) else None
    require(contract_of(block), 'Parent revision has an unknown store block')
    require(parent['revision'].startswith(revision_prefix(store)), 'Parent revision belongs to another source-reading store')
    existing = {key: item(row) for key, row in rows.items()}
    if 'sourceReadingStoreUpgrade' in changes:
        require(set(changes) == UPGRADE_FIELDS and changes == upgrade_changes(block, parent['revision']),
                'Store contract upgrade differs')
        return changes['sourceReadingStoreUpgrade']['toBlock']
    if 'checkedSelection' in changes:
        import checked_source_store
        require(set(changes) == CHECKED_FIELDS, 'A checked store import cannot carry other changes')
        require(changes['sourceReadingStore'] == block, 'Parent revision belongs to another source-reading store')
        pin = digest(changes['checkedSelection'])
        require(pin in set(checked_selections), 'Checked release selection is not pinned by the caller')
        pinned_ownership(store, changes['sourceReadingOwnership'])
        expected = checked_source_store.changes_for(
            block, changes['checkedSelection'], pin, changes['checkedRootApprovals'], changes['checkedBundles'],
            changes['sourceReadingOwnership'], changes['parentRevision'], changes['legacyGraphRevision'], existing)
        require(changes == expected, 'Checked store records differ from strict reconstruction')
        return block
    require(set(changes) == CHANGE_FIELDS, 'A source-reading store import cannot carry other changes')
    require(changes['sourceReadingStore'] == block, 'Parent revision belongs to another source-reading store')
    require(changes['sourceReadingVersion'] == v1.VERSION, 'Unknown source reading import')
    expected = changes_for(store, changes['sourceReadingBundles'], changes['parentRevision'], changes['sourceReadingInputs'],
                           changes['sourceReadingOwnership'], changes['legacyGraphRevision'], existing, block)
    require(changes == expected, 'Store records differ from strict reconstruction')
    return block


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


def genesis(store, contract=1):
    """The empty first revision of a store, as extend_d1 would write it. Nothing to verify but the schema."""
    manifest = dict(schemaVersion=1, parentRevision=None, change=f'Create the empty {store} source-reading store',
                    recordCount=0, countsByKind={}, recordSetSha256=digest(encode([])),
                    storageFormat=SHARED_FORMAT, sourceReadingStore=store_block(store, contract))
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


def verify_store(export, manifest_path, artifacts, ownership_specs, parent_receipt=None, full=False, checked=None):
    """Read a store export back after an import. Records new in this revision are rebuilt from their R2
    artifacts, downloaded again, and must equal the importer's rows. Records kept from the parent must be
    the parent's exact versions; the parent's own read-back receipt covers them. With `full`, every
    passage is rebuilt, whatever its parent's receipt says. `checked` lists root's checked selections,
    each `dict(selection=TEXT, pin=SHA256 given separately, approvals={file hash: text})`. A single dict
    remains supported. All stored selections are required, including selections inherited from the parent."""
    return _read_back(export, manifest_path, artifacts, ownership_specs, parent_receipt, full, checked)[0]


def readback(export, manifest_path, artifacts, ownership_specs, checked=None):
    """Every passage of a store revision, as stored and as the v1 importer rebuilds it, for consumers that
    cite stored rows. Every passage is rebuilt from its R2 artifact first; nothing is written otherwise."""
    receipt, passages, checked_passages = _read_back(export, manifest_path, artifacts, ownership_specs, None, True,
                                                     checked, with_checked=True)
    # A consumer cites a published revision, never one still loading.
    require(receipt['revisionState'] == 'verified', 'Only a verified revision can be read back for citing')
    # The receipt covers the rows too, so it cannot travel with edited ones.
    receipt = dict(receipt, passagesSha256=digest(encode(passages)),
                   checkedPassagesSha256=digest(encode(checked_passages)))
    return dict(version=READBACK_VERSION, store=receipt['store'], revision=receipt['revision'],
                parentRevision=receipt['parentRevision'], recordSetSha256=receipt['recordSetSha256'],
                readBack=receipt, readBackSha256=digest(encode(receipt)), complete=True, passages=passages,
                checkedPassages=checked_passages)


def _read_back(export, manifest_path, artifacts, ownership_specs, parent_receipt, full, checked=None, with_checked=False):
    from verify_d1 import verify
    exported = verify(export, manifest_path)
    manifest = json.loads(manifest_path.read_text())
    store = manifest.get('sourceReadingStore', {}).get('name')
    contract = contract_of(manifest.get('sourceReadingStore'))
    require(contract, 'Not a source-reading store revision')
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
    import checked_source_store
    allowed = KINDS | (checked_source_store.KINDS if contract == 2 else set())
    require(all(r['kind'] in allowed for r in found), 'Unexpected record kind in a source-reading store')
    selections = checked_source_store.selection_index(checked)
    envelopes = [r for r in found if r['kind'] == 'checked_reading']
    require({r['data']['selectionSha256'] for r in envelopes} <= set(selections),
            "Checked readings need root's pinned selection for every stored selection")
    raw_results = [r['data']['supersedes']['rawResultHash'] for r in envelopes]
    require(len(raw_results) == len(set(raw_results)), 'Two checked versions of one raw result')
    checked_passages = {}
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
        if pid.startswith('cs1-'):
            envelope = [r for r in group if r['kind'] == 'checked_reading']
            require(len(envelope) == 1, 'A checked reading needs exactly one envelope')
            data = envelope[0]['data']
            selection_pin = data['selectionSha256']
            cases = selections[selection_pin]
            require(data['jobId'] in cases, 'Checked reading is absent from its pinned selection')
            if not full and all(r['record_id'] in inherited for r in group):
                continue  # unchanged since the parent, whose receipt covers it
            path = artifacts / (data['artifact']['sha256'] + '.json')
            require(path.exists(), 'Missing downloaded R2 artifact: ' + path.name)
            raw = path.read_bytes()
            require(hashlib.sha256(raw).hexdigest() == data['artifact']['sha256'] == data['bundleFileSha256']
                    and len(raw) == data['artifact']['bytes'], 'Downloaded R2 file differs from its envelope: ' + path.name)
            pin = STORES[store]['ownershipManifestSha256']
            require(pin in indexes, 'Ownership manifest is not pinned for this check')
            name, expected = checked_source_store.records(raw.decode(), cases[data['jobId']], indexes[pin], selection_pin)
            require(name == store and sorted(group, key=lambda r: r['record_id']) == sorted(expected, key=lambda r: r['record_id']),
                    'Stored checked reading differs from its approved artifact: ' + pid)
            bundles[pid] = data['artifact']['sha256']
            checked_passages[pid] = dict(
                artifactSha256=data['artifact']['sha256'], jobId=data['jobId'],
                stored=[dict(recordId=r['record_id'], kind=r['kind'], payloadSha256=hashes[r['record_id']],
                             payloadFormat=r['data']['format']) for r in group],
                # The rows a name-candidate consumer reads, exactly as stored and just checked against the artifact.
                rows=sorted((r for r in group if r['kind'] in CHECKED_ROWS_FOR_CONSUMERS), key=lambda r: r['record_id']))
            continue
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
    receipt = dict(exported, store=store, database=STORES[store]['database'], recordSetSha256=manifest['recordSetSha256'],
                   parentRevision=parent, passages=len(by_passage), passagesChecked=len(bundles),
                   passagesFromParent=len(by_passage) - len(bundles),
                   countsByKind=dict(sorted(Counter(r['kind'] for r in found).items())),
                   artifactsChecked=len(bundles), matchesImporter=True, revisionState=state,
                   checkedPassages=len(checked_passages))
    return (receipt, passages, checked_passages) if with_checked else (receipt, passages)


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
    block = parent.get('sourceReadingStore')
    require(contract_of(block) and block['name'] == store, 'Parent revision belongs to another store')
    require(parent['newest'], 'A store release must extend the newest verified revision')
    # The legacy graph keeps its own copy of older readings, and the reader prefers it. A store must
    # never hold a reading the graph already has, so a human correction there cannot be shadowed.
    legacy, overlap = _read_rows(legacy_db, legacy_revision, keys)
    require(not is_store(legacy), 'The legacy revision is a source-reading store')
    # An older graph copy could predate a human correction, so only the newest verified one will do.
    require(legacy['newest'], 'The legacy graph copy must be its newest verified revision')
    require(not overlap, 'The legacy graph already holds these records: ' + ', '.join(sorted(overlap)[:5]))
    changes = changes_for(store, bundles, parent_revision, inputs, ownership, legacy_revision,
                          {k: item(r) for k, r in existing.items()}, block)
    output.mkdir(parents=True, exist_ok=False)
    (output / 'artifacts').mkdir()
    for bundle in bundles:
        (output / 'artifacts' / (v1.digest(bundle) + '.json')).write_text(
            json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False))
    for name, value in [('changes.json', changes), ('held.json', held)]:
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    return dict(store=store, records=len(changes['records']), held=len(held), parentRevision=parent_revision)


def prepare_checked(store, selection_path, selection_pin, parent_db, parent_revision, ownership, legacy_db,
                    legacy_revision, output):
    """Changes and R2 files for root's checked selection. `selection_pin` is the hash root gave for the
    selection file; the approval and bundle files are found and checked through it."""
    import checked_source_store
    selection_text = selection_path.read_text()
    selection = checked_source_store.strict_json(selection_text)
    approvals = {c['rootApprovalFileSha256']: Path(c['rootApprovalPath']).read_text() for c in selection['cases']}
    _, cases = checked_source_store.selected_cases(selection_text, selection_pin, approvals)
    bundles = {job: Path(case['bundlePath']).read_text() for job, case in cases.items()}
    rows = checked_source_store.rows_for(store, cases, bundles, pinned_index(ownership), selection_pin)
    keys = sorted({r['record_id'] for r in rows})
    parent, existing = _read_rows(parent_db, parent_revision, keys)
    block = parent.get('sourceReadingStore')
    require(contract_of(block) == 2 and block['name'] == store, 'Upgrade the store before adding checked readings')
    require(parent['newest'], 'A store release must extend the newest verified revision')
    legacy, overlap = _read_rows(legacy_db, legacy_revision, keys)
    require(not is_store(legacy), 'The legacy revision is a source-reading store')
    # An older graph copy could predate a human correction, so only the newest verified one will do.
    require(legacy['newest'], 'The legacy graph copy must be its newest verified revision')
    require(not overlap, 'The legacy graph already holds these records: ' + ', '.join(sorted(overlap)[:5]))
    # A graph reading of the same raw queue result may carry human corrections that a checked reading
    # would shadow. Until a reviewed mapping exists for that, such a bundle is refused.
    raws = sorted(r['data']['supersedes']['rawResultHash'] for r in rows if r['kind'] == 'checked_reading')
    with closing(sqlite3.connect(legacy_db.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        held = [r[0] for r in db.execute(
            f"SELECT record_id FROM {record_table(db)} WHERE revision_id=? AND kind='source_reading' AND "
            f"json_extract(payload_json,'$.provenance.resultSha256') IN ({','.join('?' for _ in raws)})", (legacy_revision, *raws))]
    require(not held, 'The legacy graph already has a reading of this raw result: ' + ', '.join(held[:5]))
    with closing(sqlite3.connect(parent_db.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        stored = {r[0]: item(r) for r in db.execute(
            f"SELECT {COLUMNS} FROM {record_table(db)} WHERE revision_id=? AND kind='checked_reading'", (parent_revision,))}
    changes = checked_source_store.changes_for(block, selection_text, selection_pin, approvals, bundles, ownership,
                                               parent_revision, legacy_revision,
                                               {**{k: item(r) for k, r in existing.items()}, **stored})
    output.mkdir(parents=True, exist_ok=False)
    (output / 'artifacts').mkdir()
    mine = {r['data']['jobId'] for r in rows if r['kind'] == 'checked_reading'}
    for job in mine:
        (output / 'artifacts' / (cases[job]['bundleFileSha256'] + '.json')).write_text(bundles[job])
    (output / 'changes.json').write_text(json.dumps(changes, ensure_ascii=False, indent=2) + '\n')
    return dict(store=store, readings=len(mine), selectedReadings=len(cases), records=len(changes['records']),
                parentRevision=parent_revision, legacyGraph=legacy_revision, rawResultsInLegacyGraph=0)


def checked_inputs(selection_path, selection_pin):
    """Root's checked selection and the approval files it names, for verify and readback."""
    import checked_source_store
    text = selection_path.read_text()
    require(checked_source_store.sha(text) == selection_pin, 'Checked release selection is not the one root pinned')
    cases = checked_source_store.strict_json(text)['cases']
    return dict(selection=text, pin=selection_pin,
                approvals={c['rootApprovalFileSha256']: Path(c['rootApprovalPath']).read_text() for c in cases})


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
    p = sub.add_parser('upgrade', help='The revision that lets a store hold checked readings')
    p.add_argument('--parent-manifest', type=Path, required=True); p.add_argument('--output', type=Path, required=True)
    p = sub.add_parser('prepare-checked')
    p.add_argument('--store', choices=sorted(STORES), required=True)
    p.add_argument('--checked-selection', nargs=2, required=True, metavar=('SELECTION_JSON', 'ROOT_SHA256'))
    for name in ('--parent-db', '--ownership', '--legacy-db', '--output'):
        p.add_argument(name, type=Path, required=True)
    for name in ('--parent-revision', '--ownership-hash', '--legacy-revision'):
        p.add_argument(name, required=True)
    for command in ('verify', 'readback'):
        p = sub.add_parser(command)
        for name in ('--export', '--manifest', '--artifacts', '--receipt' if command == 'verify' else '--output'):
            p.add_argument(name, type=Path, required=True)
        p.add_argument('--ownership', nargs=2, action='append', required=True, metavar=('MANIFEST_JSON', 'REVIEWED_SHA256'))
        p.add_argument('--checked-selection', nargs=2, action='append', metavar=('SELECTION_JSON', 'ROOT_SHA256'),
                       help='Repeat for every selection held by the revision, including inherited readings')
        if command == 'verify':
            p.add_argument('--parent-receipt', type=Path, help="The parent revision's read-back receipt, unless it is empty")
    args = parser.parse_args()
    checked = ([checked_inputs(Path(path), pin) for path, pin in args.checked_selection]
               if getattr(args, 'checked_selection', None) and args.command in ('verify', 'readback') else None)
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
    elif args.command == 'upgrade':
        parent = json.loads(args.parent_manifest.read_text())
        result = upgrade_changes(parent['sourceReadingStore'], parent['revision'])
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    elif args.command == 'prepare-checked':
        ownership = dict(manifest=json.loads(args.ownership.read_text()), expectedManifestSha256=args.ownership_hash)
        result = prepare_checked(args.store, Path(args.checked_selection[0]), args.checked_selection[1], args.parent_db,
                                 args.parent_revision, ownership, args.legacy_db, args.legacy_revision, args.output)
    elif args.command == 'readback':
        specs = [dict(manifest=json.loads(Path(m).read_text()), expectedManifestSha256=h) for m, h in args.ownership]
        result = readback(args.export, args.manifest, args.artifacts, specs, checked)
        args.output.write_text(json.dumps(result, ensure_ascii=False) + '\n')
        result = {k: result[k] for k in ('store', 'revision', 'recordSetSha256', 'readBackSha256')}
    else:
        specs = [dict(manifest=json.loads(Path(m).read_text()), expectedManifestSha256=h) for m, h in args.ownership]
        parent = json.loads(args.parent_receipt.read_text()) if args.parent_receipt else None
        result = verify_store(args.export, args.manifest, args.artifacts, specs, parent, checked=checked)
        args.receipt.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
