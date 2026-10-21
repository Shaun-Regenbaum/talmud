"""Price checks use a captured public endpoint and existing real source text."""
import copy
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'coverage'))
import queue_core as q

FIXTURES = Path(__file__).parent / 'fixtures'
ENDPOINT = json.loads((FIXTURES / 'text-pricing-endpoint.json').read_text())['endpoint']
JOBS = json.loads((FIXTURES / 'coverage-queue-jobs.json').read_text())


class TextPricing(unittest.TestCase):
    def setUp(self):
        self.config = dict(parameters=dict(model='google/gemini-2.5-flash-lite',
            max_tokens=16384, reasoning={'effort': 'low'}, response_format={'type': 'json_object'}, temperature=0),
            route=dict(provider='google-ai-studio', inputPrice=1e-7, outputPrice=4e-7),
            pricingApplicability=dict(version='gemini-text-only-v1', input='plain_text', tools=False,
                plugins=False, explicitCache=False, pricing=copy.deepcopy(ENDPOINT['pricing'])))
        self.adapter = type('SourceMessages', (), {'messages': staticmethod(lambda job:
            [{'role': 'user', 'content': json.dumps(job, ensure_ascii=False)}])})
        self.payload = q.payload_for(JOBS, self.adapter, self.config)

    def test_captured_endpoint_and_full_reservation(self):
        q.text_pricing_check(self.config, ENDPOINT['pricing'])
        self.assertGreater(q.reservation(self.payload, self.config), 16384 * 4e-7)

    def test_live_preflight(self):
        def request(url, key=None):
            if url.endswith('/key'):
                return {'data': dict(limit=100, limit_remaining=20, usage=80, limit_reset=None)}
            return {'data': {'endpoints': [ENDPOINT]}}
        self.assertEqual(q.preflight(self.config, 'not-a-credential', request)['usage'], 80)

    def test_unknown_changed_or_missing_fee(self):
        for field, value in [('future_fee', '0'), ('audio', '0.2'), ('prompt', 'NaN')]:
            with self.subTest(field=field):
                prices = copy.deepcopy(ENDPOINT['pricing']); prices[field] = value
                with self.assertRaises(ValueError): q.text_pricing_check(self.config, prices)
        del self.config['pricingApplicability']['pricing']['image']
        with self.assertRaises(ValueError): q.text_pricing_check(self.config)

    def test_unreserved_reasoning_cache_and_invalid_rates(self):
        for field, value in [('internal_reasoning', '.1'), ('input_cache_read', '.1'),
                             ('discount', 1), ('image', '-1'), ('audio', 'NaN'),
                             ('web_search', 'Infinity'), ('input_cache_write', True)]:
            with self.subTest(field=field):
                config = copy.deepcopy(self.config)
                config['pricingApplicability']['pricing'][field] = value
                with self.assertRaises(ValueError): q.text_pricing_check(config)

    def test_only_reviewed_model_route_and_policy(self):
        for part, key, value in [('parameters', 'model', 'google/gemini-2.5-flash-lite:online'),
                                 ('route', 'provider', 'google-ai-studio/flex'),
                                 ('pricingApplicability', 'explicitCache', True),
                                 ('pricingApplicability', 'plugins', True)]:
            with self.subTest(key=key):
                config = copy.deepcopy(self.config); config[part][key] = value
                with self.assertRaises(ValueError): q.text_pricing_check(config)

    def test_forbidden_payload_features(self):
        for field, value in [('tools', []), ('plugins', []), ('cache_control', {}),
                             ('messages', [{'role': 'user', 'content': [{'type': 'text', 'text': 'x'}]}]),
                             ('messages', []), ('provider', {'only': ['other']}),
                             ('model', self.config['parameters']['model'] + ':online')]:
            with self.subTest(field=field):
                payload = copy.deepcopy(self.payload); payload[field] = value
                with self.assertRaises(ValueError): q.reservation(payload, self.config)

    def test_old_policy_still_rejects_nonzero_other_fees(self):
        del self.config['pricingApplicability']
        def request(url, key=None):
            return ({'data': dict(limit=100, limit_remaining=20, usage=80, limit_reset=None)}
                    if url.endswith('/key') else {'data': {'endpoints': [ENDPOINT]}})
        with self.assertRaises(RuntimeError): q.preflight(self.config, None, request)

if __name__ == '__main__': unittest.main()
