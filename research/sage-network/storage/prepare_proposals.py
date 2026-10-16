"""Build a complete unaccepted proposal archive from pinned inputs and saved results."""
import argparse
import hashlib
import json
from pathlib import Path
from identity_proposals import record, sha


def build(inputs, results, parent, run_id, audit_directory=None):
    manifest = json.loads((inputs / 'manifest.json').read_text())
    if (manifest.get('revision') != parent['revision'] or
            not parent.get('recordSetSha256') or
            manifest.get('sourceRecordSetSha256') != parent['recordSetSha256']):
        raise ValueError('Proposal source snapshot differs from parent')
    files = manifest['inputFiles']
    if set(files) != {p.name for p in inputs.glob('inputs-*.json')}:
        raise ValueError('Missing or extra input files')
    cases = {}
    file_cases = {}
    persons = set()
    for name, expected in files.items():
        if Path(name).name != name:
            raise ValueError('Invalid input file name')
        raw = (inputs / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError('Input file hash mismatch')
        batch = json.loads(raw)
        if (json.dumps(batch, ensure_ascii=False) + "\n").encode() != raw:
            raise ValueError("Input serialization differs from pinned producer")
        file_cases[name] = [case["id"] for case in batch]
        for case in batch:
            if case['id'] in cases or case['personKey'] in persons:
                raise ValueError('Duplicate input case/person')
            cases[case['id']] = case
            persons.add(case['personKey'])
    if len(cases) != manifest['cases'] or not cases:
        raise ValueError('Input coverage differs')
    # Export roots may contain multiple lane directories. Final receipts must be unique.
    saved = {}
    recovery = None
    if (results / 'reconciliation.json').exists():
        recovery = json.loads((results / 'reconciliation.json').read_text())
        answers = json.loads((results / 'answers.json').read_text())
        remaining = json.loads((results / 'remaining.json').read_text())
        if recovery.get('sourceManifestHash') != sha(manifest) or recovery.get('sourceRevision') != manifest['revision']:
            raise ValueError('Recovery source manifest differs')
        if recovery.get('answersHash') != sha(answers) or recovery.get('remainingHash') != sha(remaining):
            raise ValueError('Recovery bundle hash differs')
        if (recovery.get('total'), recovery.get('complete'), recovery.get('remaining')) != (len(cases),len(answers),len(remaining)):
            raise ValueError('Recovery counts differ')
        for answer in answers:
            key = answer['id']
            if key not in cases or key in saved or answer.get('inputHash') != sha(cases[key]):
                raise ValueError('Recovery answer coverage/input differs')
            saved[key] = answer
        remaining_ids = [case['id'] for case in remaining]
        if len(set(remaining_ids)) != len(remaining_ids) or set(remaining_ids) != set(cases) - set(saved):
            raise ValueError('Recovery remaining coverage differs')
        if any(case != cases[case['id']] for case in remaining):
            raise ValueError('Recovery remaining input differs')
        records = []
        for key, case in sorted(cases.items()):
            row = record(run_id, case)
            if key in saved:
                answer = saved[key]
                row['data'].update(status='complete', answer=answer['answer'], resultSha256=answer['resultHash'],
                                   recipe=answer['recipe'], resultPath=answer['path'], error=None)
            else:
                row['data']['error'] = recovery.get('remainingReasons', {}).get(case['id'], 'No valid completed result in recovery export; see recovery failureReasons')
            records.append(row)
    else:
        for path in results.rglob('case-*.json'):
            if path.name.endswith('.attempt.json'):
                continue
            key = path.stem
            if key not in cases or key in saved:
                raise ValueError('Extra or duplicate final result: ' + str(path))
            saved[key] = json.loads(path.read_text())
        records = [record(run_id, case, saved.get(key)) for key, case in sorted(cases.items())]
    if recovery is None:
        answers = [dict(id=r['data']['case']['id'], inputHash=r['data']['inputSha256'], answer=r['data']['answer'],
                        resultHash=r['data']['resultSha256'], recipe=r['data']['recipe'], path=r['data']['resultPath'])
                   for r in records if r['data']['status'] == 'complete']
        remaining_ids = [r['data']['case']['id'] for r in records if r['data']['status'] != 'complete']
        recovery = dict(total=len(records), complete=len(answers), remaining=len(remaining_ids),
                        answersHash=sha(answers), remainingHash=sha([cases[cid] for cid in remaining_ids]),
                        sourceRevision=manifest['revision'], sourceManifestHash=sha(manifest),
                        failureReasons={r['data']['case']['id']: r['data']['error'] for r in records if r['data']['status'] != 'complete'})
    audit_receipt = None
    if audit_directory is not None:
        from proposal_audits import attach
        audit_receipt = attach(records, audit_directory, manifest)
    return {'parentRevision': parent['revision'],
            'proposalAuditReceipt': audit_receipt,
            'description': 'Unaccepted identity proposals, including failed and missing results; existing graph facts unchanged.',
            'proposalRecoveryReceipt': recovery,
            'proposalRecoveryOrder': {'answers': [a['id'] for a in answers], 'remaining': remaining_ids} if recovery else None,
            'proposalInputManifest': manifest,
            'proposalInputFileCases': file_cases,
            'proposalInputManifestSha256': sha(manifest),
            'records': records}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('inputs', 'results', 'parent_manifest', 'output'):
        p.add_argument(name, type=Path)
    p.add_argument('--run-id', required=True)
    p.add_argument('--audit-directory', type=Path)
    a = p.parse_args()
    value = build(a.inputs, a.results, json.loads(a.parent_manifest.read_text()), a.run_id, a.audit_directory)
    text = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    if a.output.exists() and a.output.read_text() != text:
        raise ValueError('Refusing to replace different output')
    a.output.write_text(text)
