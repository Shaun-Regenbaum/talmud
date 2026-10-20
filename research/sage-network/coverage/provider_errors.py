"""Keep bounded provider diagnostics without retaining response bodies or headers."""
import json
import re


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


def diagnostic(http_status, curl_code, body, key=None):
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
    return result


def parse_response(stdout, curl_code, key=None):
    """Curl appends the status after the body; no response headers are captured."""
    body, separator, status = stdout.rpartition('\n')
    http_status = int(status) if separator and re.fullmatch(r'[0-9]{3}', status) else None
    if curl_code or http_status is None or not 200 <= http_status < 300:
        raise ProviderError(diagnostic(http_status, curl_code, body if separator else '', key))
    try:
        parsed = json.loads(body)
    except ValueError:
        raise ProviderError({'httpStatus': http_status, 'curlCode': curl_code,
                             'providerErrorCode': None,
                             'message': 'Provider returned invalid JSON'}) from None
    if isinstance(parsed, dict) and 'error' in parsed:
        raise ProviderError(diagnostic(http_status, curl_code, body, key))
    return parsed
