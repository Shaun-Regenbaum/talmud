"""Import rules for a reference correction: passages captured under page labels that do not exist
move to their verified references.

The fixture holds real live records on two copies of Sifrei Zuta 11:31:2 and the passage records of
two copies of Mekhilta DeRabbi Shimon Ben Yochai 12:16, with their entries from the frozen map. The
tests check the import rules only.
"""
import copy
import json
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'storage'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reference_correction
from extend_d1 import digest
from prepare_d1 import encode
from test_identity_assessments import import_records

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/reference-correction.json').read_text())
PASSAGES = FIXTURE['passages']


def parent_rows(records):
    rows = []
    for item in records:
        payload = encode(item['data'])
        rows.append((item['record_id'], item['kind'], item.get('passage_id'), item.get('ref'), item.get('subject_id'), item.get('object_id'),
                     item['authority'], item.get('decision'), digest(payload), payload))
    rows.sort()
    return rows


class ReferenceCorrectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.records = [{k: v for k, v in r.items() if k != 'payloadSha256'} for r in FIXTURE['records']]
        self.map = copy.deepcopy(FIXTURE['map'])

    def expected(self, records=None, correction=None):
        rows = parent_rows(records or self.records)
        parent = dict(revision='saved-pilot-assessment-source')
        return reference_correction.build(rows, correction or self.map, parent)

    def run_import(self, changes):
        return import_records(self.root, self.records, changes['records'], description=changes['description'],
                              referenceCorrection=changes['referenceCorrection'])

    def rejects(self, message, changes):
        with self.assertRaisesRegex(ValueError, message):
            self.run_import(changes)

    def entry(self, correction, passage_id):
        return next(e for e in correction['passages'] if e['passageId'] == passage_id)

    def test_fixture_is_verbatim(self):
        for record in FIXTURE['records']:
            self.assertEqual(digest(encode(record['data'])), record['payloadSha256'])

    def test_every_record_on_a_mapped_passage_is_corrected(self):
        changes = self.expected()
        self.assertEqual(len(changes['records']), len(self.records))
        self.assertEqual(self.run_import(changes)['changedRecords'], len(self.records))

    def test_only_the_reference_moves(self):
        changes = self.expected()
        before = {r['record_id']: r for r in self.records}
        for record in changes['records']:
            old = before[record['record_id']]
            entry = self.entry(self.map, record['passage_id'])
            block = record['data'].pop('referenceCorrection')
            self.assertEqual((old['ref'], record['ref']), (entry['captureRef'], entry['canonicalRef']))
            self.assertEqual({k: old.get(k) for k in ('kind', 'passage_id', 'subject_id', 'object_id', 'authority', 'decision')},
                             {k: record.get(k) for k in ('kind', 'passage_id', 'subject_id', 'object_id', 'authority', 'decision')})
            self.assertEqual(block['replacesPayloadSha256'], digest(encode(old['data'])))
            self.assertEqual(block['duplicateCopy'], record['passage_id'] != entry['primaryPassageId'])
            if record['kind'] == 'name_reading':
                self.assertEqual(record['data'], old['data'])
                self.assertTrue(block['resolvesSourceQualityWarning'])
            if record['kind'] == 'passage':
                self.assertEqual(record['data']['source'], old['data']['source'])
                self.assertEqual(record['data']['ref'], entry['canonicalRef'])
            if record['kind'] in ('source_identity', 'identity_assessment'):
                self.assertNotEqual(record['data']['sources'], old['data']['sources'])
                self.assertFalse(any('Sifrei%20Zuta%20' + entry['captureRef'].split(' ')[2].split(':')[0] in u or '_Zuta_' in u for u in record['data']['sources']))
                self.assertEqual({k: v for k, v in record['data'].items() if k != 'sources'}, {k: v for k, v in old['data'].items() if k != 'sources'})

    def test_letter_difference_is_recorded_not_applied(self):
        changes = self.expected()
        passage = next(r for r in changes['records'] if r['record_id'] == 'passage:' + PASSAGES['letterDuplicate'])
        difference = passage['data']['referenceCorrection']['contextDifferences']
        self.assertEqual([(d['field'], d['at'], d['captured'], d['current']) for d in difference], [('after', 208, 'ג', 'נ')])
        self.assertEqual(passage['data']['source']['after'][208], 'ג')

    def test_any_other_difference_is_refused(self):
        for mutate in (lambda c: c['records'][0]['data'].update(extra=True), lambda c: c['records'].pop(),
                       lambda c: next(r for r in c['records'] if r['kind'] == 'source_identity')['data'].update(personId='rabbi-akiva'),
                       lambda c: next(r for r in c['records'] if r['kind'] == 'passage').update(ref='Sifrei Zuta 11:31')):
            changes = self.expected()
            mutate(changes)
            self.rejects('differs from verified parent recomputation', changes)

    def test_map_must_follow_from_the_capture(self):
        main = PASSAGES['main']
        for change, message in ((lambda e: e.update(canonicalRef='Sifrei Zuta 11:31:3'), 'does not follow'),
                                (lambda e: e['current'].update(sourceUrl='https://www.sefaria.org/Sifrei%20Zuta%2012'), 'does not follow'),
                                (lambda e: e['legacy'].update(rawTextSha256='0' * 63), 'does not follow'),
                                (lambda e: e.update(sourceTextSha256='0' * 64), 'does not match the live passage'),
                                (lambda e: e.update(primaryPassageId=PASSAGES['duplicateWithIdentity']), 'disagree'),
                                (lambda e: e.update(copyRole='repeat'), 'disagree')):
            correction = copy.deepcopy(self.map)
            change(self.entry(correction, main))
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                self.expected(correction=correction)

    def test_letter_difference_must_match_the_stored_text(self):
        for change in (lambda d: d.update(captured='נ'), lambda d: d.update(at=209), lambda d: d.update(current='ג'),
                       lambda d: d.update(segmentCurrentRawTextSha256=d['segmentLegacyRawTextSha256'])):
            correction = copy.deepcopy(self.map)
            for passage_id in (PASSAGES['letterMain'], PASSAGES['letterDuplicate']):
                change(self.entry(correction, passage_id)['contextDifferences'][0])
            with self.assertRaisesRegex(ValueError, 'letter difference'):
                self.expected(correction=correction)

    def test_a_human_correction_is_never_rewritten(self):
        records = copy.deepcopy(self.records)
        next(r for r in records if r['kind'] == 'claim')['authority'] = 'user_correction'
        with self.assertRaisesRegex(ValueError, 'human correction'):
            self.expected(records=records)

    def test_a_record_cannot_be_corrected_twice(self):
        changes = self.expected()
        corrected = [dict({k: v for k, v in r.items() if k != 'replacesSha256'}) for r in changes['records']]
        with self.assertRaisesRegex(ValueError, 'already corrected|has no page label|does not match'):
            self.expected(records=corrected)

    def test_kinds_and_counts_stay(self):
        changes = self.expected()
        self.assertEqual(Counter(r['kind'] for r in changes['records']), Counter(r['kind'] for r in self.records))


if __name__ == '__main__':
    unittest.main()
