"""Compare a run's answers with reference verdicts, claim by claim. Deterministic; no network calls.

The reference is whatever is passed in. For the pilot it is one reader's 16 hand verdicts, which are
not gold: a match means agreement with that reader, not accuracy. For each reference claim the report
gives exact matches on the five typed fields and on two compiled results (pair kept, original passed on),
the full record of every mismatch, every review flag, and every raw failure (no result, a failed or
interrupted request, a saved result whose checksum differs, an answer the current validator refuses, or a
claim no job contains). It also totals the reported cost of the results it was given.
"""
import argparse
import json
from pathlib import Path

try:
    from .validate import Invalid, check, compile_claim, digest
except ImportError:
    from validate import Invalid, check, compile_claim, digest

FIELDS = ('claim_as_written', 'supported_kind', 'direction', 'family_degree', 'verdict')
COMPILED = ('pair_connection', 'original_endorsed')
SUCCESS = ('complete', 'needs_context')


def source_text(job):
    return ' '.join(' '.join(s['text'].split()) for s in job['sources'])


def compiled_fields(claim, verdict, text):
    c = compile_claim(claim, verdict, text)
    return {'pair_connection': c['pair']['connection'], 'original_endorsed': c['original']['endorsed']}, c


def unusable(job, result):
    """Why a saved result cannot be scored, or None. The queue's own checksum and the current validator decide."""
    if result is None:
        return 'no result'
    if 'resultHash' in result and digest({k: v for k, v in result.items() if k != 'resultHash'}) != result['resultHash']:
        return 'result checksum differs'
    if result.get('status') not in SUCCESS:
        return result.get('status')
    try:
        check(job, result['answer'])
    except (Invalid, KeyError, TypeError) as error:
        return 'answer fails the current validator: ' + str(error)[:300]
    return None


def score(jobs, results, reference, label):
    """jobs: {job_id: job}; results: {job_id: saved result}; reference: {claim_id: verdict}."""
    where = {c['claim_id']: (jid, c) for jid, job in jobs.items() for c in job['claims']}
    matches = {f: 0 for f in FIELDS + COMPILED}
    compared, mismatches, flags, failures, rows = 0, [], [], [], []
    for cid in sorted(reference):
        expected = reference[cid]
        if cid not in where:
            failures.append({'claimId': cid, 'failure': 'claim is in no job'})
            continue
        jid, claim = where[cid]
        result = results.get(jid)
        why = unusable(jobs[jid], result)
        if why is not None:
            failures.append({'claimId': cid, 'jobId': jid, 'failure': why,
                             'errorKind': (result or {}).get('errorKind'), 'error': (result or {}).get('error')})
            continue
        got = next(v for v in result['answer']['verdicts'] if v['claim_id'] == cid)
        text = source_text(jobs[jid])
        want_c, _ = compiled_fields(claim, expected, text)
        got_c, got_compiled = compiled_fields(claim, got, text)
        compared += 1
        row = {'claimId': cid, 'jobId': jid, 'fields': {}}
        for field in FIELDS + COMPILED:
            a, b = (expected[field], got[field]) if field in FIELDS else (want_c[field], got_c[field])
            row['fields'][field] = a == b
            if a == b:
                matches[field] += 1
            else:
                mismatches.append({'claimId': cid, 'jobId': jid, 'field': field, 'reference': a, 'answer': b,
                                   'referenceReason': expected['reason'], 'answerReason': got['reason'],
                                   'answerUncertainDetail': got['uncertain_detail']})
        if got_compiled['audit_flags']:
            flags.append({'claimId': cid, 'jobId': jid, 'flags': got_compiled['audit_flags']})
        rows.append(row)
    costs = [r.get('costUsd') for r in results.values()]
    return {'label': label, 'referenceIsGold': False,
            'cost': {'results': len(costs), 'reportedCostUsd': round(sum(c for c in costs if isinstance(c, (int, float))), 9),
                     'resultsWithoutReportedCost': sum(1 for c in costs if not isinstance(c, (int, float)))},
            'note': 'Agreement with the reference only. The reference is not gold; it needs an independent source review.',
            'referenceClaims': len(reference), 'compared': compared, 'rawFailures': failures,
            'exactMatches': {f: {'matches': matches[f], 'compared': compared} for f in FIELDS + COMPILED},
            'mismatches': mismatches, 'auditFlags': flags, 'perClaim': rows}


def load_reference(path):
    data = json.loads(Path(path).read_text())
    rows = [c['verdict'] for c in data['controls']] if 'controls' in data else data
    return {v['claim_id']: v for v in rows}


def load_results(run_dir):
    """Saved results from one queue run directory; an attempt with no result counts as interrupted."""
    run_dir = Path(run_dir)
    out = {}
    for path in sorted((run_dir / 'attempts').glob('*.json')):
        out[path.stem] = {'status': 'interrupted', 'errorKind': 'interrupted'}
    for path in sorted((run_dir / 'results').glob('*.json')):
        result = json.loads(path.read_text())
        out[result['jobId']] = result
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jobs', type=Path, help='frozen shard: one job per line')
    parser.add_argument('run', type=Path, help='queue run directory with attempts/ and results/')
    parser.add_argument('reference', type=Path, help='hand verdicts JSON, or a JSON list of verdicts')
    parser.add_argument('output', type=Path)
    parser.add_argument('--label', default='relationship verdict comparison')
    args = parser.parse_args()
    jobs = {j['job_id']: j for j in map(json.loads, args.jobs.read_text().splitlines())}
    report = score(jobs, load_results(args.run), load_reference(args.reference), args.label)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps({k: report[k] for k in ('compared', 'exactMatches')}), len(report['mismatches']), 'mismatches,',
          len(report['rawFailures']), 'raw failures')
