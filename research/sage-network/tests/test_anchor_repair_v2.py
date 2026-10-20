"""Offline boundary repairs on unchanged captured v7 responses and corruption tests."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from anchor_repair_v2 import amend
from compact_source_v2.validate import Invalid, digest, sha

CASES = json.loads((ROOT/'tests/fixtures/anchor-prefix-v2-real.json').read_text())['cases']


class PrefixV2Tests(unittest.TestCase):
    def test_real_v7_dialogue_repairs_one_prefix_and_keeps_semantics(self):
        case = copy.deepcopy(CASES[2]); before = copy.deepcopy(case['reading'])
        result = amend(case['job'], case['reading'])
        self.assertEqual(case['reading'], before)
        self.assertEqual(result['original'], before)
        self.assertEqual(result['amended']['relationships'], before['relationships'])
        self.assertEqual(len(result['receipt']['changes']), 1)
        self.assertEqual(result['receipt']['changes'][0]['amended']['quote'], "ור' יהושע")
        self.assertEqual(result['receipt']['originalAnswerSha256'], digest(before))
        self.assertEqual(result['compiled']['record']['relationships'][0]['category'], 'debate')

    def test_abbreviation_is_exact_and_generic_repair_is_separate(self):
        case = copy.deepcopy(CASES[0])
        with self.assertRaisesRegex(Invalid, 'prefix_repair_ineligible'):
            amend(case['job'], case['reading'])
        # For this positive test only, replace the separately ineligible generic
        # quote with its exact existing source span. The helper cannot do this.
        case['reading']['people'][4]['mentions'][0]['quote'] = 'דלית ליה היכירא'
        result = amend(case['job'], case['reading'])
        self.assertEqual([x['amended']['quote'] for x in result['receipt']['changes']], ['דר"ע', "דר' יוסי"])
        self.assertEqual(result['amended']['people'][4], case['reading']['people'][4])

    def test_title_spelling_is_never_rewritten(self):
        case = CASES[1]
        with self.assertRaisesRegex(Invalid, 'anchor_quote'):
            amend(case['job'], case['reading'])

    def test_repeated_original_quote_is_ambiguous_even_with_occurrence(self):
        case = copy.deepcopy(CASES[2])
        source = case['job']['sources'][0]
        source['text'] += " ור' יהושע"
        source['sha256'] = sha(source['text'].encode())
        with self.assertRaisesRegex(Invalid, 'prefix_repair_ineligible'):
            amend(case['job'], case['reading'])

    def test_two_attached_prefixes_are_not_repaired(self):
        case = copy.deepcopy(CASES[2]); source = case['job']['sources'][0]
        source['text'] = source['text'].replace("ור' יהושע", "ולר' יהושע")
        source['sha256'] = sha(source['text'].encode())
        with self.assertRaisesRegex(Invalid, 'prefix_repair_ineligible'):
            amend(case['job'], case['reading'])

    def test_nonperson_and_unnamed_are_ineligible(self):
        for field, value in [('kind', 'group'), ('form', 'unnamed')]:
            case = copy.deepcopy(CASES[2]); case['reading']['people'][1][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(Invalid, 'prefix_repair_ineligible'):
                amend(case['job'], case['reading'])

    def test_bad_relationship_is_not_hidden_by_anchor_repair(self):
        case = copy.deepcopy(CASES[2]); case['reading']['relationships'][0]['object'] = 'p999'
        with self.assertRaisesRegex(Invalid, 'person_reference'):
            amend(case['job'], case['reading'])

    def test_source_hash_or_occurrence_corruption_is_not_repaired(self):
        case = copy.deepcopy(CASES[2]); case['job']['sources'][0]['text'] += ' '
        with self.assertRaisesRegex(Invalid, 'source_hash'):
            amend(case['job'], case['reading'])
        case = copy.deepcopy(CASES[2]); case['reading']['people'][1]['mentions'][0]['occurrence'] = 99
        with self.assertRaisesRegex(Invalid, 'anchor_quote'):
            amend(case['job'], case['reading'])

    def test_already_repaired_answer_has_empty_receipt(self):
        case = CASES[2]; first = amend(case['job'], case['reading'])
        second = amend(case['job'], first['amended'])
        self.assertEqual(second['receipt']['changes'], [])
        self.assertEqual(second['amended'], first['amended'])


if __name__ == '__main__':
    unittest.main()
