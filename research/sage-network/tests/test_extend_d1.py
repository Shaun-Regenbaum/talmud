"""Exercise review imports and corruptions using saved public source passages."""
import copy
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'research/sage-network/storage'))
from extend_d1 import prepare
from prepare_d1 import encode

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/reviewed-extension.json').read_text())


class ReviewImportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.changes = copy.deepcopy(FIXTURE['changes'])
        rows = FIXTURE['records']
        self.manifest = dict(revision=self.changes['parentRevision'], recordCount=len(rows),
                             countsByKind=dict(Counter(r[1] for r in rows)),
                             recordSetSha256=hashlib.sha256(encode([r[:-1] for r in rows]).encode()).hexdigest())
        db = sqlite3.connect(':memory:')
        for migration in sorted((ROOT / 'packages/talmud/migrations-sage-graph').glob('*.sql')):
            db.executescript(migration.read_text())
        db.execute('INSERT INTO sage_graph_revisions(id,manifest_json,state) VALUES (?,?,?)',
                   (self.manifest['revision'], encode({k:v for k,v in self.manifest.items() if k != 'revision'}), 'loading'))
        db.executemany('INSERT INTO sage_graph_records VALUES ('+','.join('?' * 11)+')',
                       [(self.manifest['revision'], *r) for r in rows])
        db.execute("UPDATE sage_graph_revisions SET state='verified'")
        self.export = self.root / 'parent.sql'
        self.export.write_text('\n'.join(db.iterdump()))
        db.close()
        self.manifest_file = self.root / 'manifest.json'
        self.manifest_file.write_text(json.dumps(self.manifest))
        self.input = self.root / 'changes.json'

    def run_import(self):
        self.input.write_text(json.dumps(self.changes, ensure_ascii=False))
        return prepare(self.export, self.manifest_file, self.input, self.root / 'out')

    def item(self, kind):
        return next(r for r in self.changes['records'] if r['kind'] == kind)

    def test_real_reviews_round_trip_and_identical_resume(self):
        first = self.run_import()
        self.assertEqual(first, self.run_import())
        self.assertEqual(first['changedRecords'], len(self.changes['records']))

    def test_unknown_person_in_passage(self):
        self.item('name_occurrence')['data']['personKey'] = 'b221-p8/does-not-exist'
        with self.assertRaisesRegex(ValueError, 'Unknown passage person'):
            self.run_import()

    def test_person_not_in_target_node(self):
        self.item('name_occurrence')['data']['personId'] = 'local:b221-p8/C'
        self.item('name_occurrence')['subject_id'] = 'local:b221-p8/C'
        with self.assertRaisesRegex(ValueError, 'not a member'):
            self.run_import()

    def test_bad_profile_quote(self):
        self.item('graph_node')['data']['sourceProfile']['quote'] = 'invalid quote for corruption test'
        with self.assertRaisesRegex(ValueError, 'Profile quote differs'):
            self.run_import()

    def test_bad_place_quote(self):
        row = next(r for r in self.changes['records'] if r['kind']=='graph_node' and r['data'].get('sourceProfile', {}).get('places'))
        row['data']['sourceProfile']['places'][0]['quote'] = 'invalid place quote for corruption test'
        with self.assertRaisesRegex(ValueError, 'Place quote differs'):
            self.run_import()

    def test_indexed_person_differs(self):
        self.item('name_occurrence')['subject_id'] = 'rav-huna-b-hinena'
        with self.assertRaisesRegex(ValueError, 'Person index differs'):
            self.run_import()

    def test_negative_or_empty_occurrence(self):
        for start, end, quote in [(-1, 0, ''), (0, 0, ''), (False, 5, 'רב')]:
            with self.subTest(start=start, end=end):
                self.item('name_occurrence')['data'].update(characterStart=start, characterEnd=end, quote=quote)
                with self.assertRaisesRegex(ValueError, 'Invalid name bounds'):
                    self.run_import()

    def test_era_screen_cannot_be_accepted(self):
        self.item('era_review')['decision'] = 'supported'
        with self.assertRaisesRegex(ValueError, 'new unaccepted reviews'):
            self.run_import()

    def test_era_screen_must_name_a_real_passage_person(self):
        self.item('era_review')['data']['a']['personKey'] = 'b493-p6/does-not-exist'
        with self.assertRaisesRegex(ValueError, 'Era review indexes differ'):
            self.run_import()

    def test_era_screen_cannot_switch_the_speakers(self):
        item = self.item('era_review')
        item['data']['a'], item['data']['b'] = item['data']['b'], item['data']['a']
        item['subject_id'], item['object_id'] = item['object_id'], item['subject_id']
        with self.assertRaisesRegex(ValueError, 'Era review pair differs from claim'):
            self.run_import()

    def test_era_screen_cannot_change_its_quote(self):
        self.item('era_review')['data']['quote'] = 'changed quote'
        with self.assertRaisesRegex(ValueError, 'Era review quote differs from claim'):
            self.run_import()

    def test_wrong_replacement_hash(self):
        self.item('graph_node')['replacesSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'previous hash'):
            self.run_import()

    def test_cannot_replace_original_passage(self):
        self.item('graph_node')['kind'] = 'passage'
        with self.assertRaisesRegex(ValueError, 'Unsupported review kind'):
            self.run_import()

    def test_different_output_is_not_overwritten(self):
        self.run_import()
        self.changes['description'] += ' Changed description.'
        with self.assertRaisesRegex(ValueError, 'Refusing to replace different output'):
            self.run_import()


if __name__ == '__main__':
    unittest.main()
