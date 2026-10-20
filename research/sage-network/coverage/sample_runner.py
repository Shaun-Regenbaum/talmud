"""A sample transport; passing shape checks does not approve an interpretation."""
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time

MODEL = 'deepseek/deepseek-v4.1-flash'
MAX_OUTPUT = 32768
RUN_CAP = 3.0
KEY_CAP = 100.0
REASONING_EFFORT = 'low'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_suffix(path.suffix + '.part')
    part.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    part.replace(path)


def request(url, key=None, payload=None):
    config = 'url = ' + json.dumps(url) + '\n'
    if key:
        config += 'header = ' + json.dumps('Authorization: Bearer ' + key) + '\n'
    if payload is not None:
        config += 'header = "Content-Type: application/json"\nrequest = "POST"\ndata = ' + json.dumps(canonical(payload), ensure_ascii=False) + '\n'
    result = subprocess.run(['curl', '--silent', '--show-error', '--fail', '--connect-timeout', '10',
                             '--max-time', '360', '--config', '-'], input=config,
                            text=True, capture_output=True, timeout=370)
    if result.returncode:
        raise RuntimeError('Request failed; curl code ' + str(result.returncode))
    return json.loads(result.stdout)


def select_route(endpoints):
    options = []
    for endpoint in endpoints:
        if (endpoint.get('status') != 0 or endpoint['tag'].startswith('decart/')
                or endpoint['tag'] == 'open-inference/fp4'):
            continue
        if not {'max_tokens', 'response_format', 'reasoning'} <= set(endpoint.get('supported_parameters', [])):
            continue
        if endpoint.get('max_completion_tokens', 0) < MAX_OUTPUT:
            continue
        # Time-dependent prices require an explicit later-window comparison.
        if endpoint['pricing'].get('overrides'):
            continue
        pricing = endpoint['pricing']
        inp, out = float(pricing['prompt']), float(pricing['completion'])
        if not all(math.isfinite(p) and p >= 0 for p in (inp, out)):
            continue
        supported_prices = {'prompt', 'completion', 'input_cache_read', 'discount'}
        if any(float(value) != 0 for field, value in pricing.items() if field not in supported_prices):
            continue
        options.append({'provider': endpoint['tag'], 'inputPrice': inp, 'outputPrice': out,
                        'estimatedCost': inp * 12000 + out * 12000})
    if not options:
        raise RuntimeError('No priced eligible route')
    return min(options, key=lambda item: (item['estimatedCost'], item['provider']))


def request_body(job, guide, schema):
    return canonical({'instructions': guide, 'schema': schema, 'job': job})


def reservation(job, guide, schema, route):
    user = request_body(job, guide, schema)
    value = (len(user.encode()) + 2048) * route['inputPrice'] + MAX_OUTPUT * route['outputPrice']
    if not math.isfinite(value) or value < 0:
        raise ValueError('Invalid reservation')
    return value


def validate_bundle(bundle):
    if not re.fullmatch(r'[a-z0-9-]+', bundle.get('runId', '')):
        raise ValueError('Invalid run id')
    jobs = bundle.get('jobs')
    if not isinstance(jobs, list) or not 1 <= len(jobs) <= 150:
        raise ValueError('Sample must contain 1 to 150 actual jobs')
    if len({j['job_id'] for j in jobs}) != len(jobs):
        raise ValueError('Duplicate job id')
    for job in jobs:
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', job['job_id']):
            raise ValueError('Invalid job id')
        if not job['sources']:
            raise ValueError('No source text')
        for source in job['sources']:
            if hashlib.sha256(source['text'].encode()).hexdigest() != source['sha256']:
                raise ValueError('Source hash differs')
    if bundle.get('jobsSha256') != digest(jobs):
        raise ValueError('Job bundle hash differs')


