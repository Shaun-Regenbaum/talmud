"""Checked edges of machine readings, on real saved readings and the real second-model checks of them.

The fixture holds three real frozen jobs, the answers a model saved for them, and what a model of the other family
answered when asked to check each edge and say which sage each end is. The selection here is built by the tests
and is labelled so; it authorizes nothing.
"""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import machine_edge_store as edges  # noqa: E402
import machine_source_store as machine  # noqa: E402
import source_reading_stores as stores  # noqa: E402
from extend_d1 import prepare  # noqa: E402
from ownership.tile_ownership import POLICY, VERSION, digest, source_unit  # noqa: E402
from test_source_reading_stores import database  # noqa: E402

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/machine-edge-real.json').read_text())
CASES = FIXTURE['cases']


def subset_ownership(jobs):
    """Ownership for these test jobs only, not the corpus. The header is marked as a fixture subset."""
    rows = []
    for job in jobs:
        for s in job['sources']:
            unit, start, end, segment_hash = source_unit(s)
            rows.append(dict(unitId=unit, segmentId=s['provenance']['segment_id'], edition=s['edition'], ref=s['ref'],
                             sourceSha256=s['sha256'], segmentSha256=segment_hash, rawStart=start, rawEnd=end,
                             owner=dict(jobId=job['job_id'], jobSha256=digest(job), sourceId=s['source_id'],
                                        originalRole='focal' if s['provenance']['focal'] else 'context'),
                             alternatives=[]))
    header = dict(version=VERSION, policy=POLICY, rowsSha256=digest(rows), fixtureSubset=True,
                  sourceVersion=stores.STORES['bavli']['ownershipSource'])
    header['manifestSha256'] = digest(header)
    return dict(manifest=dict(manifest=header, ownership=rows), expectedManifestSha256=header['manifestSha256'])


OWNERSHIP = subset_ownership([c['job'] for c in CASES])
INDEX = stores.pinned_index(OWNERSHIP)
LEGACY = 'sage-graph-' + 'f' * 20


def text(value):
    return json.dumps(value, ensure_ascii=False, indent=1) + '\n'


def reading_release():
    artifacts, entries = {}, []
    for case in CASES:
        body = machine.make_artifact(case['job'], case['answer'], case['reader'], case['requestSha256'])
        result = machine.reading(case['job'], case['answer'], INDEX)
        artifacts[case['job']['job_id']] = body
        entries.append(dict(jobId=case['job']['job_id'], artifactHash=result['artifactHash'], bundleFileSha256=machine.sha(body),
                            people=len(result['people']), connections=len(result['connections'])))
    selection = text(dict(version=machine.SELECTION_VERSION, productionApproved=False, readings=len(entries),
                          people=sum(e['people'] for e in entries), connections=sum(e['connections'] for e in entries),
                          cases=entries, note='Test only; authorizes nothing.'))
    return selection, artifacts


def edge_release(cases=CASES):
    items = []
    for case in cases:
        result = machine.reading(case['job'], case['answer'], INDEX)
        check = case['check']
        items.append(dict(job_id=case['job']['job_id'], reading_passage_id='cs1-' + result['artifactHash'],
                          reader_family=check['reader_family'], checker_family=check['checker_family'],
                          candidates=check['candidates'], verdicts=check['verdicts'], batch='e000-claude'))
    artifact = edges.make_artifact(items)
    verdicts = [(v, i['candidates'][v['id']]) for i in items for v in i['verdicts']]
    selection = text(dict(version=edges.SELECTION_VERSION, productionApproved=False, artifactSha256=edges.sha(artifact),
                          passages=len(items), edgesChecked=len(verdicts), edgesKept=sum(edges.kept(v, c) for v, c in verdicts),
                          note='Test only; authorizes nothing.'))
    return selection, artifact


class EdgeStoreTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        old = stores.STORES['bavli']['ownershipManifestSha256']
        stores.STORES['bavli']['ownershipManifestSha256'] = OWNERSHIP['expectedManifestSha256']
        self.addCleanup(stores.STORES['bavli'].__setitem__, 'ownershipManifestSha256', old)
        self.db = database(str(self.root / 'store.sqlite'))
        self.addCleanup(self.db.close)
        self.reading_selection, self.reading_artifacts = reading_release()
        self.reading_pin = machine.sha(self.reading_selection)
        self.selection, self.artifact = edge_release()
        self.pin = edges.sha(self.selection)
        self.genesis = self.release(stores.genesis('bavli'), 'genesis')
        upgrade = stores.upgrade_changes(self.genesis['sourceReadingStore'], self.genesis['revision'])
        upgraded = self.release(self.extend(upgrade, 'genesis', 'up'), 'upgraded')
        changes = machine.changes_for(upgraded['sourceReadingStore'], self.reading_selection, self.reading_pin,
                                      self.reading_artifacts, OWNERSHIP, upgraded['revision'], LEGACY, {})
        self.readings = self.release(self.extend(changes, 'upgraded', 'readings', checked_selections=[self.reading_pin]), 'readings')

    def release(self, outputs, name):
        self.db.executescript(outputs['import.sql'])
        self.db.executescript(outputs['activate.sql'])
        self.db.commit()
        (self.root / f'{name}.sql').write_text('\n'.join(self.db.iterdump()))
        (self.root / f'{name}.json').write_text(outputs['manifest.json'])
        return json.loads(outputs['manifest.json'])

    def extend(self, changes, parent, out, **kw):
        path = self.root / f'{out}.json.in'
        path.write_text(json.dumps(changes, ensure_ascii=False))
        prepare(self.root / f'{parent}.sql', self.root / f'{parent}.json', path, self.root / out, shared=True, **kw)
        return {n: (self.root / out / n).read_text() for n in ('import.sql', 'manifest.json', 'activate.sql')}

    def parent_rows(self):
        return {r[0]: stores.item(r) for r in self.db.execute(
            f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (self.readings['revision'],))}

    def changes(self, selection=None, artifact=None, rows=None):
        selection = selection or self.selection
        return edges.changes_for(self.readings['sourceReadingStore'], selection, edges.sha(selection), artifact or self.artifact,
                                 self.readings['revision'], rows if rows is not None else self.parent_rows())

    def test_a_kept_edge_names_both_sages_and_who_judged_it(self):
        rows = edges.records(self.artifact, edges.selected_cases(self.selection, self.pin), self.pin, self.parent_rows().get)
        envelope, kept = rows[0], rows[1:]
        self.assertEqual(envelope['kind'], 'machine_edge_release')
        ids = sorted(r['record_id'] for r in kept)
        self.assertEqual((envelope['data']['edgeRecords'], envelope['data']['edgeRecordsSha256']),
                         (len(ids), edges.sha(edges.canonical_text(ids))))
        self.assertEqual((envelope['data']['passages'], envelope['data']['edgesKept']), (len(CASES), len(kept)))
        self.assertTrue(kept, 'the real checks keep some edges')
        total = sum(len(c['check']['verdicts']) for c in CASES)
        self.assertLess(len(kept), total, 'the real checks leave some edges out')
        for row in kept:
            d = row['data']
            self.assertEqual((row['kind'], row['authority'], row['decision']), ('machine_verified_edge', 'screening', 'needs_review'))
            self.assertNotEqual(d['subject']['sage'], d['object']['sage'])
            self.assertEqual((row['subject_id'], row['object_id']), (d['subject']['sage'], d['object']['sage']))
            self.assertNotEqual(d['readerFamily'], d['checkerFamily'])
            self.assertIs(d['historicalIdentityAccepted'], False)

    def test_only_clear_checks_are_kept(self):
        base = {'supported': 'yes', 'direction': 'ok', 'subject_sage': 'a', 'object_sage': 'b', 'note': ''}
        candidates = {'subject': ['a'], 'object': ['b']}
        self.assertTrue(edges.kept(base, candidates))
        self.assertTrue(edges.kept(dict(base, direction='na'), candidates))
        for change in ({'supported': 'no'}, {'supported': 'unsure'}, {'direction': 'swapped'}, {'subject_sage': 'none'},
                       {'object_sage': 'unsure'}):
            self.assertFalse(edges.kept(dict(base, **change), candidates), change)
        with self.assertRaisesRegex(ValueError, 'was not offered'):
            edges.kept(dict(base, subject_sage='z'), candidates)
        self.assertFalse(edges.kept(dict(base, object_sage='a'), {'subject': ['a'], 'object': ['a']}))

    def test_a_checker_that_commits_readily_must_agree_with_the_placed_sage(self):
        # Made-up verdicts, for the rule only. The placed sage is the first candidate of each end.
        base = {'supported': 'yes', 'direction': 'ok', 'subject_sage': 'a', 'object_sage': 'b', 'note': ''}
        candidates = {'subject': ['a', 'a2'], 'object': ['b', 'b2']}
        self.assertTrue(edges.kept(base, candidates, 'gemini'))
        self.assertTrue(edges.kept(dict(base, subject_sage='a2'), candidates, 'claude'))
        self.assertFalse(edges.kept(dict(base, subject_sage='a2'), candidates, 'gemini'))
        self.assertFalse(edges.kept(dict(base, object_sage='b2'), candidates, 'gemini'))

    def test_pins_and_counts_come_from_the_selection(self):
        with self.assertRaisesRegex(ValueError, 'not the one that was pinned'):
            edges.selected_cases(self.selection, '0' * 64)
        selection = json.loads(self.selection)
        selection['productionApproved'] = True
        with self.assertRaisesRegex(ValueError, 'Unknown edge release selection'):
            edges.selected_cases(text(selection), edges.sha(text(selection)))
        selection = json.loads(self.selection)
        selection['edgesKept'] += 1
        with self.assertRaisesRegex(ValueError, 'counts differ'):
            self.changes(selection=text(selection))
        with self.assertRaisesRegex(ValueError, 'differs from the selection'):
            self.changes(artifact=self.artifact + ' ')

    def test_an_edge_cannot_be_checked_by_its_own_family_or_name_a_missing_edge(self):
        items = json.loads(self.artifact)['items']
        items[0]['checker_family'] = items[0]['reader_family']
        artifact = edges.canonical_text(dict(version=edges.ARTIFACT_VERSION, items=items))
        selection = json.loads(self.selection)
        selection['artifactSha256'] = edges.sha(artifact)
        with self.assertRaisesRegex(ValueError, 'other model family'):
            self.changes(selection=text(selection), artifact=artifact)
        items = json.loads(self.artifact)['items']
        missing = copy.deepcopy(items[0]['verdicts'][0])
        missing['id'] = 'r999'
        items[0]['verdicts'].append(missing)
        items[0]['candidates']['r999'] = items[0]['candidates'][items[0]['verdicts'][0]['id']]
        artifact = edges.canonical_text(dict(version=edges.ARTIFACT_VERSION, items=items))
        selection = json.loads(self.selection)
        selection['artifactSha256'] = edges.sha(artifact)
        with self.assertRaisesRegex(ValueError, 'not stored'):
            self.changes(selection=text(selection), artifact=artifact)

    def test_a_sage_that_was_not_offered_is_refused(self):
        items = json.loads(self.artifact)['items']
        items[0]['verdicts'][0]['subject_sage'] = 'not-on-the-list'
        artifact = edges.canonical_text(dict(version=edges.ARTIFACT_VERSION, items=items))
        selection = json.loads(self.selection)
        selection['artifactSha256'] = edges.sha(artifact)
        with self.assertRaisesRegex(ValueError, 'was not offered'):
            self.changes(selection=text(selection), artifact=artifact)

    def test_release_import_and_read_back(self):
        changes = self.changes()
        with self.assertRaisesRegex(ValueError, 'not pinned by the caller'):
            self.extend(changes, 'readings', 'refused')
        edited = dict(changes, machineEdgeSelection=self.selection.replace('Test only', 'Test  only'))
        with self.assertRaisesRegex(ValueError, 'not pinned by the caller'):
            self.extend(edited, 'readings', 'refused2', checked_selections=[self.pin])
        stray = dict(changes, records=changes['records'][:-1])
        with self.assertRaisesRegex(ValueError, 'strict reconstruction'):
            self.extend(stray, 'readings', 'refused3', checked_selections=[self.pin])
        first = self.release(self.extend(changes, 'readings', 'edges', checked_selections=[self.pin]), 'edges')
        artifacts = self.root / 'artifacts'
        artifacts.mkdir()
        for body in self.reading_artifacts.values():
            (artifacts / (machine.sha(body) + '.json')).write_text(body)
        (artifacts / (edges.sha(self.artifact) + '.json')).write_text(self.artifact)
        inputs = [dict(selection=self.reading_selection, pin=self.reading_pin, machine=True),
                  dict(selection=self.selection, pin=self.pin, machine_edge=True)]
        receipt = stores.verify_store(self.root / 'edges.sql', self.root / 'edges.json', artifacts, [OWNERSHIP], checked=inputs,
                                      machine_only=True)
        self.assertEqual(receipt['scope'], 'machine-only')
        self.assertEqual(receipt['countsByKind']['machine_verified_edge'], len(changes['records']) - 1)
        # The edge selection must be given, and the downloaded file must be the artifact's exact bytes.
        with self.assertRaisesRegex(ValueError, 'pinned selection'):
            stores.verify_store(self.root / 'edges.sql', self.root / 'edges.json', artifacts, [OWNERSHIP], checked=inputs[:1],
                                machine_only=True)
        name = edges.sha(self.artifact) + '.json'
        (artifacts / name).write_text(self.artifact + ' ')
        with self.assertRaisesRegex(ValueError, 'Downloaded R2 file differs'):
            stores.verify_store(self.root / 'edges.sql', self.root / 'edges.json', artifacts, [OWNERSHIP], checked=inputs,
                                machine_only=True)
        # Saying the same release again adds nothing.
        rows = {r[0]: stores.item(r) for r in self.db.execute(
            f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (first['revision'],))}
        self.assertEqual(self.changes(rows=rows)['records'], [])

    def test_a_wider_check_may_give_a_better_label_and_the_readers_is_kept(self):
        # The real fixture, with one kept verdict given a new label. The label here is made up for this test of
        # the rule; real wider checks give their own labels.
        items = json.loads(self.artifact)['items']
        plain = edges.records(self.artifact, edges.selected_cases(self.selection, self.pin), self.pin, self.parent_rows().get)[1:]
        target = plain[0]['data']['edgeId']
        for item in items:
            for verdict in item['verdicts']:
                if verdict['id'] == target and item['job_id'] == plain[0]['data']['jobId']:
                    verdict['relation'] = 'interacts_with'
        artifact = edges.canonical_text(dict(version=edges.ARTIFACT_VERSION, items=items))
        selection = json.loads(self.selection)
        selection['artifactSha256'] = edges.sha(artifact)
        rows = edges.records(artifact, edges.selected_cases(text(selection), edges.sha(text(selection))), edges.sha(text(selection)),
                             self.parent_rows().get)[1:]
        changed = [r for r in rows if r['data']['edgeId'] == target and r['data']['jobId'] == plain[0]['data']['jobId']][0]['data']
        self.assertEqual(changed['relation'], 'interacts_with')
        self.assertEqual(changed['readerRelation'], plain[0]['data']['relation'])
        # Rows with no new label look exactly as before, so earlier releases still verify.
        untouched = [r for r in rows if r['data']['edgeId'] != target or r['data']['jobId'] != plain[0]['data']['jobId']]
        self.assertTrue(all('readerRelation' not in r['data'] for r in untouched))
        items[0]['verdicts'][0]['relation'] = 'not-a-relation'
        bad = edges.canonical_text(dict(version=edges.ARTIFACT_VERSION, items=items))
        selection['artifactSha256'] = edges.sha(bad)
        with self.assertRaisesRegex(ValueError, 'Unknown relation'):
            edges.records(bad, edges.selected_cases(text(selection), edges.sha(text(selection))), edges.sha(text(selection)),
                          self.parent_rows().get)


if __name__ == '__main__':
    unittest.main()
