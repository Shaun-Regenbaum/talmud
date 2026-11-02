"""Unreviewed machine readings in a source-reading store, on real saved readings.

The fixture holds four real frozen jobs and the answers a model saved for them. Their ownership map is built
for these four jobs only. The selection here is built by the tests and is labelled so; it authorizes nothing.
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
import checked_source_store as checked  # noqa: E402
import machine_source_store as machine  # noqa: E402
import source_reading_stores as stores  # noqa: E402
from extend_d1 import prepare  # noqa: E402
from ownership.tile_ownership import POLICY, VERSION, digest, source_unit  # noqa: E402
from test_source_reading_stores import LEGACY, database  # noqa: E402

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/machine-source-real.json').read_text())


def subset_ownership(jobs):
    """Ownership for these four test jobs only, not the corpus. The header is marked as a fixture subset."""
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


OWNERSHIP = subset_ownership([c['job'] for c in FIXTURE['cases']])
INDEX = stores.pinned_index(OWNERSHIP)


def text(value):
    return json.dumps(value, ensure_ascii=False, indent=1) + '\n'


def release_inputs(cases):
    """A test-only selection of these readings, and the artifact file of each."""
    artifacts, entries = {}, []
    for case in cases:
        body = machine.make_artifact(case['job'], case['answer'], case['reader'], case['requestSha256'])
        result = machine.reading(case['job'], case['answer'], INDEX)
        artifacts[case['job']['job_id']] = body
        entries.append(dict(jobId=case['job']['job_id'], artifactHash=result['artifactHash'], bundleFileSha256=machine.sha(body),
                            people=len(result['people']), connections=len(result['connections'])))
    selection = text(dict(version=machine.SELECTION_VERSION, productionApproved=False, readings=len(entries),
                          people=sum(e['people'] for e in entries), connections=sum(e['connections'] for e in entries),
                          cases=entries, note='Test only; authorizes nothing.'))
    return selection, artifacts


class MachineStoreTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        old = stores.STORES['bavli']['ownershipManifestSha256']
        stores.STORES['bavli']['ownershipManifestSha256'] = OWNERSHIP['expectedManifestSha256']
        self.addCleanup(stores.STORES['bavli'].__setitem__, 'ownershipManifestSha256', old)
        self.selection, self.artifacts = release_inputs(FIXTURE['cases'])
        self.pin = machine.sha(self.selection)
        self.db = database(str(self.root / 'store.sqlite'))
        self.addCleanup(self.db.close)
        self.genesis = self.release(stores.genesis('bavli'), 'genesis')

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

    def changes(self, block, parent, existing=None, selection=None, artifacts=None):
        selection = selection or self.selection
        return machine.changes_for(block, selection, machine.sha(selection), artifacts or self.artifacts, OWNERSHIP,
                                   parent, LEGACY, existing)

    def upgraded(self):
        upgrade = stores.upgrade_changes(self.genesis['sourceReadingStore'], self.genesis['revision'])
        return self.release(self.extend(upgrade, 'genesis', 'up'), 'upgraded')

    def rows(self):
        cases = machine.selected_cases(self.selection, self.pin)[1]
        return machine.rows_for('bavli', cases, self.artifacts, INDEX, self.pin)

    def test_rows_say_they_are_unreviewed_and_list_each_other(self):
        rows = self.rows()
        envelopes = [r for r in rows if r['kind'] == 'checked_reading']
        self.assertEqual(len(envelopes), len(FIXTURE['cases']))
        for envelope in envelopes:
            data = envelope['data']
            mine = [r for r in rows if r['passage_id'] == envelope['passage_id']]
            self.assertEqual((data['origin'], data['planHash'], data['approvalHash'], data['rootApprovalFileSha256'],
                              data['reviewHashes'], data['wholeReadingFullyChecked']),
                             (machine.ORIGIN, None, None, None, [], False))
            self.assertEqual(data['contains'], {k: sorted(r['record_id'] for r in mine if r['kind'] == k)
                                                for k in sorted(checked.KINDS - {'checked_reading'})})
            self.assertEqual(data['supersedes']['rawResultHash'], data['binding']['rawResultHash'])
            self.assertTrue(all(c['status'] == 'unreviewed'
                                for r in mine if r['kind'] == 'checked_coverage' for c in r['data']['sourceCoverage']))
            self.assertTrue(all(r['data']['decision']['action'] == machine.ACCEPT
                                for r in mine if r['kind'] in ('checked_person', 'checked_connection')))
            self.assertTrue(all((r['authority'], r['decision']) == ('screening', 'needs_review') for r in mine))
            self.assertTrue(all(r['data']['format'] == checked.FORMAT for r in mine))
        self.assertTrue(any(r['kind'] == 'checked_decision' for r in rows), 'real readings hold some items')

    def test_held_items_stay_on_record_with_their_reason(self):
        held = [r['data'] for r in self.rows() if r['kind'] == 'checked_decision']
        self.assertTrue(held)
        self.assertTrue(all(d['action'] == 'hold' and d['after'] is None and d['reason'] for d in held))
        self.assertTrue({'An end of the relationship is unresolved.', 'An end is hypothetical or uncertain.'}
                        & {d['reason'] for d in held})

    def test_connections_and_people_follow_the_answer(self):
        for case in FIXTURE['cases']:
            result = machine.reading(case['job'], case['answer'], INDEX)
            answer = case['answer']
            kept = {p['id'] for p in result['people']}
            self.assertEqual(kept, {p['id'] for p in answer['people'] if p['kind'] != 'not_a_person'})
            for connection in result['connections']:
                original = next(r for r in answer['relationships'] if r['id'] == connection['id'])
                self.assertEqual(connection['predicate']['value'], original['relation'])
                self.assertEqual(set(connection['participants']), {original['subject'], original['object']})
                self.assertTrue(set(connection['participants']) <= kept)
                self.assertIs(connection['establishesMeeting'], False)
            for person in result['people']:
                for mention in person['mentions']:
                    source = next(s for s in case['job']['sources'] if s['source_id'] == mention['sourceId'])
                    self.assertEqual(source['text'][mention['start']:mention['end']], mention['quote'])
                    self.assertEqual(mention['namePlacementEligible'], mention['role'] == 'printed_name')
            self.assertEqual(result['artifactHash'], machine.reading(case['job'], case['answer'], INDEX)['artifactHash'])

    def test_broad_types_follow_the_relation(self):
        self.assertEqual({r: machine.broad_type(r) for r in machine.RELATIONS}, {
            'child_of': 'family', 'child_in_law_of': 'family', 'spouse_of': 'family', 'sibling_of': 'family',
            'acts_on': 'direct_interaction', 'speaks_to': 'direct_interaction', 'asks': 'intellectual_connection',
            'answers': 'intellectual_connection', 'opposes': 'intellectual_connection',
            'supports': 'intellectual_connection', 'responds_to_teaching': 'intellectual_connection',
            'teaches': 'intellectual_connection', 'student_of': 'intellectual_connection',
            'reports_in_name_of': 'transmission'})

    def test_pins_come_only_from_the_callers_selection_pin(self):
        with self.assertRaisesRegex(ValueError, 'not the one that was pinned'):
            machine.selected_cases(self.selection, '0' * 64)
        selection = json.loads(self.selection)
        selection['cases'].append(selection['cases'][0])
        with self.assertRaisesRegex(ValueError, 'selected twice'):
            machine.selected_cases(text(selection), machine.sha(text(selection)))
        selection = json.loads(self.selection)
        selection['productionApproved'] = True
        with self.assertRaisesRegex(ValueError, 'Unknown machine release selection'):
            machine.selected_cases(text(selection), machine.sha(text(selection)))
        selection = json.loads(self.selection)
        selection['cases'][0]['artifactHash'] = '2' * 64
        with self.assertRaisesRegex(ValueError, 'differs from the selected one'):
            machine.records(self.artifacts[selection['cases'][0]['jobId']], selection['cases'][0], INDEX, self.pin)
        selection = json.loads(self.selection)
        selection['cases'][0]['people'] += 1
        with self.assertRaisesRegex(ValueError, 'totals differ'):
            machine.selected_cases(text(selection), machine.sha(text(selection)))
        job = FIXTURE['cases'][0]['job']['job_id']
        with self.assertRaisesRegex(ValueError, 'differs from the selection'):
            machine.rows_for('bavli', machine.selected_cases(self.selection, self.pin)[1],
                             dict(self.artifacts, **{job: self.artifacts[job] + ' '}), INDEX, self.pin)

    def test_edited_answer_is_refused(self):
        case = copy.deepcopy(FIXTURE['cases'][0])
        person = case['answer']['people'][0]
        person['mentions'][0]['quote'] = 'לא בטקסט'
        with self.assertRaises(ValueError):
            machine.reading(case['job'], case['answer'], INDEX)

    def test_a_checked_selection_cannot_stand_in_for_a_machine_one(self):
        upgraded = self.upgraded()
        changes = self.changes(upgraded['sourceReadingStore'], upgraded['revision'])
        with self.assertRaisesRegex(ValueError, 'not pinned by the caller'):
            self.extend(changes, 'upgraded', 'refused')
        with self.assertRaisesRegex(ValueError, 'not pinned by the caller'):
            self.extend(changes, 'upgraded', 'refused', checked_selections=['0' * 64])
        edited = dict(changes, machineSelection=self.selection.replace('Test only', 'Test  only'))
        with self.assertRaisesRegex(ValueError, 'not pinned by the caller|differ'):
            self.extend(edited, 'upgraded', 'refused2', checked_selections=[self.pin])
        stray = dict(changes, records=changes['records'][:-1])
        with self.assertRaisesRegex(ValueError, 'strict reconstruction'):
            self.extend(stray, 'upgraded', 'refused3', checked_selections=[self.pin])

    def test_release_import_read_back_and_a_second_release(self):
        with self.assertRaisesRegex(ValueError, 'does not hold checked readings yet'):
            self.changes(self.genesis['sourceReadingStore'], self.genesis['revision'])
        upgraded = self.upgraded()
        changes = self.changes(upgraded['sourceReadingStore'], upgraded['revision'])
        first = self.release(self.extend(changes, 'upgraded', 'first', checked_selections=[self.pin]), 'first')
        artifacts = self.root / 'artifacts'
        artifacts.mkdir()
        for body in self.artifacts.values():
            (artifacts / (machine.sha(body) + '.json')).write_text(body)
        inputs = dict(selection=self.selection, pin=self.pin, machine=True)
        with self.assertRaisesRegex(ValueError, 'pinned selection'):
            stores.verify_store(self.root / 'first.sql', self.root / 'first.json', artifacts, [OWNERSHIP])
        receipt = stores.verify_store(self.root / 'first.sql', self.root / 'first.json', artifacts, [OWNERSHIP],
                                      checked=[inputs])
        self.assertEqual((receipt['checkedPassages'], receipt['passagesChecked']), (len(FIXTURE['cases']),) * 2)
        file = stores.readback(self.root / 'first.sql', self.root / 'first.json', artifacts, [OWNERSHIP], [inputs])
        self.assertEqual(len(file['checkedPassages']), len(FIXTURE['cases']))
        # The downloaded file must be the artifact's exact bytes.
        name = machine.sha(self.artifacts[FIXTURE['cases'][0]['job']['job_id']]) + '.json'
        original = (artifacts / name).read_text()
        (artifacts / name).write_text(original + ' ')
        with self.assertRaisesRegex(ValueError, 'Downloaded R2 file differs'):
            stores.verify_store(self.root / 'first.sql', self.root / 'first.json', artifacts, [OWNERSHIP], checked=[inputs])
        (artifacts / name).write_text(original)
        # Saying the same answer again is refused, not stored twice.
        existing = {r[0]: stores.item(r) for r in self.db.execute(
            f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (first['revision'],))}
        again = self.changes(first['sourceReadingStore'], first['revision'], existing)
        self.assertEqual(again['records'], [])

    def test_machine_only_verification_needs_no_parent_receipt_and_cannot_stand_for_a_full_one(self):
        upgraded = self.upgraded()
        inputs, artifacts = [], self.root / 'artifacts'
        artifacts.mkdir()
        current, label, receipts = upgraded, 'upgraded', []
        for i, case in enumerate(FIXTURE['cases'][:2]):
            selection, bodies = release_inputs([case])
            pin = machine.sha(selection)
            inputs.append(dict(selection=selection, pin=pin, machine=True))
            for body in bodies.values():
                (artifacts / (machine.sha(body) + '.json')).write_text(body)
            existing = {r[0]: stores.item(r) for r in self.db.execute(
                f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (current['revision'],))}
            changes = self.changes(current['sourceReadingStore'], current['revision'], existing, selection, bodies)
            nxt = f'batch-{i}'
            current = self.release(self.extend(changes, label, nxt, checked_selections=[pin]), nxt)
            label = nxt
            if i:
                # The second release inherits the first, whose own receipt a full verification would need.
                with self.assertRaisesRegex(ValueError, 'needs its own read-back receipt'):
                    stores.verify_store(self.root / f'{label}.sql', self.root / f'{label}.json', artifacts, [OWNERSHIP],
                                        checked=inputs)
            receipts.append(stores.verify_store(self.root / f'{label}.sql', self.root / f'{label}.json', artifacts,
                                                [OWNERSHIP], checked=inputs, machine_only=True))
        self.assertEqual([r['scope'] for r in receipts], ['machine-only'] * 2)
        self.assertEqual(receipts[1]['passagesChecked'], 1)
        # A machine-only receipt is not a parent receipt for a full verification.
        with self.assertRaisesRegex(ValueError, 'needs its own read-back receipt'):
            stores.verify_store(self.root / f'{label}.sql', self.root / f'{label}.json', artifacts, [OWNERSHIP],
                                receipts[0], checked=inputs)
        with self.assertRaisesRegex(ValueError, 'cannot be a full one'):
            stores.verify_store(self.root / f'{label}.sql', self.root / f'{label}.json', artifacts, [OWNERSHIP],
                                checked=inputs, full=True, machine_only=True)

    def test_a_machine_release_adds_to_an_earlier_one_and_keeps_it(self):
        upgraded = self.upgraded()
        current, label = upgraded, 'upgraded'
        inputs, artifacts = [], self.root / 'artifacts'
        artifacts.mkdir()
        for i, case in enumerate(FIXTURE['cases']):
            selection, bodies = release_inputs([case])
            pin = machine.sha(selection)
            inputs.append(dict(selection=selection, pin=pin, machine=True))
            for body in bodies.values():
                (artifacts / (machine.sha(body) + '.json')).write_text(body)
            existing = {r[0]: stores.item(r) for r in self.db.execute(
                f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (current['revision'],))}
            changes = self.changes(current['sourceReadingStore'], current['revision'], existing, selection, bodies)
            nxt = f'batch-{i}'
            current = self.release(self.extend(changes, label, nxt, checked_selections=[pin]), nxt)
            label = nxt
        receipt = stores.verify_store(self.root / f'{label}.sql', self.root / f'{label}.json', artifacts, [OWNERSHIP],
                                      checked=inputs, full=True)
        self.assertEqual(receipt['checkedPassages'], len(FIXTURE['cases']))
        # A read-back needs every selection the store holds.
        with self.assertRaisesRegex(ValueError, 'pinned selection'):
            stores.verify_store(self.root / f'{label}.sql', self.root / f'{label}.json', artifacts, [OWNERSHIP],
                                checked=inputs[:-1], full=True)


if __name__ == '__main__':
    unittest.main()