def run(bundle, root, commit):
    validate_bundle(bundle)
    sys.path.insert(0, '/app/pilot')
    from validate import check
    from contract import SCHEMA
    guide = Path('/app/pilot/reader.md').read_text()
    key = os.environ['REVIEW_API_KEY']
    budget = request('https://openrouter.ai/api/v1/key', key)['data']
    if budget.get('limit') is None or budget['limit'] > KEY_CAP or budget.get('limit_reset'):
        raise RuntimeError('Expected the existing non-resetting key cap')
    remaining = budget.get('limit_remaining')
    if remaining is None or remaining < RUN_CAP:
        raise RuntimeError('Insufficient confirmed key allowance for the sample')
    endpoints = request('https://openrouter.ai/api/v1/models/' + MODEL + '/endpoints')['data']['endpoints']
    route = select_route(endpoints)
    directory = root / bundle['runId']
    manifest = {'runId': bundle['runId'], 'inputHash': digest(bundle), 'model': MODEL, 'route': route,
                'guideHash': hashlib.sha256(guide.encode()).hexdigest(), 'schemaHash': digest(SCHEMA),
                'codeHashes': {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in {
                    'runner': Path(__file__), 'validator': Path('/app/pilot/validate.py'),
                    'contract': Path('/app/pilot/contract.py')}.items()},
                'maxOutput': MAX_OUTPUT, 'reasoningEffort': REASONING_EFFORT,
                'runCap': RUN_CAP, 'keyCap': KEY_CAP,
                'keyFingerprint': hashlib.sha256(key.encode()).hexdigest()}
    frozen = directory / 'manifest.json'
    if frozen.exists() and json.loads(frozen.read_text()) != manifest:
        raise RuntimeError('Frozen input, recipe, key or cheapest route changed; reconcile first')
    atomic(frozen, manifest)
    atomic(directory / 'inputs.json', bundle)
    commit()
    results = []
    attempts = []
    pending = []
    for job in bundle['jobs']:
        result_path = directory / 'results' / (job['job_id'] + '.json')
        attempt_path = directory / 'attempts' / (job['job_id'] + '.json')
        if attempt_path.exists():
            attempt = json.loads(attempt_path.read_text())
            if attempt['jobHash'] != digest(job) or attempt['manifestHash'] != digest(manifest):
                raise RuntimeError('Saved attempt belongs to another input')
            if attempt['reservedUsd'] != reservation(job, guide, SCHEMA, route):
                raise RuntimeError('Saved reservation differs from frozen request')
            attempts.append(attempt)
            if result_path.exists():
                result = json.loads(result_path.read_text())
                checksum = result.pop('resultHash')
                if (checksum != digest(result) or result['jobHash'] != digest(job)
                        or result.get('manifestHash') != digest(manifest)):
                    raise RuntimeError('Saved result integrity failed')
                if result['status'] in {'complete', 'needs_context'}:
                    if check(job, result['answer']) != result['compiled']:
                        raise RuntimeError('Saved compilation differs from fresh validation')
                    expected = ('needs_context' if result['answer']['episode']['coverage'] == 'needs_context'
                                else 'complete')
                    if result['status'] != expected:
                        raise RuntimeError('Saved coverage status differs')
                result['resultHash'] = checksum
                results.append(result)
            else:
                results.append({'jobId': job['job_id'], 'status': 'interrupted', 'error': 'Earlier charge unknown; no automatic retry'})
        elif result_path.exists():
            raise RuntimeError('Result without dispatch receipt')
        else:
            pending.append(job)
    reserved = sum(a['reservedUsd'] for a in attempts)
    started = time.monotonic()
    active = {}
    cursor = 0
    prior_progress = directory / 'progress.json'
    stop_reason = (json.loads(prior_progress.read_text()).get('stopReason')
                   if prior_progress.exists() else None)
    if sum(r['status'] not in {'complete', 'needs_context'} for r in results[-16:]) >= 8:
        stop_reason = stop_reason or 'too_many_failed_readings'
    saved_reservations = {a['jobId']: a['reservedUsd'] for a in attempts}
    if any(r.get('costUsd') is not None and r['costUsd'] > saved_reservations[r['jobId']]
           for r in results):
        stop_reason = 'reported_cost_exceeds_reservation'

    def progress():
        data = {'runId': bundle['runId'], 'updatedAt': datetime.now(timezone.utc).isoformat(),
                'total': len(bundle['jobs']), 'complete': sum(r['status'] == 'complete' for r in results),
                'needsContext': sum(r['status'] == 'needs_context' for r in results),
                'structurallyValid': sum(r['status'] in {'complete', 'needs_context'} for r in results),
                'failed': sum(r['status'] not in {'complete', 'needs_context'} for r in results), 'inFlight': len(active),
                'notStarted': len(pending)-cursor, 'reservedUsd': reserved,
                'reportedCostUsd': sum(r.get('costUsd') or 0 for r in results),
                'unknownCharges': sum(r.get('costUsd') is None for r in results),
                'stopReason': stop_reason, 'route': route, 'elapsedSeconds': round(time.monotonic()-started)}
        atomic(directory / 'progress.json', data)
        commit()
        return data

    def read_job(job, payload):
        result = {'jobId': job['job_id'], 'jobHash': digest(job), 'manifestHash': digest(manifest),
                  'status': 'failed', 'costUsd': None}
        try:
            raw = request('https://openrouter.ai/api/v1/chat/completions', key, payload)
            result['response'] = raw
            cost = raw.get('usage', {}).get('cost')
            if isinstance(cost, (int, float)) and math.isfinite(cost) and cost >= 0:
                result['costUsd'] = cost
            choice = raw['choices'][0]
            if choice.get('finish_reason') != 'stop':
                raise ValueError('Incomplete response')
            answer = json.loads(choice['message']['content'])
            compiled = check(job, answer)
            result.update(status=('needs_context' if answer['episode']['coverage'] == 'needs_context'
                                  else 'complete'), answer=answer, compiled=compiled)
        except Exception as error:
            # Keep diagnostics bounded. Provider response bodies are never logged.
            result['error'] = type(error).__name__ + ': ' + str(error)[:1000]
        result['resultHash'] = digest(result)
        return result

    concurrency = 2 if len(bundle['jobs']) <= 3 else 8
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        while active or (cursor < len(pending) and not stop_reason):
            while not stop_reason and cursor < len(pending) and len(active) < concurrency:
                job = pending[cursor]
                user = request_body(job, guide, SCHEMA)
                # UTF-8 byte count safely overestimates token count; reserve full output.
                reserve = reservation(job, guide, SCHEMA, route)
                if reserved + reserve > RUN_CAP:
                    stop_reason = 'sample_budget_limit'
                    break
                payload = {'model': MODEL, 'messages': [{'role': 'user', 'content': user}],
                           'max_tokens': MAX_OUTPUT, 'response_format': {'type': 'json_object'},
                           'reasoning': {'effort': REASONING_EFFORT},
                           'provider': {'only': [route['provider']], 'allow_fallbacks': False,
                                        'require_parameters': True, 'max_price': {
                                            'prompt': route['inputPrice'] * 1e6,
                                            'completion': route['outputPrice'] * 1e6}}}
                attempt = {'jobId': job['job_id'], 'jobHash': digest(job), 'manifestHash': digest(manifest),
                           'reservedUsd': reserve, 'startedAt': datetime.now(timezone.utc).isoformat()}
                atomic(directory / 'attempts' / (job['job_id'] + '.json'), attempt)
                commit()
                reserved += reserve
                cursor += 1
                active[pool.submit(read_job, job, payload)] = job
            if not active:
                break
            finished, _ = wait(active, timeout=20, return_when=FIRST_COMPLETED)
            for future in finished:
                job = active.pop(future)
                result = future.result()
                atomic(directory / 'results' / (job['job_id'] + '.json'), result)
                results.append(result)
                if result.get('costUsd') is not None and result['costUsd'] > reservation(job, guide, SCHEMA, route):
                    stop_reason = 'reported_cost_exceeds_reservation'
            if sum(r['status'] not in {'complete', 'needs_context'} for r in results[-16:]) >= 8:
                stop_reason = 'too_many_failed_readings'
            progress()
    report = progress()
    report['finished'] = True
    report['allComplete'] = report['complete'] == report['total']
    atomic(directory / 'summary.json', report)
    commit()
    return report
