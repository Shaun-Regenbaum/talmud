"""Budget and source checks using captured source and provider records."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'coverage'))
from sample_runner import digest, reservation, select_route, validate_bundle, request


class CoverageSampleTests(unittest.TestCase):
    def setUp(self):
        captured = json.loads((ROOT / 'tests/fixtures/identity-proposal.json').read_text())['case']
        self.job = {'job_id': captured['id'], 'focal_ref': captured['ref'], 'sources': [
            {'source_id': location, 'ref': captured['ref'], 'text': text,
             'sha256': hashlib.sha256(text.encode()).hexdigest()}
            for location, text in captured['source'].items()]}
        self.bundle = {'runId': 'source-check', 'jobs': [self.job], 'jobsSha256': digest([self.job])}
        self.endpoints = json.loads((ROOT / 'tests/fixtures/coverage-provider-prices.json').read_text())['endpoints']

    def test_captured_source_is_valid(self):
        validate_bundle(self.bundle)

    def test_changed_source_rejected_even_with_new_bundle_hash(self):
        self.bundle['jobs'][0]['sources'][0]['text'] += ' '
        self.bundle['jobsSha256'] = digest(self.bundle['jobs'])
        with self.assertRaisesRegex(ValueError, 'Source hash differs'):
            validate_bundle(self.bundle)

    def test_duplicate_jobs_rejected(self):
        self.bundle['jobs'].append(copy.deepcopy(self.job))
        self.bundle['jobsSha256'] = digest(self.bundle['jobs'])
        with self.assertRaisesRegex(ValueError, 'Duplicate job'):
            validate_bundle(self.bundle)

    def test_wrong_bundle_hash_rejected(self):
        self.bundle['jobsSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'bundle hash differs'):
            validate_bundle(self.bundle)

    def test_cheapest_captured_route(self):
        route = select_route(self.endpoints)
        self.assertTrue(route['provider'].startswith('sail-research/'))
        self.assertGreater(reservation(self.job, 'Source reading', {}, route), 0)

    def test_nonfinite_or_negative_price_rejected(self):
        for price in ['NaN', 'Infinity', '-1']:
            endpoint = copy.deepcopy(next(e for e in self.endpoints if e['tag'].startswith('sail-research/')))
            self.assertEqual(select_route([endpoint])['provider'], endpoint['tag'])
            endpoint['pricing']['prompt'] = price
            with self.subTest(price=price), self.assertRaisesRegex(RuntimeError, 'No priced'):
                select_route([endpoint])

    def test_extra_charge_rejected(self):
        endpoint = copy.deepcopy(next(e for e in self.endpoints if e['tag'].startswith('sail-research/')))
        self.assertEqual(select_route([endpoint])['provider'], endpoint['tag'])
        endpoint['pricing']['request'] = '0.1'
        with self.assertRaisesRegex(RuntimeError, 'No priced'):
            select_route([endpoint])

    def test_nonfinite_reservation_rejected(self):
        route = select_route(self.endpoints)
        route['inputPrice'] = float('nan')
        with self.assertRaisesRegex(ValueError, 'Invalid reservation'):
            reservation(self.job, 'Source reading', {}, route)

    def test_curl_preserves_captured_hebrew_source(self):
        received = []

        class Capture(BaseHTTPRequestHandler):
            def do_POST(self):
                received.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{}')

            def log_message(self, *args):
                pass

        server = HTTPServer(('127.0.0.1', 0), Capture)
        server.timeout = 5
        thread = threading.Thread(target=server.handle_request)
        thread.start()
        try:
            request(f'http://127.0.0.1:{server.server_port}', payload=self.bundle)
            self.assertEqual(received, [self.bundle])
        finally:
            thread.join(timeout=6)
            server.server_close()


if __name__ == '__main__':
    unittest.main()
