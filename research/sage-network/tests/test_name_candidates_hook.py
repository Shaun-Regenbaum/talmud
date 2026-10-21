"""The name_candidates branch of extend_d1, run on a parent export made of real rows.

The parent is the importer tests' parent: 115 registry and decision records copied from live revision 8b0f4c and the
approved v8 readings 001 and 101 as the reading importer builds them, held by the graph. Its export and manifest are made
for the test with the repo's own migrations. In a release root writes the pins; here pins_for plays that part.
"""
import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'storage'), str(ROOT / 'identity'), str(ROOT), str(Path(__file__).parent)]
import name_candidates as nc  # noqa: E402
import name_candidates_import as imp  # noqa: E402
from extend_d1 import prepare  # noqa: E402
from test_name_candidates_import import ALIASES, DUPLICATES, R001, parent, pins_for  # noqa: E402

MIGRATIONS = ROOT.parents[1] / 'packages/talmud/migrations-sage-graph'


class NameCandidateHookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.rows, manifest = parent()
        self.manifest = dict(manifest, countsByKind=dict(sorted(Counter(r[1] for r in self.rows).items())))
        db = sqlite3.connect(':memory:')
        for migration in sorted(MIGRATIONS.glob('*.sql')):
            db.executescript(migration.read_text())
        db.execute('INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,?,?)',
                   (self.manifest['revision'], imp.d1_encode({k: v for k, v in self.manifest.items() if k != 'revision'}), 'loading'))
        db.executemany('INSERT INTO sage_graph_records VALUES (' + ','.join('?' * 11) + ')', [(self.manifest['revision'], *r) for r in self.rows])
        db.execute("UPDATE sage_graph_revisions SET state='verified'")
        self.export = self.root / 'parent.sql'
        self.export.write_text('\n'.join(db.iterdump()))
        db.close()
        self.manifest_file = self.root / 'manifest.json'
        self.manifest_file.write_text(json.dumps(self.manifest))
        self.pins = pins_for(self.manifest)
        self.changes = imp.build(self.rows, self.manifest, [], self.pins, ALIASES, DUPLICATES)

    def release(self, changes=None, text=None, out='out', **kw):
        path = self.root / (out + '-changes.json')
        path.write_text(text if text is not None else json.dumps(changes or self.changes, ensure_ascii=False))
        return prepare(self.export, self.manifest_file, path, self.root / out, shared=True, **kw)

    def test_a_checked_batch_becomes_a_loading_revision(self):
        result = self.release(name_candidate_pins=self.pins)
        self.assertEqual(result['changedRecords'], 8)
        out = self.root / 'out'
        made = json.loads((out / 'manifest.json').read_text())
        self.assertEqual(made['parentRevision'], self.manifest['revision'])
        self.assertEqual(made['countsByKind']['name_candidates'], 8)
        db = sqlite3.connect(':memory:')
        db.executescript(self.export.read_text())
        db.executescript((out / 'import.sql').read_text())
        self.assertEqual(db.execute('SELECT state FROM sage_graph_revisions WHERE id=?', (made['revision'],)).fetchone(), ('loading',))
        stored = {r[0]: (r[1], r[2], r[3]) for r in db.execute(
            "SELECT record_id,authority,decision,payload_json FROM sage_graph_all_records WHERE revision_id=? AND kind='name_candidates'",
            (made['revision'],))}
        self.assertEqual(set(stored), {r['record_id'] for r in self.changes['records']})
        for record in self.changes['records']:
            self.assertEqual(stored[record['record_id']], ('screening', 'needs_review', imp.d1_encode(record['data'])))
        # Every parent record is kept exactly as it was, and only the 8 suggestions are new.
        columns = 'record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json'
        rows_of = lambda revision: {r[0]: r for r in db.execute(f'SELECT {columns} FROM sage_graph_all_records WHERE revision_id=?', (revision,))}
        before, after = rows_of(self.manifest['revision']), rows_of(made['revision'])
        self.assertEqual(len(before), len(self.rows))
        self.assertTrue(all(after[k] == v for k, v in before.items()))
        self.assertEqual(set(after) - set(before), set(stored))

    def test_the_batch_needs_root_pins_from_the_caller(self):
        with self.assertRaisesRegex(ValueError, "needs root's release pins"):
            self.release()
        wrong = copy.deepcopy(self.pins)
        wrong['graph']['recordSetSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'graph parent differs from the release pins'):
            self.release(name_candidate_pins=wrong)

    def test_an_edited_or_loosely_written_batch_is_refused(self):
        edited = copy.deepcopy(self.changes)
        rava = next(r for r in edited['records'] if r['subject_id'] == R001 + '/p2')
        rava['data'].update(status='tentative', suggestion='rava')
        with self.assertRaisesRegex(ValueError, 'differ from a rebuild'):
            self.release(edited, name_candidate_pins=self.pins)
        text = json.dumps(self.changes, ensure_ascii=False)
        repeated = text.replace('{"version"', '{"version": "x", "version"', 1)
        self.assertNotEqual(repeated, text)
        with self.assertRaisesRegex(ValueError, 'Repeated JSON key'):
            self.release(text=repeated, name_candidate_pins=self.pins)

    def test_an_accepted_or_human_replacing_batch_is_refused(self):
        accepted = copy.deepcopy(self.changes)
        accepted['records'][0]['data']['accepted'] = True
        with self.assertRaisesRegex(ValueError, 'differ from a rebuild'):
            self.release(accepted, name_candidate_pins=self.pins)
        # A real human correction in the parent, with a replacement slipped into the batch.
        human = next(r for r in self.rows if r[6] == 'user_correction')
        mixed = copy.deepcopy(self.changes)
        mixed['records'].append(dict(record_id=human[0], kind=human[1], passage_id=human[2], ref=human[3], subject_id=human[4],
                                     object_id=human[5], authority='screening', decision='needs_review', replacesSha256=human[8],
                                     data=json.loads(human[9])))
        with self.assertRaises(ValueError):
            self.release(mixed, name_candidate_pins=self.pins)

    def test_nothing_in_the_changes_can_stand_in_for_the_pins(self):
        # The batch's own record of its inputs is not a pin file, and an absent pin is never filled from it.
        with self.assertRaisesRegex(ValueError, "needs root's release pins"):
            self.release(name_candidate_pins=None)
        with self.assertRaisesRegex(ValueError, 'Not a name_candidates release pin file'):
            self.release(name_candidate_pins=self.changes['nameCandidateInputs'])

    def test_name_candidates_come_only_in_their_own_batch(self):
        loose = {k: v for k, v in self.changes.items() if k != 'nameCandidateInputs'}
        with self.assertRaisesRegex(ValueError, 'come only in a name_candidates batch'):
            self.release(loose)
        mixed = dict(self.changes, possibleEraPolicy={})
        with self.assertRaises(ValueError):
            self.release(mixed, name_candidate_pins=self.pins)

    def test_the_release_command_runs_the_same_check(self):
        pins_file = self.root / 'pins.json'
        pins_file.write_text(json.dumps(self.pins))
        changes_file = self.root / 'cli-changes.json'
        changes_file.write_text(json.dumps(self.changes, ensure_ascii=False))
        argv = sys.argv
        sys.argv = ['name_candidates_import.py', 'release', '--export', str(self.export), '--manifest', str(self.manifest_file),
                    '--pins', str(pins_file), '--changes', str(changes_file), '--output', str(self.root / 'cli')]
        try:
            imp.main()
        finally:
            sys.argv = argv
        self.assertEqual(json.loads((self.root / 'cli/manifest.json').read_text())['countsByKind']['name_candidates'], 8)


if __name__ == '__main__':
    unittest.main()
