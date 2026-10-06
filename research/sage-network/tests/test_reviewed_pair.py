"""The reviewed pair must stay attached to the exact readings that were checked."""
import hashlib
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
STATIC = ROOT / 'packages/talmud/static'


class ReviewedPairTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.review = json.loads((STATIC / 'sage-reviews/abaye-rava.json').read_text())
        cls.sources = {}
        cls.candidates = set()
        for pack in sorted((STATIC / 'story-readings').glob('b*.json')):
            for passage in json.loads(pack.read_text())['passages']:
                cls.sources[passage['id']] = passage
                names = {p['label'] for p in (passage.get('reading') or {}).get('people', [])}
                if {'אביי', 'רבא'} <= names:
                    cls.candidates.add(passage['id'])

    def test_every_candidate_has_one_decision(self):
        ids = [r['passageId'] for r in self.review['rows']]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(set(ids), self.candidates)

    def test_exact_readings_quotes_and_people(self):
        for row in self.review['rows']:
            with self.subTest(passage=row['passageId']):
                source = self.sources[row['passageId']]
                digest = hashlib.sha256(json.dumps(source, ensure_ascii=False, sort_keys=True,
                                                  separators=(',', ':')).encode()).hexdigest()
                self.assertEqual(row['readingHash'], digest)
                self.assertEqual(row['ref'], source['ref'])
                self.assertTrue(row['quote'])
                self.assertIn(row['quote'], source['source']['passage'])
                people = {p['id']: p for p in source['reading']['people']}
                self.assertEqual(people[row['people']['abaye']]['label'], 'אביי')
                self.assertEqual(people[row['people']['rava']]['label'], 'רבא')
                self.assertTrue(row['summary']['en'])
                self.assertTrue(row['summary']['he'])
                if row['status'] != 'included':
                    self.assertEqual(row['groups'], [])
                else:
                    self.assertTrue(row['groups'])
                    self.assertLessEqual(set(row['groups']), {'relationships', 'words', 'views', 'events'})
                    self.assertEqual(source['corpus'], 'bavli')

    def test_known_traps_do_not_become_connections(self):
        rows = {r['passageId']: r for r in self.review['rows']}
        for pid in ['b103-p0', 'b192-p2', 'b317-p8', 'b459-p8', 'b188-p8']:
            self.assertEqual(rows[pid]['status'], 'excluded')
        for pid in ['b017-p1', 'b066-p4', 'b070-p7', 'b545-p0', 'b574-p9', 'b529-p4']:
            self.assertEqual(rows[pid]['status'], 'unresolved')
        for pid in ['b301-p7', 'b526-p0']:
            self.assertEqual(rows[pid]['mode'], 'message')
            self.assertNotIn('events', rows[pid]['groups'])
        for pid in ['b079-p2', 'b121-p3', 'b168-p7', 'b247-p7', 'b332-p9']:
            self.assertIn('events', rows[pid]['groups'])
        self.assertFalse(any('relationships' in r['groups'] for r in rows.values()))


if __name__ == '__main__':
    unittest.main()
