"""Preserve remote identity answers as unaccepted, append-only research records."""
import copy
import hashlib
import json
import re


def sha(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def validate(data, passage):
    if set(data) != {'runId', 'case', 'inputSha256', 'sourceSha256', 'resultSha256', 'recipe', 'status', 'answer', 'error', 'accepted', 'generationBasis', 'resultPath', 'audit'}:
        raise ValueError('Unexpected proposal fields')
    from proposal_audits import validate_audit
    validate_audit(data, passage, validate)
    case = data['case']
    if not isinstance(data['runId'], str) or not re.fullmatch(r'[a-zA-Z0-9_-]+', data['runId']):
        raise ValueError('Invalid proposal run ID')
    if data['accepted'] is not False or data['generationBasis'] != 'candidate_metadata_not_verified':
        raise ValueError('Proposal cannot accept identity or dating')
    if data['inputSha256'] != sha(case) or data['sourceSha256'] != sha(passage['source']):
        raise ValueError('Proposal input/source hash differs')
    if case['source'] != passage['source'] or case['ref'] != passage['ref']:
        raise ValueError('Proposal source differs from parent')
    pid, local = case['personKey'].split('/')
    if pid != passage['id'] or case['person'] not in passage['people'] or case['person']['id'] != local:
        raise ValueError('Proposal person differs from parent')
    if not isinstance(case['id'], str) or not re.fullmatch(r'[a-zA-Z0-9_-]+', case['id']):
        raise ValueError('Invalid proposal case ID')
    candidates = {c['id']: c for c in case['candidates']}
    if len(candidates) != len(case['candidates']):
        raise ValueError('Duplicate candidate ID')
    if data['resultPath'] is not None and (not isinstance(data['resultPath'], str) or not data['resultPath']):
        raise ValueError('Invalid result path')
    status = data['status']
    if status not in {'complete', 'failed', 'missing'}:
        raise ValueError('Unknown result status')
    if status == 'missing':
        if data['resultSha256'] is not None or data['recipe'] is not None:
            raise ValueError('Missing result has receipt')
    elif not isinstance(data['resultSha256'], str) or not re.fullmatch('[0-9a-f]{64}', data['resultSha256']) or not isinstance(data['recipe'], str) or not data['recipe']:
        raise ValueError('Missing result provenance')
    if status != 'complete':
        if data['answer'] is not None or not isinstance(data['error'], str) or not data['error']:
            raise ValueError('Failed proposal must retain failure')
        return
    a = data['answer']
    if data['error'] is not None or not isinstance(a, dict) or set(a) != {'id','status','personId','generation','evidence','reason'} or a['id'] != case['id']:
        raise ValueError('Invalid proposal answer')
    if a['status'] == 'matched':
        if a['personId'] not in candidates or a['generation'] != candidates[a['personId']].get('generation'):
            raise ValueError('Answer differs from candidates')
    elif a['status'] != 'unresolved' or a['personId'] is not None or a['generation'] is not None:
        raise ValueError('Unresolved proposal contains identity')
    if not isinstance(a['reason'], str) or not a['reason'].strip() or not isinstance(a['evidence'], list) or not a['evidence']:
        raise ValueError('Missing proposal evidence/reason')
    for e in a['evidence']:
        if not isinstance(e, dict) or e.get('location') not in {'passage','before','after'} or not isinstance(e.get('quote'), str) or not e['quote'] or e['quote'] not in passage['source'][e['location']]:
            raise ValueError('Proposal quote differs')


def record(run_id, case, result=None):
    result_hash = None
    if result is not None:
        result = copy.deepcopy(result)
        result_hash = result.pop('resultHash', None)
        if result_hash != sha(result) or result.get('inputHash') != sha(case):
            raise ValueError('Result receipt/input mismatch: ' + case['id'])
        if result.get('status') not in {'complete','failed'}:
            raise ValueError('Invalid saved result status')
    data = dict(runId=run_id, case=case, inputSha256=sha(case), sourceSha256=sha(case['source']),
                resultSha256=result_hash, recipe=result.get('recipe') if result else None,
                status=result['status'] if result else 'missing', answer=result.get('answer') if result and result['status']=='complete' else None,
                error=(result.get('error') or 'Saved failed result') if result and result['status']=='failed' else ('No saved final result' if result is None else None),
                audit=None, resultPath=None, accepted=False, generationBasis='candidate_metadata_not_verified')
    return dict(record_id='identity_proposal:' + run_id + '/' + case['id'], kind='identity_proposal',
                passage_id=case['personKey'].split('/')[0], ref=case['ref'], subject_id='local:' + case['personKey'],
                object_id=None, authority='screening', decision='needs_review', data=data)
