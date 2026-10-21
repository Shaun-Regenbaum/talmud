"""Two source-reading stores on captured real bundles: routing, import, read-back check, refusals."""
import copy
import gzip
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import source_readings as importer  # noqa: E402
import source_reading_store as compact_store  # noqa: E402
import source_reading_stores as stores  # noqa: E402
from extend_d1 import prepare  # noqa: E402
from ownership.tile_ownership import POLICY, VERSION, digest, source_unit  # noqa: E402
from compact_source_v2.validate import check_saved  # noqa: E402
from source_coverage import pinned_index, records as coverage_records  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
CAPTURE = json.loads((Path(__file__).parent / 'fixtures/source-reading-real-v8.json').read_text())
LEGACY = 'sage-graph-' + '0' * 20
APP_FIXTURE = ROOT / 'packages/talmud/tests/fixtures/source-reading-stores.json'
STRONGER8 = json.loads((Path(__file__).parent / 'fixtures/source-reading-stronger8-real.json').read_text())


def v4_bundles():
    v4 = STRONGER8['v4']
    shard = v4['manifest']['shards'][0]
    return [dict(job=e['job'], config=v4['config'], result=v4['results'][e['job']['job_id']], amendment=None,
                 inputProof=dict(manifest=v4['manifest'], file=shard['file'], sha256=shard['sha256'], index=e['index']))
            for e in v4['jobs']]


def v4_rows(bundle):
    """v1 rows for one real compact-source-v4 result, for the app tests' Hebrew labels only. The importer
    does not accept v4 runs. These rows come from the unchanged records() code, given the run's own
    v2-checked compile (check_saved) in place of checked_bundle, after the saved result's hashes are checked."""
    result, job = bundle['result'], bundle['job']
    assert result['resultHash'] == importer.digest({k: v for k, v in result.items() if k != 'resultHash'})
    assert result['jobHash'] == importer.digest(job) and result['manifestHash'] == importer.digest(bundle['config'])
    # The saved v2 check was built from this run's own answer: raw v4 answer -> derived v2 answer -> check.
    assert result['compiled']['raw']['answer'] == result['answer'] == json.loads(result['response']['choices'][0]['message']['content'])
    assert result['compiled']['v2_check']['answer'] == result['compiled']['compile']['derived_v2_answer']
    compiled = check_saved(job, result['compiled']['v2_check'])
    focal = next(s for s in job['sources'] if s['provenance'].get('focal') is True)
    with mock.patch.object(importer, 'checked_bundle', return_value=(compiled, focal)):
        return importer.records(bundle)


