"""Keep bounded provider diagnostics; discard raw response bodies and headers."""
import json
import re
from datetime import timezone
from email.utils import parsedate_to_datetime


class ProviderError(RuntimeError):
    def __init__(self, diagnostic):
        self.diagnostic = diagnostic
        super().__init__('Provider request failed')


def sanitize(value, key, limit):
    if not isinstance(value, (str, int)) or isinstance(value, bool):
        return None
    text = str(value)
    if key:
        text = text.replace(key, '[redacted]')
    # Providers can echo credentials in a validation message. Never keep headers.
    text = re.sub(r'(?im)authorization\s*[:=][^\r\n]*', '[redacted header]', text)
    text = re.sub(r'(?i)bearer\s+[^\s,;]+', 'Bearer [redacted]', text)
    text = re.sub(r'\bsk-[A-Za-z0-9_-]+', '[redacted]', text)
    text = re.sub(r'(?i)(api[_ -]?key|access[_ -]?token|secret)["\']?\s*[:=]\s*["\']?[^\s,"\'};]+', r'\1=[redacted]', text)
    return ' '.join(text.split())[:limit]


KNOWN_PROVIDERS = {'Sail', 'Sail Research', 'OpenInference', 'Open Inference', 'Decart',
                   'sail-research', 'sail-research/fp4', 'open-inference', 'open-inference/fp4', 'decart', 'decart/fp4'}


def retry_after(headers):
    """Keep only a bounded duration or normalized HTTP date from the final response."""
    if not isinstance(headers, str) or len(headers) > 65536:
        return None
    blocks = re.split(r'\r?\n\r?\n', headers.strip())
    values = [line.split(':', 1)[1].strip() for line in blocks[-1].splitlines()
              if line.lower().startswith('retry-after:')]
    if len(values) != 1:
        return None
    value = values[0]
    if re.fullmatch(r'[0-9]{1,6}', value):
        return int(value) if int(value) <= 86400 else None
    if not re.fullmatch(r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} [A-Z][a-z]{2} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT', value):
        return None
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError, OverflowError):
        return None


def diagnostic(http_status, curl_code, body, key=None, headers=None):
    """Read only error.code/message; never expose raw body or metadata.raw."""
    result = {'httpStatus': http_status if type(http_status) is int and 100 <= http_status <= 599 else None,
              'curlCode': curl_code if type(curl_code) is int else None}
    try:
        parsed = json.loads(body)
    except (ValueError, TypeError):
        parsed = None
    error = parsed.get('error') if isinstance(parsed, dict) else None
    if isinstance(error, dict):
        result['providerErrorCode'] = sanitize(error.get('code'), key, 64)
        result['message'] = sanitize(error.get('message'), key, 500)
    else:
        result['providerErrorCode'] = None
        result['message'] = 'Provider returned no structured error message'
    metadata = error.get('metadata') if isinstance(error, dict) else None
    if isinstance(metadata, dict) and metadata.get('provider_name') in KNOWN_PROVIDERS:
        result['providerName'] = metadata['provider_name']
    delay = retry_after(headers)
    if delay is not None:
        result['retryAfter'] = delay
    return result


def parse_response(stdout, curl_code, key=None, headers=None):
    """Curl appends status; only a validated retry delay survives temporary headers."""
    body, separator, status = stdout.rpartition('\n')
    http_status = int(status) if separator and re.fullmatch(r'[0-9]{3}', status) else None
    if curl_code or http_status is None or not 200 <= http_status < 300:
        raise ProviderError(diagnostic(http_status, curl_code, body if separator else '', key, headers))
    try:
        parsed = json.loads(body)
    except ValueError:
        raise ProviderError({'httpStatus': http_status, 'curlCode': curl_code,
                             'providerErrorCode': None,
                             'message': 'Provider returned invalid JSON'}) from None
    if isinstance(parsed, dict) and 'error' in parsed:
        raise ProviderError(diagnostic(http_status, curl_code, body, key, headers))
    return parsed
