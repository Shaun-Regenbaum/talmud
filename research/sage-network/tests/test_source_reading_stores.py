"""Two source-reading stores on captured real bundles: routing, import, read-back check, refusals."""
import copy
import gzip
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import source_readings as importer  # noqa: E402
import source_reading_store as compact_store  # noqa: E402
import source_reading_stores as stores  # noqa: E402
from extend_d1 import prepare  # noqa: E402
from ownership.tile_ownership import POLICY, VERSION, digest, source_unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
CAPTURE = json.loads((Path(__file__).parent / 'fixtures/source-reading-real-v8.json').read_text())
LEGACY = 'sage-graph-' + '0' * 20
APP_FIXTURE = ROOT / 'packages/talmud/tests/fixtures/source-reading-stores.json'


def store_ownership(bundles, source_version='full-bavli-tiles v1'):
    # Ownership for the captured test subset only, labelled with the store's frozen tile version.
    rows = []
    for bundle in bundles:
        job = bundle['job']
        for s in job['sources']:
            unit, start, end, segment_hash = source_unit(s)
            rows.append(dict(unitId=unit, segmentId=s['provenance']['segment_id'], edition=s['edition'], ref=s['ref'],
                             sourceSha256=s['sha256'], segmentSha256=segment_hash, rawStart=start, rawEnd=end,
                             owner=dict(jobId=job['job_id'], jobSha256=digest(job), sourceId=s['source_id'],
                                        originalRole='focal' if s['provenance']['focal'] else 'context'), alternatives=[]))
    header = dict(version=VERSION, policy=POLICY, sourceVersion=source_version, rowsSha256=digest(rows), fixtureSubset=True)
    header['manifestSha256'] = digest(header)
    return dict(manifest=dict(manifest=header, ownership=rows), expectedManifestSha256=header['manifestSha256'])


