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

    def add_registry_person(self):
        captured = json.loads((ROOT / 'packages/talmud/tests/fixtures/reviewed-elazar.json').read_text())
        row = dict(record_id='registry_person:' + captured['slug'], kind='registry_person',
                   passage_id=None, ref=None, subject_id=captured['slug'], object_id=None,
                   authority='source_review', decision='supported', data=captured['entry'])
        self.changes['records'].append(row)
        return row

    def test_sourced_missing_registry_person_round_trips(self):
        self.add_registry_person()
        self.assertEqual(self.run_import()['changedRecords'], len(self.changes['records']))

    def test_registry_person_requires_sources(self):
        self.add_registry_person()['data']['sources'] = []
        with self.assertRaisesRegex(ValueError, 'Registry person needs sources'):
            self.run_import()

    def test_registry_person_cannot_change_indexed_identity(self):
        self.add_registry_person()['subject_id'] = 'rabbi-elazar-b-yose'
        with self.assertRaisesRegex(ValueError, 'Invalid reviewed registry indexes'):
            self.run_import()

    def test_registry_person_cannot_use_unknown_generation_label(self):
        self.add_registry_person()['data']['generation'] = 'invalid-generation-for-test'
        with self.assertRaisesRegex(ValueError, 'Invalid registry generation'):
            self.run_import()

    def test_registry_person_requires_explicit_empty_biography(self):
        del self.add_registry_person()['data']['bio']
        with self.assertRaisesRegex(ValueError, 'Invalid registry biography'):
            self.run_import()

    def test_registry_person_rejects_source_urls_the_card_cannot_read(self):
        row = self.add_registry_person()
        for invalid in ('https://example.com:bad', 'https://exa mple.com',
                        'HTTPS://example.com', 'https://example.com:99999',
                        'https://example.com\\@invalid', 'https://example.com\n.invalid'):
            with self.subTest(url=invalid):
                row['data']['sources'][0]['url'] = invalid
                with self.assertRaisesRegex(ValueError, 'Invalid registry source URL'):
                    self.run_import()

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

    def add_assessment(self):
        screen = self.item('era_review')
        assessment = copy.deepcopy(screen)
        assessment.update(record_id='era_assessment:' + screen['data']['claimId'],
                          kind='era_assessment', authority='source_review', decision='reviewed')
        assessment['data'] = dict(
            claimId=screen['data']['claimId'],
            screenPayloadSha256=hashlib.sha256(encode(screen['data']).encode()).hexdigest(),
            status='reviewed', outcome='full_name_restored', acceptedIdentity=False, acceptedEra=False,
            reason='The passage gives Yochanan a longer identifying name.',
            nextStep='Compare a separate historical identity before assigning an era.',
            evidence=copy.deepcopy(screen['data']['evidence']))
        self.changes['records'].append(assessment)
        return assessment

    def test_assessment_preserves_original_screen(self):
        self.add_assessment()
        self.run_import()
        manifest = json.loads((self.root / 'out/manifest.json').read_text())
        self.assertEqual(manifest['countsByKind']['era_review'], 1)
        self.assertEqual(manifest['countsByKind']['era_assessment'], 1)

    def test_assessment_cannot_accept_identity_or_era(self):
        assessment = self.add_assessment()
        for field in ['acceptedIdentity', 'acceptedEra']:
            with self.subTest(field=field):
                assessment['data'][field] = True
                with self.assertRaisesRegex(ValueError, 'cannot accept'):
                    self.run_import()
                assessment['data'][field] = False

    def test_assessment_requires_exact_screen_hash(self):
        self.add_assessment()['data']['screenPayloadSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'original screen'):
            self.run_import()

    def test_assessment_cannot_switch_people(self):
        row = self.add_assessment()
        row['subject_id'], row['object_id'] = row['object_id'], row['subject_id']
        with self.assertRaisesRegex(ValueError, 'indexes differ from screen'):
            self.run_import()

    def test_assessment_cannot_switch_evidence(self):
        self.add_assessment()['data']['evidence'][0]['quote'] = 'Changed evidence'
        with self.assertRaisesRegex(ValueError, 'evidence differs from screen'):
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