def hebrew_rows():
    """Two real readings of each of jobs 005 and 007: v4 with Hebrew labels, v2 with English labels."""
    ownership = store_ownership(v4_bundles())  # both readings are of these same jobs
    index = pinned_index(ownership)
    out = {}
    for name, bundles, build in (('v4', v4_bundles(), v4_rows), ('v2', STRONGER8['v2'], importer.records)):
        rows = []
        for bundle in bundles:
            items = build(bundle)
            rows += items + coverage_records(bundle['job'], items[0]['passage_id'], index)
        compacted = compact_store.compact(rows)
        assert compact_store.expand(compacted, {r['passage_id']: b for b in bundles for r in build(b)[:1]}) == rows
        out[name] = dict(v1=[stored(r) for r in rows], stored=[stored(r) for r in compacted])
    return out


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
                      key=importer.occurrence_key(piece, start, start + len(name))),
        hebrew=dict(provenance='Real results for jobs v18-bavli-005 and 007, from '
                               'research/sage-network/tests/fixtures/source-reading-stronger8-real.json. v4 is the '
                               'stronger8 compact-source-v4 run, read through v4_rows() because the importer does not '
                               'accept v4 runs; v2 is the quality-210 run. Ownership covers these two jobs only.',
                    **hebrew_rows()))


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
        self.pin(self.ownership)
        self.db = database(str(self.root / 'store.sqlite'))
        self.addCleanup(self.db.close)
        self.manifest = self.release(stores.genesis('bavli'), 'genesis')

    def pin(self, ownership):
        # The tests use ownership for the captured subset, so its hash stands in for the reviewed pin.
        old = stores.STORES['bavli']['ownershipManifestSha256']
        stores.STORES['bavli']['ownershipManifestSha256'] = ownership['expectedManifestSha256']
        self.addCleanup(stores.STORES['bavli'].__setitem__, 'ownershipManifestSha256', old)

    def release(self, outputs, name):
        self.db.executescript(outputs['import.sql'])
        self.db.executescript(outputs['activate.sql'])
        self.db.commit()
        (self.root / f'{name}.sql').write_text('\n'.join(self.db.iterdump()))
        (self.root / f'{name}.json').write_text(outputs['manifest.json'])
        return json.loads(outputs['manifest.json'])

    def export_now(self, name, outputs):
        self.db.commit()
        (self.root / f'{name}.sql').write_text('\n'.join(self.db.iterdump()))
        (self.root / f'{name}.json').write_text(outputs['manifest.json'])

    def changes(self, store='bavli', ownership=None, existing=None):
        return stores.changes_for(store, self.bundles, self.manifest['revision'], self.inputs,
                                  ownership or self.ownership, LEGACY, existing)

    def extend(self, changes, parent='genesis', shared=True, out='out'):
        path = self.root / f'{out}-changes.json'
        path.write_text(json.dumps(changes, ensure_ascii=False))
        out = self.root / out
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
        path = folder / (importer.digest(self.bundles[0]) + '.json')
        good = path.read_text()
        # a changed URL, and two files that parse to the right bundle but are not its bytes
        for text in (json.dumps(changed, ensure_ascii=False, sort_keys=True, separators=(',', ':')), good + '\n',
                     '{"job":{},' + good[1:]):
            path.write_text(text)
            with self.assertRaisesRegex(ValueError, 'Downloaded R2 file differs from its envelope'):
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
        with self.assertRaisesRegex(ValueError, 'not the reviewed one'):
            self.changes(ownership=store_ownership(self.bundles[:1]))
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
        other, outputs = database(), stores.genesis('other')
        other.executescript(outputs['import.sql'] + outputs['activate.sql'])
        (self.root / 'other.sql').write_text('\n'.join(other.iterdump()))
        (self.root / 'other.json').write_text(outputs['manifest.json'])
        changes = self.changes()
        changes['parentRevision'] = json.loads(outputs['manifest.json'])['revision']
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

    def test_releases_stack_in_order_and_each_read_back_checks_only_new_passages(self):
        one, two = self.bundles
        inputs = lambda b: {b['inputProof']['sha256']: self.inputs[b['inputProof']['sha256']]}
        changes = stores.changes_for('bavli', [one], self.manifest['revision'], inputs(one), self.ownership, LEGACY)
        first = self.release(self.extend(changes, out='a')[1], 'first')
        receipt = stores.verify_store(self.root / 'first.sql', self.root / 'first.json', self.artifacts([one]), [self.ownership])
        rows = self.db.execute(f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (first['revision'],))
        changes = stores.changes_for('bavli', [two], first['revision'], inputs(two), self.ownership, LEGACY,
                                     {r[0]: stores.item(r) for r in rows})
        self.assertNotIn('source_reading_run', {r['kind'] for r in changes['records']})  # already in the parent
        self.release(self.extend(changes, parent='first', out='b')[1], 'second')
        folder = self.root / 'second-artifacts'
        folder.mkdir()
        (folder / (importer.digest(two) + '.json')).write_text(
            json.dumps(two, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False))
        with self.assertRaisesRegex(ValueError, 'needs its own read-back receipt'):
            stores.verify_store(self.root / 'second.sql', self.root / 'second.json', folder, [self.ownership])
        second = stores.verify_store(self.root / 'second.sql', self.root / 'second.json', folder, [self.ownership], receipt)
        self.assertEqual((second['passagesChecked'], second['passagesFromParent']), (1, 1))
        # A release built on the first revision, now that the second is newer, is refused.
        (self.root / 'now.sql').write_text('\n'.join(self.db.iterdump()))
        (self.root / 'now.json').write_text((self.root / 'first.json').read_text())
        late = stores.changes_for('bavli', [two], first['revision'], inputs(two), self.ownership, LEGACY)
        with self.assertRaisesRegex(ValueError, 'newest verified revision'):
            self.extend(late, parent='now', out='c')

    def test_store_sql_runs_only_on_its_own_store_and_activates_only_in_order(self):
        graph = database()
        graph.execute("INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,'{}','verified')", (LEGACY,))
        with self.assertRaises(sqlite3.DatabaseError):
            graph.executescript(stores.genesis('bavli')['import.sql'])
        with self.assertRaises(sqlite3.DatabaseError):
            graph.executescript(stores.genesis('other')['import.sql'])
        a = self.extend(stores.changes_for('bavli', self.bundles[:1], self.manifest['revision'],
                                           self.inputs, self.ownership, LEGACY), out='a')[1]
        b = self.extend(stores.changes_for('bavli', self.bundles[1:], self.manifest['revision'],
                                           self.inputs, self.ownership, LEGACY), out='b')[1]
        with self.assertRaises(sqlite3.DatabaseError):
            graph.executescript(a['import.sql'])
        self.assertEqual(graph.execute('SELECT count(*) FROM sage_graph_revisions').fetchone(), (1,))
        # two releases built on one parent: the second can no longer become current
        self.db.executescript(a['import.sql'])
        self.db.executescript(b['import.sql'])
        self.db.executescript(a['activate.sql'])
        self.db.executescript(a['activate.sql'])  # running it again changes nothing
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.executescript(b['activate.sql'])
        states = dict(self.db.execute('SELECT id,state FROM sage_graph_revisions'))
        self.assertEqual(states[json.loads(a['manifest.json'])['revision']], 'verified')
        self.assertEqual(states[json.loads(b['manifest.json'])['revision']], 'loading')
        # A release stamped earlier than its parent would never be read as newest, so it is refused.
        parent = json.loads(a['manifest.json'])['revision']
        self.export_now('a-now', a)
        rows = self.db.execute(f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (parent,))
        later = stores.changes_for('bavli', self.bundles[1:], parent, self.inputs, self.ownership, LEGACY,
                                   {r[0]: stores.item(r) for r in rows})
        c = self.extend(later, parent='a-now', out='c')[1]
        self.db.executescript(c['import.sql'])
        self.db.execute("UPDATE sage_graph_revisions SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?",
                        (json.loads(c['manifest.json'])['revision'],))
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.executescript(c['activate.sql'])

    def test_real_hebrew_readings_round_trip_and_keep_their_own_provenance(self):
        rows = hebrew_rows()
        v4 = [json.loads(r['payload_json']) for r in rows['v4']['v1'] if r['kind'] == 'person']
        self.assertIn('רב יוסף', {p['label'] for p in v4})
        self.assertTrue(all(p['label'] == p['quote'] for p in v4))
        # Two readings of the same job: different reading IDs and artifacts, the same occurrence keys.
        envelopes = {name: [json.loads(r['payload_json']) for r in rows[name]['v1'] if r['kind'] == 'source_reading']
                     for name in rows}
        self.assertFalse({e['passageId'] for e in envelopes['v4']} & {e['passageId'] for e in envelopes['v2']})
        self.assertNotEqual({e['provenance']['artifactSha256'] for e in envelopes['v4']},
                            {e['provenance']['artifactSha256'] for e in envelopes['v2']})
        shared = set().union(*(e['occurrenceKeys'] for e in envelopes['v4'])) & set().union(*(e['occurrenceKeys'] for e in envelopes['v2']))
        self.assertTrue(shared)
        changed = copy.deepcopy(v4_bundles()[0])
        changed['result']['compiled']['v2_check']['record']['people'][0]['label'] = 'רבא'
        with self.assertRaises(AssertionError):
            v4_rows(changed)

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
        # A job outside the ownership manifest is held with its reason; the others go ahead.
        self.pin(store_ownership(self.bundles[:1]))
        held = stores.prepare('bavli', capture, self.root / 'store.sqlite', self.manifest['revision'],
                              store_ownership(self.bundles[:1]), self.root / 'legacy.sqlite', LEGACY, self.root / 'held')
        self.assertEqual((held['records'], held['held']), (len(stores.changes_for(
            'bavli', self.bundles[:1], self.manifest['revision'], {self.bundles[0]['inputProof']['sha256']: self.inputs[self.bundles[0]['inputProof']['sha256']]},
            store_ownership(self.bundles[:1]), LEGACY)['records']), 1))
        self.pin(self.ownership)
        reasons = json.loads((self.root / 'held/held.json').read_text())
        self.assertEqual([(r['jobId'], r['reason']) for r in reasons], [(self.bundles[1]['job']['job_id'], 'Source has no ownership declaration')])
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
