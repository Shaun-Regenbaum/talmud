"""Prepare one immutable private upload; this command makes no network requests."""
import argparse
import json
from pathlib import Path
import shutil

from queue_core import atomic, config_check, digest, file_hash, jobs, recipe_files

ADAPTER = '''"""Bind the compact source reader to the frozen queue interface."""
from .compact_source.request import build_request
from .compact_source.validate import check


def messages(job):
    return build_request(job)['messages']


def validate(job, answer):
    return check(job, answer)


def status(answer):
    return 'needs_context' if answer['episode']['coverage'] == 'needs_context' else 'complete'
'''


def freeze(source, package, destination, settings):
    if destination.exists():
        raise ValueError('Destination exists; never overwrite a frozen run')
    pending = destination.with_name(destination.name + '.part')
    if pending.exists():
        raise ValueError('Interrupted freeze exists; inspect it before retrying')
    pending.mkdir(parents=True)
    (pending/'shards').mkdir()
    (pending/'recipe').mkdir()
    shutil.copytree(package, pending/'recipe/compact_source',
                    ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    (pending/'recipe/queue_adapter.py').write_text(ADAPTER)
    original = json.loads((source/'manifest.json').read_text())
    declared = original.get('shards')
    actual_names = {p.name for p in (source/'shards').glob('*.jsonl')}
    if not isinstance(declared, dict) or set(declared) != actual_names:
        raise ValueError('Captured manifest shard inventory differs')
    shards = []
    for path in sorted((source/'shards').glob('*.jsonl')):
        shutil.copyfile(path, pending/'shards'/path.name)
        with path.open() as stream:
            count = sum(1 for _ in stream)
        current_hash = file_hash(path)
        if declared[path.name] != dict(jobs=count, sha256=current_hash):
            raise ValueError('Captured manifest shard hash/count differs')
        if file_hash(pending/'shards'/path.name) != current_hash:
            raise ValueError('Shard changed while copying')
        shards.append(dict(file=path.name, sha256=current_hash, jobs=count))
    if not shards:
        raise ValueError('No frozen shards')
    for name in ('manifest.json', 'verification.json'):
        shutil.copyfile(source/name, pending/('source-' + name))
    original = json.loads((source/'manifest.json').read_text())
    verification = json.loads((source/'verification.json').read_text())
    if (verification.get('failures') != {} or verification.get('jobs') != original['jobs'] or
            verification.get('segmentsCovered') != verification.get('universe')):
        raise ValueError('Source coverage verification failed')
    manifest = dict(jobs=sum(s['jobs'] for s in shards), shards=shards,
                    sourceManifestSha256=file_hash(source/'manifest.json'),
                    sourceVerificationSha256=file_hash(source/'verification.json'))
    if manifest['jobs'] != original['jobs']:
        raise ValueError('Captured source count differs')
    atomic(pending/'queue-manifest.json', manifest)
    count = sum(1 for _ in jobs(pending, manifest))
    config = dict(settings, inputManifestHash=digest(manifest),
                  recipeFiles=recipe_files(pending/'recipe'),
                  runnerHash=file_hash(Path(__file__).with_name('queue_core.py')),
                  coordinatorHash=file_hash(Path(__file__).with_name('queue_job.py')))
    config_check(config, manifest, pending/'recipe', min(16, config.get('approvedConcurrency', 16)))
    atomic(pending/'config.json', config)
    pending.replace(destination)
    return dict(runId=config['runId'], jobs=count, configHash=digest(config),
                budgetUsd=config['budgetUsd'], approvedConcurrency=config.get('approvedConcurrency', 16),
                uploadDirectory=str(destination))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('compact_package', type=Path)
    parser.add_argument('settings', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(freeze(args.source, args.compact_package, args.output,
                            json.loads(args.settings.read_text())), indent=2))
