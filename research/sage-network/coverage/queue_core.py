"""One durable spending ledger for a frozen queue of source-reading proposals."""
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import threading
import tempfile
import time

from provider_errors import ProviderError, parse_response

API = 'https://openrouter.ai/api/v1/'
KEY_CAP = 100.0
MAX_RUN_CAP = 50.0
MAX_LINE = 8 * 1024 * 1024
SUCCESS = {'complete', 'needs_context'}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def file_hash(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + '.part')
    with pending.open('w') as stream:
        stream.write(canonical(value) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    pending.replace(path)


def utc():
    return datetime.now(timezone.utc).isoformat()


def money(value):
    return type(value) in (float, int) and math.isfinite(value) and value >= 0


def load(path):
    return json.loads(path.read_text())


def safe_id(value):
    if not isinstance(value, str) or not re.fullmatch('[A-Za-z0-9_-]+', value):
        raise ValueError('Invalid path identifier')
    return value


class Transport:
    """Bound wall time and response bytes, and reap all outstanding curl children."""
    def __init__(self, timeout_seconds=360):
        self.timeout_seconds = timeout_seconds
        self.children = set()
        self.lock = threading.Lock()
        self.closed = False

    def close(self):
        with self.lock:
            self.closed = True
            for child in list(self.children):
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def __call__(self, url, key=None, body=None):
        config = 'url = ' + json.dumps(url) + '\n'
        if key:
            config += 'header = ' + json.dumps('Authorization: Bearer ' + key) + '\n'
        if body is not None:
            config += 'header = "Content-Type: application/json"\nrequest = "POST"\ndata = ' + json.dumps(canonical(body), ensure_ascii=False) + '\n'
        headers = tempfile.TemporaryFile(mode='w+b')
        with self.lock:
            if self.closed:
                headers.close()
                raise RuntimeError('Transport stopped')
            child = subprocess.Popen(['curl', '--silent', '--show-error', '--write-out', '\n%{http_code}',
                '--connect-timeout', '10', '--max-time', str(self.timeout_seconds), '--max-filesize', '16777216',
                '--dump-header', '/dev/fd/' + str(headers.fileno()), '--config', '-'], pass_fds=(headers.fileno(),), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, start_new_session=True)
            self.children.add(child)
        try:
            try:
                stdout, _ = child.communicate(config, timeout=self.timeout_seconds + 10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.communicate()
                raise TimeoutError('Provider wall deadline exceeded') from None
            headers.seek(0)
            safe_headers = headers.read(65537).decode('ascii', errors='replace')
            return parse_response(stdout, child.returncode, key, safe_headers)
        finally:
            headers.close()
            with self.lock:
                self.children.discard(child)


def recipe_files(directory):
    # Includes prompts, schemas and validator imports, not just the entry point.
    return {str(p.relative_to(directory)): file_hash(p) for p in sorted(directory.rglob('*'))
            if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}


def recipe_adapter(directory):
    path = directory / 'queue_adapter.py'
    # The recipe is mounted as a unique package, so existing pilot imports stay untouched.
    namespace = 'coverage_queue_recipe_' + digest(recipe_files(directory))[:20]
    spec = importlib.util.spec_from_file_location(namespace, path,
                                                submodule_search_locations=[str(directory)])
    module = importlib.util.module_from_spec(spec)
    import sys
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def jobs(directory, manifest):
    seen = set()
    count = 0
    for shard in manifest['shards']:
        name = shard['file']
        if Path(name).name != name or not name.endswith('.jsonl'):
            raise ValueError('Unsafe shard path')
        path = directory / 'shards' / name
        if file_hash(path) != shard['sha256']:
            raise ValueError('Frozen shard hash differs: ' + name)
        shard_count = 0
        with path.open() as stream:
            while line := stream.readline(MAX_LINE + 1):
                if len(line.encode()) > MAX_LINE:
                    raise ValueError('Oversized input line')
                job = json.loads(line)
                jid = safe_id(job['job_id'])
                if jid in seen:
                    raise ValueError('Duplicate job: ' + jid)
                seen.add(jid)
                if not job.get('sources'):
                    raise ValueError('Missing source text')
                for source in job['sources']:
                    if hashlib.sha256(source['text'].encode()).hexdigest() != source['sha256']:
                        raise ValueError('Source hash differs: ' + jid)
                shard_count += 1
                count += 1
                yield job
        if shard_count != shard['jobs']:
            raise ValueError('Shard count differs')
    if count != manifest['jobs']:
        raise ValueError('Queue count differs')


def config_check(config, manifest, recipe, concurrency):
    safe_id(config['runId'])
    deadline = config.get('requestTimeoutSeconds', 360)
    if type(deadline) is not int or not 30 <= deadline <= 360:
        raise ValueError('Request timeout must be explicitly bounded to 30–360 seconds')
    if not money(config.get('budgetUsd')) or not 0 < config['budgetUsd'] <= MAX_RUN_CAP:
        raise ValueError('Explicit run budget must be within 50 USD')
    if not money(config.get('carriedUnknownReservedUsd', 0)):
        raise ValueError('Invalid carried unknown reservation')
    if config.get('inputManifestHash') != digest(manifest):
        raise ValueError('Input manifest differs')
    if config.get('recipeFiles') != recipe_files(recipe):
        raise ValueError('Frozen recipe files differ')
    if config.get('providerErrorsHash') != file_hash(Path(__file__).with_name('provider_errors.py')):
        raise ValueError('Frozen provider diagnostics code differs')
    if config.get('runnerHash') != file_hash(Path(__file__)):
        raise ValueError('Frozen queue code differs')
    if type(concurrency) is not int or not 1 <= concurrency <= 128:
        raise ValueError('Invalid concurrency')
    approved = config.get('approvedConcurrency', 16)
    if type(approved) is not int or approved not in {*range(1, 17), 64, 128} or concurrency > approved:
        raise ValueError('Concurrency not approved')
    if approved > 16:
        approval = config.get('qualityApproval', {})
        if (approval.get('approvedConcurrency') != approved or not approval.get('approvedBy') or
                not re.fullmatch('[0-9a-f]{64}', approval.get('sampleSha256', ''))):
            raise ValueError('Higher concurrency requires a frozen quality approval')
    if config.get('qualityTrial') is not None:
        if (config['qualityTrial'] != 'source-readings-210-v1' or manifest['jobs'] != 210 or
                not isinstance(config.get('priorRun'), dict) or 'carriedUnknownReservedUsd' not in config or
                config.get('executionMode') != 'full' or approved > 16 or config['budgetUsd'] > 5 or
                config.get('qualityBridgeHash') != file_hash(Path(__file__).with_name('quality_bridge.py'))):
            raise ValueError('Invalid bounded source-reading quality trial')
    if config.get('providerRecovery') is not None and config.get('comparisonTrial') is None:
        raise ValueError('Provider recovery requires the shared comparison budget')
    if config.get('comparisonTrial') is not None:
        from matched_transition import bounds
        bounds(config, manifest)
    params = config['parameters']
    if (type(params.get('max_tokens')) is not int or not 1 <= params['max_tokens'] <= 32768 or
            not params.get('model') or not isinstance(params.get('reasoning'), dict)):
        raise ValueError('Invalid frozen model parameters')
    if set(params) != {'model', 'max_tokens', 'reasoning', 'response_format', 'temperature'}:
        raise ValueError('Unknown frozen model parameters')
    if params['response_format'] != {'type': 'json_object'} or params['temperature'] != 0:
        raise ValueError('Unexpected response parameters')
    route = config['route']
    if (not isinstance(route.get('provider'), str) or not route['provider'] or
            not money(route.get('inputPrice')) or not money(route.get('outputPrice'))):
        raise ValueError('Invalid frozen route prices')


def preflight(config, key, request):
    info = request(API + 'key', key)['data']
    if (not money(info.get('limit')) or not 0 < info['limit'] <= KEY_CAP or info.get('limit_reset') or
            not money(info.get('limit_remaining')) or not money(info.get('usage'))):
        raise RuntimeError('Expected existing non-resetting capped key with readable balance')
    endpoints = request(API + 'models/' + config['parameters']['model'] + '/endpoints')['data']['endpoints']
    route = config['route']
    matches = [r for r in endpoints if r.get('tag') == route['provider'] and r.get('status') == 0]
    if len(matches) != 1:
        raise RuntimeError('Frozen provider unavailable')
    endpoint = matches[0]
    pricing = endpoint['pricing']
    if (pricing.get('overrides') or float(pricing['prompt']) != route['inputPrice'] or
            float(pricing['completion']) != route['outputPrice'] or
            any(float(v) != 0 for k, v in pricing.items() if k not in {'prompt', 'completion', 'input_cache_read', 'discount', 'overrides'}) or
            not {'max_tokens', 'reasoning', 'response_format', 'temperature'} <= set(endpoint.get('supported_parameters', [])) or
            endpoint.get('max_completion_tokens', 0) < config['parameters']['max_tokens']):
        raise RuntimeError('Frozen provider pricing or capabilities changed')
    return info


def payload_for(job, adapter, config):
    messages = adapter.messages(job)
    if (not isinstance(messages, list) or not messages or
            any(set(m) != {'role', 'content'} or m['role'] not in {'system', 'user'} or
                not isinstance(m['content'], str) for m in messages)):
        raise ValueError('Recipe must return explicit text messages')
    route = config['route']
    return dict(config['parameters'], messages=messages,
                provider={'only': [route['provider']], 'allow_fallbacks': False,
                          'require_parameters': True, 'max_price': {
                              'prompt': route['inputPrice'] * 1e6,
                              'completion': route['outputPrice'] * 1e6}})


def reservation(payload, config):
    # Bytes plus protocol overhead conservatively bound text tokens; reserve full output.
    value = ((len(canonical(payload['messages']).encode()) + 4096) * config['route']['inputPrice'] +
             payload['max_tokens'] * config['route']['outputPrice'])
    if not money(value):
        raise ValueError('Invalid reservation')
    return value


def validate_answer(adapter, job, answer):
    compiled = adapter.validate(job, answer)
    status = adapter.status(answer)
    if status not in SUCCESS:
        raise ValueError('Unsupported validated coverage status')
    return compiled, status


def read_one(job, payload, adapter, config_hash, key, request):
    result = dict(jobId=job['job_id'], jobHash=digest(job), manifestHash=config_hash,
                  status='failed', costUsd=None, errorKind=None)
    try:
        raw = request(API + 'chat/completions', key, payload)
    except Exception as error:
        result.update(errorKind='provider', error=type(error).__name__)
        if isinstance(error, ProviderError):
            result['providerDiagnostic'] = error.diagnostic
    else:
        result['response'] = raw
        try:
            cost = raw.get('usage', {}).get('cost')
            if money(cost):
                result['costUsd'] = cost
            choice = raw['choices'][0]
            if choice.get('finish_reason') != 'stop':
                raise ValueError('Incomplete response')
            answer = json.loads(choice['message']['content'])
            compiled, status = validate_answer(adapter, job, answer)
            result.update(answer=answer, compiled=compiled, status=status)
        except Exception as error:
            result.update(errorKind='validation', error=type(error).__name__ + ': ' + str(error)[:1000])
    result['resultHash'] = digest(result)
    return result


def saved(job, directory, config, adapter):
    jid = job['job_id']
    ap = directory / 'attempts' / (jid + '.json')
    rp = directory / 'results' / (jid + '.json')
    if not ap.exists():
        if rp.exists():
            raise ValueError('Result without attempt: ' + jid)
        return None, None
    attempt = load(ap)
    if (attempt.get('jobId') != jid or attempt.get('jobHash') != digest(job) or
            attempt.get('manifestHash') != digest(config) or
            attempt.get('requestHash') != digest(payload_for(job, adapter, config)) or
            attempt.get('reservedUsd') != reservation(payload_for(job, adapter, config), config)):
        raise ValueError('Attempt binding differs: ' + jid)
    if not rp.exists():
        return attempt, dict(jobId=jid, status='interrupted', costUsd=None, errorKind='interrupted')
    result = load(rp)
    checksum = result.pop('resultHash', None)
    if (checksum != digest(result) or result.get('jobId') != jid or result.get('jobHash') != digest(job) or
            result.get('manifestHash') != digest(config) or
            result.get('status') not in SUCCESS | {'failed'} or
            (result.get('costUsd') is not None and not money(result['costUsd']))):
        raise ValueError('Result integrity differs: ' + jid)
    if result['status'] in SUCCESS:
        compiled, status = validate_answer(adapter, job, result['answer'])
        if compiled != result.get('compiled') or status != result['status']:
            raise ValueError('Saved validation differs: ' + jid)
    result['resultHash'] = checksum
    return attempt, result


def verified_carry(config, output):
    expected_scope = dict(runId=config['runId'], configHash=digest(config))
    carried_unknown = config.get('carriedUnknownReservedUsd', 0)
    if carried_unknown or config.get('qualityTrial') or config.get('comparisonTrial'):
        prior = config.get('priorRun', {})
        archive = output/'budget-history'/(prior.get('configHash', '') + '-' + digest(config) + '.json')
        receipt = load(archive)
        checksum = receipt.pop('transitionHash', None)
        if (checksum != digest(receipt) or receipt.get('nextScope') != expected_scope or
                receipt.get('priorCost') != prior or
                receipt.get('carriedUnknownReservedUsd') != carried_unknown):
            raise ValueError('Carried unknown reservation lacks its exact transition receipt')
    return carried_unknown


def run(config, inputs, recipe, output, commit, concurrency=16, request=None,
        seconds=22 * 3600, stop_event=None):
    """Caller must hold the remote singleton lock for the full invocation."""
    manifest = load(inputs / 'queue-manifest.json')
    for name, field in [('source-manifest.json', 'sourceManifestSha256'), ('source-verification.json', 'sourceVerificationSha256')]:
        if file_hash(inputs/name) != manifest[field]:
            raise ValueError('Captured source receipt differs')
    config_check(config, manifest, recipe, concurrency)
    adapter = recipe_adapter(recipe)
    owned_transport = request is None
    request = request or Transport(config.get('requestTimeoutSeconds', 360))
    if isinstance(request, Transport):
        request.timeout_seconds = config.get('requestTimeoutSeconds', 360)
    stop_event = stop_event or threading.Event()
    key = os.environ['REVIEW_API_KEY']
    directory = output / config['runId']
    budget_scope = output / 'budget-scope.json'
    expected_scope = dict(runId=config['runId'], configHash=digest(config))
    if ((budget_scope.exists() and load(budget_scope) != expected_scope) or
            (config.get('priorRun') and not budget_scope.exists())):
        raise ValueError('Queue budget belongs to another frozen run; reconcile before replacing it')
    frozen = directory / 'config.json'
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    if config.get('keyFingerprint') != key_hash:
        raise ValueError('Frozen key differs')
    if frozen.exists() and load(frozen) != config:
        raise ValueError('Run config changed; no budget or recipe reset allowed')
    carried_unknown = verified_carry(config, output)
    # Full streaming preflight catches a late damaged shard before dispatching any requests.
    counts = Counter()
    known_cost = held_cost = 0.0
    seen = set()
    past_results = []
    for job in jobs(inputs, manifest):
        seen.add(job['job_id'])
        attempt, result = saved(job, directory, config, adapter)
        if attempt:
            counts[result['status']] += 1
            if result.get('costUsd') is None:
                held_cost += attempt['reservedUsd']
            else:
                known_cost += result['costUsd']
                if result['costUsd'] > attempt['reservedUsd']:
                    raise RuntimeError('Past reported cost exceeds reservation')
            past_results.append((attempt['startedAt'], job['job_id'], result.get('errorKind')))
    for subdir in ('attempts', 'results'):
        for path in (directory / subdir).glob('*.json'):
            if path.stem not in seen:
                raise ValueError('Saved record outside frozen queue')
    recent_saved = [r[2] for r in sorted(past_results)[-16:]]
    quality_trial = config.get('qualityTrial') == 'source-readings-210-v1' or config.get('comparisonTrial') is not None
    if recent_saved.count('provider') >= 4 or (not quality_trial and recent_saved.count('validation') >= 8):
        raise RuntimeError('Saved failure burst requires explicit reconciliation')
    old = load(directory/'progress.json') if (directory/'progress.json').exists() else {}
    if old.get('stopReason') in {'provider_failure_burst', 'validation_failure_burst', 'reported_cost_exceeds_reservation'}:
        raise RuntimeError('Earlier failure stop requires explicit reconciliation')
    info = preflight(config, key, request)
    # Balance already includes settled known charges; subtract unresolved reservations again.
    allowance = min(config['budgetUsd'] - known_cost - held_cost - carried_unknown, info['limit_remaining'] - held_cost - carried_unknown)
    atomic(budget_scope, expected_scope)
    atomic(frozen, config)
    atomic(directory/'key-check.json', dict(checkedAt=utc(), usage=info['usage'], remaining=info['limit_remaining']))
    commit()
    active = {}
    recent = deque(recent_saved, maxlen=16)
    pending = iter(jobs(inputs, manifest))
    exhausted = False
    stop_reason = None
    started = time.monotonic()
    last_check = started
    reservations = 0.0
    writes = 0

    def progress():
        value = dict(runId=config['runId'], manifestHash=digest(config), updatedAt=utc(),
            total=manifest['jobs'], counts=dict(counts), inFlight=len(active),
            notStarted=manifest['jobs']-sum(counts.values())-len(active),
            reportedCostUsd=known_cost, unknownReservedUsd=held_cost,
            carriedUnknownReservedUsd=carried_unknown, totalUnknownReservedUsd=held_cost+carried_unknown,
            activeReservedUsd=reservations, budgetUsd=config['budgetUsd'],
            stopReason=stop_reason, queueExhausted=exhausted and not active, concurrency=concurrency, allStructurallyRead=counts['complete']+counts['needs_context']==manifest['jobs'],
            acceptedFacts=0, elapsedSeconds=round(time.monotonic()-started))
        atomic(directory/'progress.json', value)
        commit()
        return value

    try:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            while active or not exhausted:
                now = time.monotonic()
                if stop_event.is_set():
                    stop_reason = stop_reason or 'interrupted'
                if now-started >= seconds:
                    stop_reason = stop_reason or 'time_slice_complete'
                if not stop_reason and (now-last_check >= 60 or writes >= 32):
                    # A failed balance/pricing check stops admission, never reports zero spend.
                    try:
                        info = preflight(config, key, request)
                        allowance = min(config['budgetUsd']-known_cost-held_cost-carried_unknown-reservations,
                                        info['limit_remaining']-held_cost-carried_unknown-reservations)
                    except Exception:
                        stop_reason = 'provider_preflight_failed'
                    last_check, writes = now, 0
                wave = []
                while not stop_reason and not exhausted and len(active)+len(wave) < concurrency:
                    try:
                        job = next(pending)
                    except StopIteration:
                        exhausted = True
                        break
                    if (directory/'attempts'/(job['job_id']+'.json')).exists():
                        continue
                    payload = payload_for(job, adapter, config)
                    reserve = reservation(payload, config)
                    if reserve > allowance:
                        stop_reason = 'budget_limit'
                        break
                    attempt = dict(jobId=job['job_id'], jobHash=digest(job), manifestHash=digest(config),
                                   requestHash=digest(payload), reservedUsd=reserve, startedAt=utc())
                    atomic(directory/'attempts'/(job['job_id']+'.json'), attempt)
                    allowance -= reserve
                    reservations += reserve
                    wave.append((job, payload, reserve))
                if wave:
                    # Durable before any requests in this wave. A crash here conservatively holds all reservations.
                    commit()
                    for job, payload, reserve in wave:
                        active[pool.submit(read_one, job, payload, adapter, digest(config), key, request)] = (job, reserve)
                if not active:
                    break
                finished, _ = wait(active, timeout=20, return_when=FIRST_COMPLETED)
                for future in finished:
                    job, reserve = active.pop(future)
                    result = future.result()
                    atomic(directory/'results'/(job['job_id']+'.json'), result)
                    reservations -= reserve
                    if result['costUsd'] is None:
                        held_cost += reserve
                    else:
                        known_cost += result['costUsd']
                        allowance += max(0, reserve-result['costUsd'])
                        if result['costUsd'] > reserve:
                            stop_reason = 'reported_cost_exceeds_reservation'
                    counts[result['status']] += 1
                    recent.append(result.get('errorKind'))
                    writes += 1
                    if recent.count('provider') >= 4:
                        stop_reason = 'provider_failure_burst'
                    if not quality_trial and recent.count('validation') >= 8:
                        stop_reason = 'validation_failure_burst'
                progress()
                if stop_reason and not active:
                    break
        return progress()
    finally:
        if owned_transport:
            request.close()