def stored(item):
    payload = json.dumps(item['data'], ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return dict({k: item[k] for k in ('record_id', 'kind', 'passage_id', 'ref', 'subject_id', 'object_id', 'authority', 'decision')},
                payload_sha256=importer.sha(payload), payload_json=payload)


def app_fixture():
    """The app's decoder tests: v1 rows, the compact rows a store holds, and what the app must decode."""
    bundles = [CAPTURE['bundles'][i] for i in (0, 2)]
    ownership = store_ownership(bundles)
    v1_rows = importer.changes_for(bundles, 'x', CAPTURE['inputArtifacts'], None, ownership)['records']
    view = compact_store.reader_view(v1_rows)
    differs = [stored(r) for r, old in zip(view, v1_rows) if r != old]
    assert {r['kind'] for r in differs} == {'passage', 'source_reading'}
    # No captured reading covers a split piece yet. This is a real captured piece (Midrash Tanchuma,
    # Tazria 8:1, piece 2 of 2) with the real name סנחריב in it. The key is computed on the whole piece.
    # The app test gets the text cut to its first 700 code points, which still hold the name.
    tiles = json.loads(gzip.decompress((Path(__file__).parent / 'fixtures/tile-ownership-real.json.gz').read_bytes()))
    piece = tiles['other']['jobs'][1]['sources'][2]
    assert piece['provenance']['piece']['index'] == 2 and piece['ref'] == 'Midrash Tanchuma midrash-tanchuma-tazria-8:1'
    name = 'סַנְחֵרִיב'
    start = piece['text'].index(name)
    truncated = dict(copy.deepcopy(piece), text=piece['text'][:700])
    return dict(
        provenance='Actual validated v8 source readings 001 and 101 with ownership for this subset only. Not accepted facts. '
                   'pieceKey uses a real captured piece whose text is cut short on purpose; see pieceKey.truncated.',
        storeBlock=stores.store_block('bavli'), v1=[stored(r) for r in v1_rows],
        stored=[stored(r) for r in compact_store.compact(v1_rows)], readerView=differs,
        pieceKey=dict(source=truncated, start=start, end=start + len(name), quote=name,
                      truncated=dict(keptCodePoints=700, fullCodePoints=len(piece['text']), fullTextSha256=piece['sha256'],
                                     note='Test input only: the text is cut short. The key does not depend on the text.'),
                      key=importer.occurrence_key(piece, start, start + len(name))))


def database(path=':memory:'):
    db = sqlite3.connect(path)
    for migration in sorted((ROOT / 'packages/talmud/migrations-sage-graph').glob('*.sql')):
        db.executescript(migration.read_text())
    return db


class SourceReadingStoreTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.bundles = [copy.deepcopy(CAPTURE['bundles'][i]) for i in (0, 2)]
        self.inputs = CAPTURE['inputArtifacts']
        self.ownership = store_ownership(self.bundles)
        self.db = database(str(self.root / 'store.sqlite'))
        self.addCleanup(self.db.close)
        self.manifest = self.release(stores.genesis('bavli'), 'genesis')

    def release(self, outputs, name):
        self.db.executescript(outputs['import.sql'])
        self.db.executescript(outputs['activate.sql'])
        self.db.commit()
        (self.root / f'{name}.sql').write_text('\n'.join(self.db.iterdump()))
        (self.root / f'{name}.json').write_text(outputs['manifest.json'])
        return json.loads(outputs['manifest.json'])

    def changes(self, store='bavli', ownership=None, existing=None):
        return stores.changes_for(store, self.bundles, self.manifest['revision'], self.inputs,
                                  ownership or self.ownership, LEGACY, existing)

    def extend(self, changes, parent='genesis', shared=True):
        path = self.root / 'changes.json'
        path.write_text(json.dumps(changes, ensure_ascii=False))
        out = self.root / 'out'
        result = prepare(self.root / f'{parent}.sql', self.root / f'{parent}.json', path, out, shared=shared)
        outputs = {name: (out / name).read_text() for name in ('import.sql', 'manifest.json', 'activate.sql')}
        return result, outputs

    def artifacts(self, bundles=None):
        folder = self.root / 'artifacts'
        folder.mkdir(exist_ok=True)
        for bundle in bundles or self.bundles:
            (folder / (importer.digest(bundle) + '.json')).write_text(
                json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False))
        return folder

    def test_jobs_route_by_the_one_corpus_their_sources_name(self):
        job = copy.deepcopy(self.bundles[0]['job'])
        self.assertEqual(stores.store_for(job), 'bavli')
        for corpus in ('yerushalmi', 'mishnah', 'tosefta', 'midrash-halakhah', 'midrash-aggadah', 'minor-tractates'):
            for s in job['sources']:
                s['provenance']['corpus'] = corpus
            self.assertEqual(stores.store_for(job), 'other')
        job['sources'][0]['provenance']['corpus'] = 'bavli'
        with self.assertRaisesRegex(ValueError, 'one corpus'):
            stores.store_for(job)
        for s in job['sources']:
            s['provenance']['corpus'] = 'zohar'
        with self.assertRaisesRegex(ValueError, 'Unknown corpus'):
            stores.store_for(job)
        parts, receipt = stores.route(CAPTURE)
        self.assertEqual(receipt['stores']['bavli']['bundles'], len(CAPTURE['bundles']))
        self.assertEqual(parts['other']['bundles'], [])

    def test_genesis_is_an_empty_verified_store_revision(self):
        self.assertTrue(self.manifest['revision'].startswith('source-readings-bavli-'))
        self.assertEqual((self.manifest['recordCount'], self.manifest['storageFormat']), (0, 'shared-v1'))
        self.assertEqual(self.manifest['sourceReadingStore']['database'], 'talmud-source-readings-bavli')
        self.assertNotEqual(stores.genesis('other')['manifest.json'], stores.genesis('bavli')['manifest.json'])

    def test_store_release_reads_back_exactly(self):
        changes = self.changes()
        v1_rows = importer.changes_for(self.bundles, 'x', self.inputs, None, self.ownership)['records']
        self.assertEqual(len(changes['records']), len(v1_rows) + 1)  # plus the one shared run manifest row
        self.assertTrue(all(r['data']['format'] == 'source-reading-store-v2' for r in changes['records']))
        result, outputs = self.extend(changes)
        self.assertTrue(result['revision'].startswith('source-readings-bavli-'))
        manifest = self.release(outputs, 'first')
        self.assertEqual(manifest['sourceReadingStore'], self.manifest['sourceReadingStore'])
        receipt = stores.verify_store(self.root / 'first.sql', self.root / 'first.json', self.artifacts(), [self.ownership])
        self.assertEqual((receipt['passages'], receipt['artifactsChecked'], receipt['matchesImporter']), (2, 2, True))
        # replaying the same readings onto the new revision changes nothing
        rows = self.db.execute('SELECT record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json '
                               'FROM sage_graph_all_records WHERE revision_id=?', (manifest['revision'],))
        existing = {r[0]: stores.item(r) for r in rows}
        replay = stores.changes_for('bavli', self.bundles, manifest['revision'], self.inputs, self.ownership, LEGACY, existing)
        self.assertEqual(replay['records'], [])

    def test_read_back_refuses_changed_or_missing_artifacts_and_unpinned_ownership(self):
        _, outputs = self.extend(self.changes())
        self.release(outputs, 'first')
        export, manifest = self.root / 'first.sql', self.root / 'first.json'
        changed = copy.deepcopy(self.bundles[0])
        changed['job']['sources'][0]['provenance']['source_url'] += '?x'
        folder = self.artifacts()
        (folder / (importer.digest(self.bundles[0]) + '.json')).write_text(
            json.dumps(changed, ensure_ascii=False, sort_keys=True, separators=(',', ':')))
        with self.assertRaisesRegex(ValueError, 'R2 artifact differs'):
            stores.verify_store(export, manifest, folder, [self.ownership])
        (folder / (importer.digest(self.bundles[0]) + '.json')).unlink()
        with self.assertRaisesRegex(ValueError, 'Missing downloaded R2 artifact'):
            stores.verify_store(export, manifest, folder, [self.ownership])
        self.artifacts()
        with self.assertRaisesRegex(ValueError, 'not pinned'):
            stores.verify_store(export, manifest, folder, [store_ownership(self.bundles[:1])])

    def test_store_imports_refuse_the_wrong_store_ownership_or_inputs(self):
        with self.assertRaisesRegex(ValueError, 'another store'):
            self.changes(store='other')
        with self.assertRaisesRegex(ValueError, 'belongs to another store'):
            self.changes(ownership=store_ownership(self.bundles, 'full-other-texts-tiles v3'))
        with self.assertRaisesRegex(ValueError, 'legacy graph revision'):
            stores.changes_for('bavli', self.bundles, self.manifest['revision'], self.inputs, self.ownership, None)
        changes = self.changes()
        person = next(r for r in changes['records'] if r['kind'] == 'person')
        person['data']['label'] += ' (edited)'
        with self.assertRaisesRegex(ValueError, 'strict reconstruction'):
            self.extend(changes)
        with self.assertRaisesRegex(ValueError, 'uses shared records'):
            self.extend(self.changes(), shared=False)
        existing = {r['record_id']: dict(r, data=dict(r['data'], label='changed')) for r in self.changes()['records'] if r['kind'] == 'person'}
        with self.assertRaisesRegex(ValueError, 'Existing store record differs'):
            self.changes(existing=existing)

    def test_graph_changes_never_reach_a_store_and_store_rows_never_reach_the_graph(self):
        v1_changes = importer.changes_for(self.bundles, self.manifest['revision'], self.inputs, None, self.ownership)
        with self.assertRaisesRegex(ValueError, 'cannot carry other changes'):
            self.extend(v1_changes)
        other = stores.genesis('other')
        (self.root / 'other.sql').write_text('\n'.join(self.db.iterdump()) + '\n' + other['import.sql'] +
                                             other['activate.sql'])
        (self.root / 'other.json').write_text(other['manifest.json'])
        changes = self.changes()
        changes['parentRevision'] = json.loads(other['manifest.json'])['revision']
        with self.assertRaisesRegex(ValueError, 'another source-reading store'):
            self.extend(changes, parent='other')
        graph = database()
        manifest = dict(schemaVersion=1, recordCount=0, countsByKind={}, recordSetSha256=stores.digest('[]'), storageFormat='shared-v1')
        graph.execute("INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,?,'verified')",
                      (LEGACY, json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(',', ':'))))
        (self.root / 'graph.sql').write_text('\n'.join(graph.iterdump()))
        (self.root / 'graph.json').write_text(json.dumps(dict(revision=LEGACY, **manifest)))
        changes['parentRevision'] = LEGACY
        with self.assertRaisesRegex(ValueError, 'go to a source-reading store, not the graph'):
            self.extend(changes, parent='graph')

    def test_app_fixture_matches_the_current_rows(self):
        # Regenerate with: python tests/test_source_reading_stores.py --write-app-fixture, then biome format --write it.
        self.assertEqual(json.loads(APP_FIXTURE.read_text()), app_fixture())

    def test_prepare_refuses_readings_the_legacy_graph_already_holds(self):
        (self.root / 'ownership.json').write_text(json.dumps(self.ownership['manifest']))
        capture = dict(bundles=self.bundles, inputArtifacts=self.inputs)
        legacy = database(str(self.root / 'legacy.sqlite'))
        self.addCleanup(legacy.close)
        legacy.execute("INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,?,'loading')", (LEGACY, '{"schemaVersion":1}'))
        args = lambda out: ('bavli', capture, self.root / 'store.sqlite', self.manifest['revision'], self.ownership,
                            self.root / 'legacy.sqlite', LEGACY, self.root / out)
        legacy.execute("UPDATE sage_graph_revisions SET state='verified'")
        legacy.commit()
        result = stores.prepare(*args('clean'))
        self.assertEqual(json.loads((self.root / 'clean/changes.json').read_text()), self.changes())
        self.assertEqual((result['records'], result['held']), (len(self.changes()['records']), 0))
        self.assertEqual(len(list((self.root / 'clean/artifacts').iterdir())), 2)
        row = importer.records(self.bundles[0])[0]
        legacy.execute('INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,?,?)', ('sage-graph-' + '1' * 20, '{}', 'loading'))
        legacy.execute('INSERT INTO sage_graph_records(revision_id,record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json) '
                       'VALUES (?,?,?,?,?,?,?,?,?,?,?)', ('sage-graph-' + '1' * 20, row['record_id'], row['kind'], row['passage_id'], row['ref'],
                                                         None, None, 'user_correction', None, '0' * 64, '{}'))
        legacy.execute("UPDATE sage_graph_revisions SET state='verified' WHERE id=?", ('sage-graph-' + '1' * 20,))
        legacy.commit()
        with self.assertRaisesRegex(ValueError, 'legacy graph already holds'):
            stores.prepare(*args('overlap')[:6], 'sage-graph-' + '1' * 20, self.root / 'overlap')


if __name__ == '__main__':
    if sys.argv[1:] == ['--write-app-fixture']:
        APP_FIXTURE.write_text(json.dumps(app_fixture(), ensure_ascii=False, indent=1) + '\n')
    else:
        unittest.main()
