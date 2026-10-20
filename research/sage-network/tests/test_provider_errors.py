"""Use a captured public API error and explicitly corrupted copies for redaction."""
import json
from pathlib import Path
import secrets
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'coverage'))
from provider_errors import ProviderError, diagnostic, parse_response
from queue_core import read_one

# Actual unauthenticated GET, captured 2026-10-20. No completion request or charge:
# https://openrouter.ai/api/v1/models/nonexistent-model-for-transport-check/endpoints
CAPTURED_BODY = '{"error":{"message":"Not Found","code":404}}'
CAPTURED_WIRE = CAPTURED_BODY + '\n404'


class ProviderErrorTests(unittest.TestCase):
    def test_captured_http_error_keeps_only_safe_fields(self):
        with self.assertRaises(ProviderError) as caught:
            parse_response(CAPTURED_WIRE, 0)
        self.assertEqual(caught.exception.diagnostic,
                         dict(httpStatus=404, curlCode=0, providerErrorCode='404', message='Not Found'))
        self.assertNotIn(CAPTURED_BODY, str(caught.exception))

    def test_error_object_cannot_escape_redaction_with_success_status(self):
        with self.assertRaises(ProviderError) as caught:
            parse_response(CAPTURED_BODY + '\n200', 0)
        self.assertEqual(caught.exception.diagnostic['httpStatus'], 200)
        self.assertEqual(caught.exception.diagnostic['providerErrorCode'], '404')

    def test_redaction_precedes_truncation_and_ignores_raw_metadata(self):
        key = secrets.token_hex(24)  # Disposable test token, never an API credential.
        damaged = json.loads(CAPTURED_BODY)
        damaged['error']['message'] = 'Authorization: Bearer ' + key + '\n' + 'x'*800 + key
        damaged['error']['metadata'] = {'raw': key, 'request': {'Authorization': key}}
        safe = diagnostic(404, 0, json.dumps(damaged), key)
        self.assertNotIn(key, json.dumps(safe))
        self.assertNotIn('Authorization', json.dumps(safe))
        self.assertLessEqual(len(safe['message']), 500)
        self.assertNotIn('metadata', safe)

    def test_other_token_and_header_spellings_are_redacted(self):
        key = secrets.token_hex(24)
        for value in ('Bearer '+key, 'sk-'+key, 'api_key='+key, '"access_token":"'+key+'"'):
            damaged = json.loads(CAPTURED_BODY)
            damaged['error']['message'] = value
            self.assertNotIn(key, json.dumps(diagnostic(404, 0, json.dumps(damaged))))

    def test_body_or_status_damage_does_not_log_raw_body(self):
        for wire, code in [(CAPTURED_WIRE, 28), (CAPTURED_BODY, 0), ('not-json\n502', 0)]:
            with self.assertRaises(ProviderError) as caught:
                parse_response(wire, code)
            self.assertEqual(caught.exception.diagnostic['curlCode'], code)
            self.assertNotIn('not-json', str(caught.exception.diagnostic))
        with self.assertRaises(ProviderError) as caught:
            parse_response('not-json\n200', 0)
        self.assertEqual(caught.exception.diagnostic['message'], 'Provider returned invalid JSON')

    def test_failed_read_keeps_unknown_cost_and_never_retries(self):
        # Feed the actual captured error through the existing read_one boundary.
        job = json.loads((ROOT/'tests/fixtures/compact-source-real.json').read_text())['cases'][0]['job']
        calls = []
        def replay(url, key, payload):
            calls.append(url)
            return parse_response(CAPTURED_WIRE, 0, key)
        result = read_one(job, {}, None, 'frozen-test-config', None, replay)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result['status'], 'failed')
        self.assertIsNone(result['costUsd'])
        self.assertEqual(result['providerDiagnostic']['httpStatus'], 404)
        self.assertNotIn('response', result)


if __name__ == '__main__':
    unittest.main()


class SafeProviderMetadataTests(unittest.TestCase):
    def test_allowlisted_name_and_retry_delay(self):
        from provider_errors import diagnostic
        body=json.dumps({'error':{'code':429,'message':'Provider returned error','metadata':{'provider_name':'OpenInference','raw':'secret upstream body'}}})
        result=diagnostic(429,0,body,headers='HTTP/2 429\r\nRetry-After: 30\r\nAuthorization: secret\r\n\r\n')
        self.assertEqual(result['providerName'],'OpenInference');self.assertEqual(result['retryAfter'],30)
        self.assertNotIn('secret',json.dumps(result))

    def test_unknown_metadata_and_header_credentials_are_dropped(self):
        from provider_errors import diagnostic
        body=json.dumps({'error':{'metadata':{'provider_name':'Bearer secret','code':'secret'}}})
        result=diagnostic(429,0,body,headers='HTTP/2 429\r\nRetry-After: Bearer secret\r\n\r\n')
        self.assertNotIn('providerName',result);self.assertNotIn('retryAfter',result)
        self.assertNotIn('secret',json.dumps(result))

    def test_retry_date_and_duplicate_and_limits(self):
        from provider_errors import retry_after
        self.assertEqual(retry_after('HTTP/2 429\nRetry-After: Tue, 20 Oct 2026 12:30:00 GMT\n\n'),'2026-10-20T12:30:00+00:00')
        for value in ('999999','30\nRetry-After: 50','sk-secret','Tue, 99 Oct 2026 12:30:00 GMT'):
            self.assertIsNone(retry_after('HTTP/2 429\nRetry-After: '+value+'\n\n'))
