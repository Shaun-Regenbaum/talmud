"""Placements of names in machine readings, on real saved readings.

The people come from three real frozen jobs (tests/fixtures/machine-edge-real.json). The placements chosen for them here are made up
for the rules only: they test what a placement may say, not who anyone is. The selection is built by the tests and authorizes nothing.
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
import machine_placement_store as pl  # noqa: E402
import machine_source_store as machine  # noqa: E402
import source_reading_stores as stores  # noqa: E402
import test_machine_edge_store as base  # noqa: E402
from test_source_reading_stores import database  # noqa: E402

CASES = base.CASES


def a_name(person, label, status='placed', sage='a', agreement='two_models', answers=None, others=None):
    answers = answers if answers is not None else [dict(by='claude', sage=sage, reason='r'), dict(by='gemini-flash', sage=sage, reason='r')]
    return dict(person=person, label=label, form='named', status=status, sage=sage if status == 'placed' else None, reason='why',
                others=others or [], answers=answers, agreement=agreement, candidates=['a', 'b'])


class NameRuleTests(unittest.TestCase):
    """Pure rules, on made-up names. No Talmud data is stood in for here."""

    def test_a_placed_name_needs_models_behind_it(self):
        pl.check_name(a_name('p1', 'x'))
        pl.check_name(a_name('p1', 'x', agreement='one_model', answers=[dict(by='claude', sage='a', reason='r')]))
        with self.assertRaisesRegex(ValueError, 'not backed'):
            pl.check_name(a_name('p1', 'x', agreement='two_models', answers=[dict(by='claude', sage='a', reason='r')]))
        with self.assertRaisesRegex(ValueError, 'at least one model'):
            pl.check_name(a_name('p1', 'x', agreement='none', answers=[dict(by='claude', sage='a', reason='r')]))

    def test_only_a_placed_name_carries_a_sage_and_it_must_have_been_offered(self):
        bad = a_name('p1', 'x', status='unplaced')
        bad['sage'] = 'a'
        with self.assertRaisesRegex(ValueError, 'Only a placed name'):
            pl.check_name(bad)
        with self.assertRaisesRegex(ValueError, 'was not offered'):
            pl.check_name(a_name('p1', 'x', sage='zzz', answers=[dict(by='claude', sage='zzz', reason='r')] * 2))

    def test_a_which_one_name_keeps_two_different_sages(self):
        answers = [dict(by='claude', sage='a', reason='r1'), dict(by='argon', sage='b', reason='r2')]
        ok = a_name('p1', 'x', status='which_one', agreement='none', answers=answers, others=[dict(sage='a', why='r1'), dict(sage='b', why='r2')])
        pl.check_name(ok)
        same = copy.deepcopy(ok)
        same['answers'][1]['sage'] = 'a'
        with self.assertRaisesRegex(ValueError, 'two different sages'):
            pl.check_name(same)


class PlacementStoreTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        old = stores.STORES['bavli']['ownershipManifestSha256']
        stores.STORES['bavli']['ownershipManifestSha256'] = base.OWNERSHIP['expectedManifestSha256']
        self.addCleanup(stores.STORES['bavli'].__setitem__, 'ownershipManifestSha256', old)
        self.db = database(str(self.root / 'store.sqlite'))
        self.addCleanup(self.db.close)
        self.reading_selection, self.reading_artifacts = base.reading_release()
        self.reading_pin = machine.sha(self.reading_selection)
        helper = base.EdgeStoreTests('test_only_clear_checks_are_kept')
        helper.root, helper.db = self.root, self.db
        self.helper = helper
        genesis = helper.release(stores.genesis('bavli'), 'genesis')
        upgrade = stores.upgrade_changes(genesis['sourceReadingStore'], genesis['revision'])
        upgraded = helper.release(helper.extend(upgrade, 'genesis', 'up'), 'upgraded')
        changes = machine.changes_for(upgraded['sourceReadingStore'], self.reading_selection, self.reading_pin, self.reading_artifacts,
                                      base.OWNERSHIP, upgraded['revision'], base.LEGACY, {})
        self.readings = helper.release(helper.extend(changes, 'upgraded', 'readings', checked_selections=[self.reading_pin]), 'readings')
        self.rows = {r[0]: stores.item(r) for r in self.db.execute(
            f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?', (self.readings['revision'],))}
        self.items = []
        for case in CASES:
            result = machine.reading(case['job'], case['answer'], base.INDEX)
            names = [a_name(p['id'], p['label'], sage='a') for p in result['people'][:3]]
            self.items.append(dict(job_id=case['job']['job_id'], reading_passage_id='cs1-' + result['artifactHash'], names=names))
        self.artifact = pl.make_artifact(self.items)
        self.selection = self.selection_for(self.artifact)

    def selection_for(self, artifact):
        items = json.loads(artifact)['items']
        names = sum(len(i['names']) for i in items)
        return base.text(dict(version=pl.SELECTION_VERSION, productionApproved=False, artifactSha256=pl.sha(artifact), passages=len(items),
                              names=names, byStatus={'placed': names}, note='Test only; authorizes nothing.'))

    def records(self, selection=None, artifact=None):
        selection = selection or self.selection
        return pl.records(artifact or self.artifact, pl.selected_cases(selection, pl.sha(selection)), pl.sha(selection), self.rows.get)

    def test_each_name_becomes_one_row_next_to_its_reading(self):
        rows = self.records()
        envelope, names = rows[0], rows[1:]
        self.assertEqual(envelope['kind'], 'machine_placement_release')
        self.assertEqual(len(names), sum(len(i['names']) for i in self.items))
        ids = sorted(r['record_id'] for r in names)
        self.assertEqual((envelope['data']['placementRecords'], envelope['data']['placementRecordsSha256']), (len(ids), pl.sha(pl.canonical_text(ids))))
        for row in names:
            self.assertEqual((row['kind'], row['authority'], row['decision']), ('machine_name_placement', 'screening', 'needs_review'))
            self.assertEqual(row['subject_id'], 'a')
            self.assertIs(row['data']['historicalIdentityAccepted'], False)

    def test_a_placement_for_a_person_or_reading_that_is_not_stored_is_refused(self):
        items = copy.deepcopy(self.items)
        items[0]['names'][0]['label'] = 'someone else'
        artifact = pl.make_artifact(items)
        with self.assertRaisesRegex(ValueError, 'person that is not stored'):
            self.records(self.selection_for(artifact), artifact)
        items = copy.deepcopy(self.items)
        items[0]['reading_passage_id'] = 'cs1-' + '0' * 64
        artifact = pl.make_artifact(items)
        with self.assertRaisesRegex(ValueError, 'not a stored machine reading'):
            self.records(self.selection_for(artifact), artifact)

    def test_a_release_imports_into_the_store_and_the_importer_accepts_it(self):
        pin = pl.sha(self.selection)
        changes = pl.changes_for(self.readings['sourceReadingStore'], self.selection, pin, self.artifact, self.readings['revision'], self.rows)
        self.assertEqual(len(changes['records']), 1 + sum(len(i['names']) for i in self.items))
        outputs = self.helper.extend(changes, 'readings', 'placements', checked_selections=[pin])
        manifest = self.helper.release(outputs, 'placements')
        kinds = dict(self.db.execute("SELECT kind, COUNT(*) FROM sage_graph_all_records WHERE revision_id=? AND kind LIKE 'machine_%placement%' GROUP BY kind",
                                     (manifest['revision'],)).fetchall())
        self.assertEqual(kinds, {'machine_name_placement': sum(len(i['names']) for i in self.items), 'machine_placement_release': 1})
        # The same release, prepared again on top of itself, adds nothing.
        rows = {r[0]: stores.item(r) for r in self.db.execute(f'SELECT {stores.COLUMNS} FROM sage_graph_all_records WHERE revision_id=?',
                                                              (manifest['revision'],))}
        again = pl.changes_for(manifest['sourceReadingStore'], self.selection, pin, self.artifact, manifest['revision'], rows)
        self.assertEqual(again['records'], [])

    def test_pins_and_counts_come_from_the_selection(self):
        with self.assertRaisesRegex(ValueError, 'not the one that was pinned'):
            pl.selected_cases(self.selection, '0' * 64)
        selection = json.loads(self.selection)
        selection['names'] += 1
        with self.assertRaisesRegex(ValueError, 'counts differ'):
            self.records(selection=base.text(selection))
        with self.assertRaisesRegex(ValueError, 'differs from the selection'):
            self.records(artifact=self.artifact + ' ')


if __name__ == '__main__':
    unittest.main()
