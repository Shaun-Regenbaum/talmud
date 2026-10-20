"""Prefix amendments on real captured passages and deliberately damaged readings."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from anchor_repair import amend
from compact_source.validate import Invalid, check, digest

CASES = json.loads((ROOT/'tests/fixtures/compact-source-real.json').read_text())['cases']


class AnchorRepairTests(unittest.TestCase):
    def setUp(self):
        self.job = copy.deepcopy(CASES[2]['job'])
        self.answer = copy.deepcopy(CASES[2]['reading'])
        self.person = next(p for p in self.answer['people'] if p['label'] == "ר' יהושע")
        self.anchor = self.person['mentions'][0]
        self.anchor['quote'] = "ר' יהושע"

    def test_actual_attached_prefix_is_preserved_without_identity_changes(self):
        before = copy.deepcopy(self.answer)
        with self.assertRaises(Invalid):
            check(self.job, self.answer)
        result = amend(self.job, self.answer)
        self.assertEqual(self.answer, before)
        self.assertEqual(result['original'], before)
        self.assertEqual(result['compiled']['record'], result['amended'])
        change = result['receipt']['changes'][0]
        self.assertEqual(change['amended']['quote'], "ור' יהושע")
        self.assertEqual(change['originalStart'] - 1, change['amendedStart'])
        self.assertEqual(result['amended']['relationships'], before['relationships'])
        self.assertEqual(result['receipt']['originalAnswerSha256'], digest(before))
        self.assertEqual(len(result['receipt']['changes']), 1)

    def test_already_valid_reading_is_unchanged(self):
        answer = CASES[2]['reading']
        result = amend(self.job, answer)
        self.assertEqual(result['amended'], answer)
        self.assertEqual(result['receipt']['changes'], [])

    def test_generic_person_cannot_use_titled_name_repair(self):
        self.person['form'] = 'unnamed'
        with self.assertRaisesRegex(Invalid, 'prefix_repair_ineligible'):
            amend(self.job, self.answer)

    def test_unrelated_invalid_claim_is_not_accepted_after_repair(self):
        self.answer['relationships'][0]['object'] = 'p999'
        with self.assertRaisesRegex(Invalid, 'person_reference'):
            amend(self.job, self.answer)

    def test_wrong_occurrence_and_source_are_not_repaired(self):
        for field, value in [('occurrence', 999), ('source_id', 'missing-source')]:
            answer = copy.deepcopy(self.answer)
            next(p for p in answer['people'] if p['id'] == self.person['id'])['mentions'][0][field] = value
            with self.assertRaises(Invalid):
                amend(self.job, answer)

    def test_real_word_fragments_and_abbreviations_stay_rejected(self):
        for fragment in ('מר', 'מי'):
            case = copy.deepcopy(CASES[0])
            case['reading']['people'][0]['mentions'] = [
                dict(source_id='s2', quote=fragment, occurrence=1)]
            with self.assertRaisesRegex(Invalid, 'prefix_repair_ineligible'):
                amend(case['job'], case['reading'])
        case = copy.deepcopy(CASES[0])
        case['reading']['people'][3]['mentions'][0]['quote'] = 'ר"ע'
        with self.assertRaisesRegex(Invalid, 'prefix_repair_ineligible'):
            amend(case['job'], case['reading'])

    def test_source_tampering_is_rejected_before_amendment(self):
        self.job['sources'][0]['text'] += ' '
        with self.assertRaisesRegex(Invalid, 'source_hash'):
            amend(self.job, self.answer)

    def test_bare_name_fragment_is_not_repaired(self):
        # This real passage contains a full title, not a bare name permission.
        self.anchor['quote'] = 'יהוש'
        with self.assertRaisesRegex(Invalid, 'prefix_repair_ineligible'):
            amend(self.job, self.answer)


if __name__ == '__main__':
    unittest.main()
