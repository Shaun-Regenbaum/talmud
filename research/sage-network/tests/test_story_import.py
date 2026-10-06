"""Check the import against saved source records and deliberate corruption."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('story_build', ROOT / 'scripts/story-readings/build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class StoryImportTests(unittest.TestCase):
    def setUp(self):
        self.row = json.loads((ROOT / 'packages/talmud/static/story-readings/b000.json').read_text())['passages'][0]
        self.source = dict(self.row['source'])

    def test_saved_reading_matches_source(self):
        self.assertEqual(build.validate(self.row['reading'], self.source), [])

    def test_missing_quote_is_rejected(self):
        reading = copy.deepcopy(self.row['reading'])
        reading['people'][0]['quote'] = ''
        self.assertTrue(any('quote not found' in e for e in build.validate(reading, self.source)))

    def test_unknown_person_is_rejected(self):
        reading = copy.deepcopy(self.row['reading'])
        reading['speech'][0]['speaker'] = None
        self.assertTrue(any('invalid speaker' in e for e in build.validate(reading, self.source)))

    def test_all_imported_records_and_counts(self):
        out = ROOT / 'packages/talmud/static/story-readings'
        index = json.loads((out/'index.json').read_text())
        ids, refs = set(), set()
        withheld = 0
        for file in out.glob('b*.json'):
            for row in json.loads(file.read_text())['passages']:
                self.assertNotIn(row['id'], ids)
                self.assertNotIn(row['ref'], refs)
                ids.add(row['id']); refs.add(row['ref'])
                if row['reading'] is None:
                    withheld += 1
                    self.assertTrue(row['withheld'])
                else:
                    self.assertEqual(build.validate(row['reading'], row['source']), [], row['id'])
                    for field in ('people', 'speech', 'relations'):
                        for item in row['reading'][field]:
                            self.assertEqual(item['quoteLocation']=='passage', item['quote'] in row['source']['passage'])
        self.assertEqual(ids, {r['id'] for r in index['passages']})
        self.assertEqual(len(ids), index['summary']['passages'])
        self.assertEqual(withheld, index['summary']['withheldReadings'])


if __name__ == '__main__':
    unittest.main()
