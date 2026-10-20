"""Real captured paired controls; structural checks do not certify interpretation."""
import copy
import gzip
import json
from collections import Counter
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from compact_source_v2 import validate as v2
from compact_source_v3 import validate as v3
from compact_source_v3.prepare_pair import REGRESSIONS, TARGETED, select
from compact_source_v3.request import build_request

CAPTURE = json.loads(gzip.decompress((Path(__file__).parent/'fixtures/paired-source-v3-real.json.gz').read_bytes()))


class CompactSourceV3Tests(unittest.TestCase):
    def test_schema_validator_and_request_implementation_unchanged(self):
        for name in ('contract.py', 'validate.py', 'request.py', '__init__.py'):
            self.assertEqual((ROOT/'compact_source_v2'/name).read_bytes(),
                             (ROOT/'compact_source_v3'/name).read_bytes())
        self.assertEqual(v2.SCHEMA, v3.SCHEMA)
        self.assertNotEqual(v2.recipe_binding()['sha256'], v3.recipe_binding()['sha256'])

    def test_new_request_binds_instructions_without_changing_schema(self):
        old = (ROOT/'compact_source_v2/reader.md').read_text()
        guide = (ROOT/'compact_source_v3/reader.md').read_text()
        self.assertNotEqual(guide, old)
        self.assertIn('EVERY mention', guide)
        self.assertIn('Opposite views listed side by side', guide)
        self.assertIn('do not need separate person nodes', guide)
        request = build_request(CAPTURE['cases'][0]['job'])
        body = json.loads(request['messages'][0]['content'])
        self.assertEqual(body['instructions'], guide)
        self.assertEqual(request['recipe'], v3.recipe_binding())
        self.assertEqual(body['schema'], v2.SCHEMA)

    def test_selection_replays_from_136_result_snapshot(self):
        manifest = CAPTURE['manifest']
        self.assertEqual(len(manifest['eligibleSnapshot']), 136)
        self.assertEqual(select(manifest['eligibleSnapshot']), manifest['selected'])
        self.assertEqual(select(list(reversed(manifest['eligibleSnapshot']))), manifest['selected'])
        self.assertEqual(len({r['jobId'] for r in manifest['selected']}), 30)
        controls = [r for r in manifest['selected'] if r['selection'] == 'independent_control']
        self.assertEqual(Counter(r['stratum'] for r in controls), {'valid': 8, 'validation_failed': 8, 'truncated': 7})
        self.assertEqual(set(REGRESSIONS), set(TARGETED))

    def test_every_selected_source_is_exact_and_bound(self):
        manifest = CAPTURE['manifest']
        self.assertEqual(v3.digest(CAPTURE['cases']), manifest['casesSha256'])
        for case, selected in zip(CAPTURE['cases'], manifest['selected']):
            job = case['job']
            self.assertEqual(job['job_id'], selected['jobId'])
            self.assertEqual(v3.digest(job), selected['jobHash'])
            v3.check_job(job)
            for source in job['sources']:
                self.assertEqual(v3.sha(source['text']), source['sha256'])

    def test_valid_baselines_remain_structurally_valid_but_get_new_recipe_binding(self):
        count = 0
        for case, selected in zip(CAPTURE['cases'], CAPTURE['manifest']['selected']):
            if selected['stratum'] != 'valid':
                continue
            count += 1
            old = v2.check(case['job'], case['baselineAnswer'])
            new = v3.check(case['job'], case['baselineAnswer'])
            self.assertEqual(old['record'], new['record'])
            self.assertEqual(new['answer'], case['baselineAnswer'])
            self.assertNotEqual(old['recipe'], new['recipe'])
            with self.assertRaises(ValueError):
                v3.check_saved(case['job'], old)
        self.assertEqual(count, 15)

    def test_changed_real_name_quote_still_fails(self):
        case = next(c for c in CAPTURE['cases'] if c['job']['job_id'] == 'v18-bavli-005')
        answer = copy.deepcopy(case['baselineAnswer'])
        answer['people'][0]['mentions'][0]['quote'] += ' deliberately absent evidence'
        with self.assertRaises(ValueError):
            v3.check(case['job'], answer)


if __name__ == '__main__':
    unittest.main()
