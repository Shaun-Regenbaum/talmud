"""Freeze a source-bound comparison sample without making provider requests."""
import argparse
import gzip
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compact_source_v2.validate import check_saved, digest

SEED = 'compact-instructions-v3-paired30-v1|'
TARGETED = ('v18-bavli-005', 'v18-bavli-011', 'v18-bavli-016', 'v18-bavli-036',
            'v18-bavli-049', 'v18-bavli-055', 'v18-bavli-061')
QUOTAS = {'valid': (3, 3, 2), 'validation_failed': (3, 3, 2), 'truncated': (3, 2, 2)}

REGRESSIONS = {
    'v18-bavli-005': ['Keep Rabbah addressing Rav Yosef, Gidel reporting Rav, and Shimon son of Elazar.'],
    'v18-bavli-011': ['Continue the named Zeira/Asi exchange across אמר ליה; retain alternatives if direction is uncertain.'],
    'v18-bavli-016': ['Keep Abaye speech and uncertain reply; do not make the generic court case an actual execution.'],
    'v18-bavli-036': ['Anchor Rav as רב, excluding בית נמרוד; preserve explicit אמר X אמר Y transmission and embedded fathers.'],
    'v18-bavli-049': ['Explain possible Abaye/Nachmani local alias or alternatives; keep hypothetical homeowner/agent separate from Rava speech.'],
    'v18-bavli-055': ['Do not turn editorial questions into one historical unnamed reporter.'],
    'v18-bavli-061': ['Rava explaining Isi uses responds_to_teaching, not reports_in_name_of.'],
}


def select(snapshot):
    """Selection sees status/length/IDs/hashes, never semantic error labels."""
    by_id = {r['jobId']: r for r in snapshot}
    if len(by_id) != len(snapshot) or not set(TARGETED) <= set(by_id):
        raise ValueError('Repeated jobs or targeted control missing')
    selected = [dict(by_id[j], selection='targeted_or_positive_control') for j in TARGETED]
    for status, quotas in [('valid', (3, 3, 2)), ('validation_failed', (3, 3, 2)), ('truncated', (3, 2, 2))]:
        pool = sorted((r for r in snapshot if r['jobId'] not in TARGETED and r['stratum'] == status),
                      key=lambda r: (r['sourceChars'], r['jobId']))
        for group, quota in enumerate(quotas):
            candidates = pool[len(pool) * group // 3:len(pool) * (group + 1) // 3]
            if len(candidates) < quota:
                raise ValueError('Not enough controls in each status/length third')
            candidates.sort(key=lambda r: hashlib.sha256((SEED + r['jobId']).encode()).hexdigest())
            selected.extend(dict(r, selection='independent_control', lengthThird=group + 1)
                            for r in candidates[:quota])
    return selected


def prepare(job_file, results, output):
    jobs = [json.loads(line) for line in job_file.read_text().splitlines() if line.strip()]
    by_id = {j['job_id']: j for j in jobs}
    if len(jobs) != len(by_id):
        raise ValueError('Duplicate source job')
    snapshot, saved = [], {}
    for path in sorted(results.glob('*.json')):
        raw = path.read_bytes()
        result = json.loads(raw)
        job = by_id[result['jobId']]
        if result['resultHash'] != digest({k: v for k, v in result.items() if k != 'resultHash'}):
            raise ValueError('Changed saved result')
        finish = (result.get('response', {}).get('choices') or [{}])[0].get('finish_reason')
        if finish == 'length':
            stratum = 'truncated'
        elif result.get('status') in {'complete', 'needs_context'}:
            compiled = check_saved(job, result['compiled'])
            if result['answer'] != compiled['answer']:
                raise ValueError('Result answer differs from validated reading')
            stratum = 'valid'
        elif result.get('status') == 'failed' and result.get('errorKind') == 'validation':
            stratum = 'validation_failed'
        else:
            raise ValueError('Unexpected result status in paired snapshot')
        if result['jobHash'] != digest(job):
            raise ValueError('Result does not match exact source')
        saved[job['job_id']] = result
        snapshot.append(dict(jobId=job['job_id'], jobHash=digest(job),
                             resultHash=result['resultHash'], resultFileSha256=hashlib.sha256(raw).hexdigest(),
                             sourceChars=sum(len(s['text']) for s in job['sources']), stratum=stratum,
                             status=result['status'], finishReason=finish))
    selected = select(snapshot)
    cases = [dict(job=by_id[r['jobId']], baselineAnswer=saved[r['jobId']].get('answer')) for r in selected]
    manifest = dict(version='paired-source-instructions-30-v1', seed=SEED, targeted=list(TARGETED),
                    quotas=QUOTAS, eligibleSnapshot=snapshot, selected=selected,
                    sourceFileSha256=hashlib.sha256(job_file.read_bytes()).hexdigest(),
                    semanticReviewCriteria=REGRESSIONS,
                    caveat='All downloaded outputs available at freeze time; not a representative estimate for the full corpus. Baseline readings are not certified answers.',
                    casesSha256=digest(cases))
    output.mkdir(parents=True, exist_ok=False)
    encoded = json.dumps(dict(manifest=manifest, cases=cases), ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    (output/'paired-source-v3-real.json.gz').write_bytes(gzip.compress(encoded, mtime=0))
    (output/'selection-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    (output/'jobs.jsonl').write_text(''.join(json.dumps(c['job'], ensure_ascii=False)+'\n' for c in cases))
    for r in selected:
        raw = (results/(r['jobId']+'.json')).read_bytes()
        if hashlib.sha256(raw).hexdigest() != r['resultFileSha256']:
            raise ValueError('Baseline changed while freezing paired sample')
        (output/(r['jobId']+'-baseline.json')).write_bytes(raw)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jobs', type=Path)
    parser.add_argument('results', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = prepare(args.jobs, args.results, args.output)
    print(json.dumps(dict(selected=len(result['selected']), eligible=len(result['eligibleSnapshot']), manifestHash=digest(result))))
