"""Freeze verdict jobs into one upload directory for the existing coverage queue. No network calls.

Writes the layout `coverage/queue_core.py` reads: recipe/ (this package plus queue_adapter.py),
shards/*.jsonl and queue-manifest.json. It also writes freeze-receipt.json with every file hash
and each request's size. The run settings (provider, prices, budget, key) are not part of the
freeze; the person launching chooses them. Freezing the same jobs twice gives identical bytes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

try:
    from .contract import VERSION
    from .request import build_request
    from .validate import canonical
except ImportError:
    from contract import VERSION
    from request import build_request
    from validate import canonical

ADAPTER = '''"""Bind the relationship verdict recipe to the frozen queue interface."""
from .relationship_verdict.request import build_request
from .relationship_verdict.validate import check, status as answer_status


def messages(job):
    return build_request(job)['messages']


def validate(job, answer):
    return check(job, answer)


def status(answer):
    return answer_status(answer)
'''
SHARD = 'jobs-001.jsonl'
PACKAGE_FILES = ('__init__.py', 'contract.py', 'reader.md', 'request.py', 'validate.py', 'freeze.py', 'README.md')


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def recipe_files(directory):
    # The same inventory queue_core.recipe_files records, so the two can be compared.
    return {str(p.relative_to(directory)): file_hash(p) for p in sorted(directory.rglob('*'))
            if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}


def max_reservation_usd(request_bytes, input_price, output_price, max_tokens):
    """The queue's own upper bound for one request: bytes plus overhead as tokens, and the full output."""
    return (request_bytes + 4096) * input_price + max_tokens * output_price


def freeze(jobs_path, destination):
    destination = Path(destination)
    if destination.exists():
        raise ValueError('Destination exists; never overwrite a frozen run')
    pending = destination.with_name(destination.name + '.part')
    if pending.exists():
        raise ValueError('Interrupted freeze exists; inspect it before retrying')
    jobs = [json.loads(line) for line in Path(jobs_path).read_text().splitlines() if line.strip()]
    ids = [j['job_id'] for j in jobs]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate job id')
    package = Path(__file__).parent
    pending.mkdir(parents=True)
    (pending / 'shards').mkdir()
    (pending / 'recipe' / 'relationship_verdict').mkdir(parents=True)
    for name in PACKAGE_FILES:
        shutil.copyfile(package / name, pending / 'recipe' / 'relationship_verdict' / name)
    (pending / 'recipe' / 'queue_adapter.py').write_text(ADAPTER)
    sizes = {}
    lines = []
    for job in jobs:
        request = build_request(job)
        sizes[job['job_id']] = len(canonical(request['messages']).encode())
        lines.append(canonical(job) + '\n')
    (pending / 'shards' / SHARD).write_text(''.join(lines))
    shard_hash = file_hash(pending / 'shards' / SHARD)
    manifest = {'jobs': len(jobs), 'shards': [{'file': SHARD, 'sha256': shard_hash, 'jobs': len(jobs)}]}
    (pending / 'queue-manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    receipt = {'contract': VERSION, 'jobsInputSha256': file_hash(jobs_path), 'jobs': len(jobs),
               'queueManifestSha256': file_hash(pending / 'queue-manifest.json'),
               'recipeFiles': recipe_files(pending / 'recipe'), 'requestBytes': sizes,
               'totalRequestBytes': sum(sizes.values()), 'largestRequestBytes': max(sizes.values()),
               'runSettings': 'not frozen here; chosen at launch'}
    (pending / 'freeze-receipt.json').write_text(json.dumps(receipt, indent=1) + '\n')
    pending.replace(destination)
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jobs', type=Path, help='verdict jobs, one JSON object per line')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    r = freeze(args.jobs, args.output)
    print(json.dumps({k: r[k] for k in ('contract', 'jobs', 'totalRequestBytes', 'largestRequestBytes', 'queueManifestSha256')}))
