"""Read back an append-only proposal revision before activation; never mutate D1."""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess

from prepare_d1 import encode
from shared_records import version_hash

COLUMNS = ['record_id', 'kind', 'passage_id', 'ref', 'subject_id', 'object_id',
           'authority', 'decision', 'payload_sha256', 'payload_json']


def require(condition, message):
    if not condition:
        raise ValueError(message)


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def verify(args):
    folder = args.output
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'receipt.json').unlink(missing_ok=True)
    manifest = json.loads(args.manifest.read_text())
    parent = json.loads(args.parent_manifest.read_text())
    raw_changes = args.changes.read_bytes()
    require(hashlib.sha256(raw_changes).hexdigest() == manifest['changesSha256'], 'Changes hash differs')
    changes = json.loads(raw_changes)
    require(changes['parentRevision'] == manifest['parentRevision'] == parent['revision'], 'Parent differs')
    rev, old = manifest['revision'], parent['revision']
    require(rev != old, 'Target must differ from parent')
    expected = []
    for row in changes['records']:
        require(row['kind'] == 'identity_proposal' and row['authority'] == 'screening'
                and row['decision'] == 'needs_review' and not row.get('replacesSha256'), 'Not append-only proposals')
        payload = encode(row['data'])
        item = {**{c: row.get(c) for c in COLUMNS[:-2]},
                'payload_sha256': hashlib.sha256(payload.encode()).hexdigest(), 'payload_json': payload}
        item['version_sha256'] = version_hash(tuple(item[c] for c in COLUMNS))
        expected.append(item)
    expected.sort(key=lambda r: r['record_id'])
    require(expected and len({r['record_id'] for r in expected}) == len(expected), 'Empty/duplicate additions')
    prefixes = {r['record_id'].split('/', 1)[0] for r in expected}
    require(len(prefixes) == 1 and next(iter(prefixes)).startswith('identity_proposal:'), 'Mixed proposal runs')
    require(parent['recordCount'] + len(expected) == manifest['recordCount'], 'Record count differs')
    env = dict(os.environ, CLOUDFLARE_ACCOUNT_ID=args.account_id)
    command = ['pnpm', 'exec', 'wrangler', 'd1', 'execute',
               'talmud-sage-graph' + ('-staging' if args.environment == 'staging' else ''), '--remote', '--json']
    if args.environment == 'staging':
        command += ['--env', 'staging']

    def query(name, sql):
        process = subprocess.Popen(command + ['--command', sql], cwd=args.worktree / 'packages/talmud',
                                   env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            out, err = process.communicate(timeout=120)
        except BaseException:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
            raise
        (folder / (name + '.stderr')).write_bytes(err)
        require(process.returncode == 0, name + ': query failed')
        text = out.decode().lstrip()
        data, end = json.JSONDecoder().raw_decode(text)
        tail = text[end:].strip()
        require(not tail or tail.startswith('There is a newer version of Wrangler available'), 'Unexpected query output')
        require(isinstance(data, list) and data and all(x.get('success') is True for x in data), name + ': unsuccessful response')
        pending = folder / (name + '.part')
        pending.write_bytes(out)
        pending.replace(folder / (name + '.json'))
        return [x['results'] for x in data]

    target, prior = literal(rev), literal(old)
    def state_check(name):
        result = query(name, f"SELECT id,manifest_json,state FROM sage_graph_revisions WHERE id IN ({target},{prior}); "
                       f"SELECT COUNT(*) AS n FROM sage_graph_all_records WHERE revision_id={target}; "
                       f"SELECT COUNT(*) AS n FROM sage_graph_all_records WHERE revision_id={prior}; "
                       f"SELECT COUNT(*) AS n FROM sage_graph_revision_members p LEFT JOIN sage_graph_revision_members n ON n.revision_id={target} AND n.record_id=p.record_id WHERE p.revision_id={prior} AND n.version_id IS NOT p.version_id; "
                       f"SELECT COUNT(*) AS n FROM sage_graph_records WHERE revision_id={target}; "
                       f"SELECT COUNT(*) AS n FROM sage_graph_revision_members WHERE revision_id={target}; "
                       f"SELECT COUNT(*) AS n FROM sage_graph_revision_members WHERE revision_id={prior};")
        require(len(result) == 7, 'Missing state queries')
        states = {row['id']: row for row in result[0]}
        require(set(states) == {rev, old} and states[rev]['state'] == 'loading' and states[old]['state'] == 'verified', 'Revision state differs')
        for m in (manifest, parent):
            require(json.loads(states[m['revision']]['manifest_json']) == {k: v for k, v in m.items() if k != 'revision'}, 'Remote manifest differs')
        counts = [manifest['recordCount'], parent['recordCount'], 0, 0, manifest['recordCount'], parent['recordCount']]
        require(result[1:] == [[{'n': n}] for n in counts], 'Inherited versions/counts/shared storage differ')

    state_check('before')
    def chunk_check(offset):
        chunk = expected[offset:offset + args.chunk_size]
        lo, hi = literal(chunk[0]['record_id']), literal(chunk[-1]['record_id'])
        fields = ','.join('v.' + c for c in COLUMNS)
        result = query('additions-' + str(offset),
                       f"SELECT {fields},v.version_sha256 FROM sage_graph_revision_members m JOIN sage_graph_record_versions v ON v.id=m.version_id WHERE m.revision_id={target} AND m.record_id>={lo} AND m.record_id<={hi} ORDER BY m.record_id; "
                       f"SELECT COUNT(*) AS n FROM sage_graph_all_records WHERE revision_id={prior} AND record_id>={lo} AND record_id<={hi};")
        require(result == [chunk, [{'n': 0}]], 'Addition/index/payload/version differs at ' + str(offset))
        return len(chunk)

    verified = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(chunk_check, i) for i in range(0, len(expected), args.chunk_size)]
        for future in concurrent.futures.as_completed(futures):
            verified += future.result()
            print(f'Verified {verified}/{len(expected)} additions', flush=True)
    state_check('after')
    receipt = dict(environment=args.environment, accountId=args.account_id, revision=rev, parentRevision=old,
                   changesSha256=manifest['changesSha256'], recordSetSha256=manifest['recordSetSha256'],
                   verifiedRecords=manifest['recordCount'], unchangedParentRecords=parent['recordCount'],
                   addedRecords=verified, replacedRecords=0, indexedAndPayloadsMatch=True,
                   method='All inherited version IDs equal; every addition index, payload and version hash equals prepared changes; counts and manifests match.')
    pending = folder / 'receipt.part'
    pending.write_text(json.dumps(receipt, indent=2) + '\n')
    pending.replace(folder / 'receipt.json')
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment', choices=['staging', 'production'])
    for name in ('manifest', 'parent-manifest', 'changes', 'worktree', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--account-id', required=True)
    parser.add_argument('--chunk-size', type=int, choices=range(100, 201), default=150)
    parser.add_argument('--workers', type=int, choices=range(4, 9), default=4)
    print(json.dumps(verify(parser.parse_args()), indent=2))


if __name__ == '__main__':
    main()
