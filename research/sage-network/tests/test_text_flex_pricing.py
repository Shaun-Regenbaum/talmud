"""A captured flex endpoint keeps its displayed rates, without another discount."""
import copy
import json
from pathlib import Path
import unittest
import test_text_pricing as previous
q = previous.q

ENDPOINT = json.loads((Path(__file__).parent / 'fixtures/text-flex-pricing-endpoint.json').read_text())['endpoint']

class TextFlexPricing(unittest.TestCase):
    def setUp(self):
        prior = previous.TextPricing(); prior.setUp()
        self.config, self.adapter = copy.deepcopy(prior.config), prior.adapter
        self.config['parameters']['model'] = 'google/gemini-3.8-flash'
        self.config['route'] = dict(provider='google-ai-studio/flex', inputPrice=3.75e-7, outputPrice=1.875e-6)
        self.config['pricingApplicability'].update(version='gemini38-flex-text-only-v1', pricing=copy.deepcopy(ENDPOINT['pricing']))
        self.payload = q.payload_for({'sources': []}, self.adapter, self.config)

    def request(self, endpoint):
        def call(url, key=None):
            return ({'data': dict(limit=100, limit_remaining=20, usage=80, limit_reset=None)}
                    if url.endswith('/key') else {'data': {'endpoints': [endpoint]}})
        return call

    def test_flex_rates_are_not_discounted_again(self):
        q.preflight(self.config, None, self.request(ENDPOINT))
        expected = (len(q.canonical(self.payload['messages']).encode()) + 4096) * 3.75e-7 + 16384 * 1.875e-6
        self.assertEqual(q.reservation(self.payload, self.config), expected)
        self.assertEqual(self.payload['provider']['max_price']['completion'], 1.875)
        self.assertEqual(self.payload['provider']['only'], ['google-ai-studio/flex'])
        self.assertFalse(self.payload['provider']['allow_fallbacks'])

    def test_tier_and_model_must_match_live_endpoint(self):
        for key, value in [('service_tier', None), ('service_tier', 'default'), ('model_id', 'other')]:
            endpoint = copy.deepcopy(ENDPOINT); endpoint[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(RuntimeError):
                q.preflight(self.config, None, self.request(endpoint))

    def test_discount_and_rates_are_exact(self):
        for key, value in [('discount', 0), ('discount', .25), ('prompt', '0.0000001875'), ('completion', '0.0000009375')]:
            config = copy.deepcopy(self.config); config['pricingApplicability']['pricing'][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): q.text_pricing_check(config)

    def test_old_version_cannot_opt_in_to_new_route(self):
        self.config['pricingApplicability']['version'] = 'gemini-text-only-v1'
        with self.assertRaises(ValueError): q.text_pricing_check(self.config)

    def test_new_policy_still_rejects_extra_fees_and_search(self):
        self.config['pricingApplicability']['pricing']['new_fee'] = 0
        with self.assertRaises(ValueError): q.text_pricing_check(self.config)
        del self.config['pricingApplicability']['pricing']['new_fee']
        self.payload['plugins'] = [{'id': 'web'}]
        with self.assertRaises(ValueError): q.reservation(self.payload, self.config)

if __name__ == '__main__': unittest.main()
