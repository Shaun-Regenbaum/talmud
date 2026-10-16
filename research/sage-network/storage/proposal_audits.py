"""Attach source-grounded audit disagreements without accepting identities."""
import json
from identity_proposals import sha


def attach(records, directory, source_manifest):
    names = ('comparison.json', 'inputs.json', 'manifest.json', 'review-first-half.json', 'review-second-half.json')
    files = {name: json.loads((directory / name).read_text()) for name in names}
    manifest = files['manifest.json']
    inputs = files['inputs.json']
    if sha(inputs) != manifest['inputHash'] or manifest['sourceRevision'] != source_manifest['revision']:
        raise ValueError('Audit input/source binding differs')
    cases = {c['id']: c for c in inputs}
    if len(cases) != len(inputs) or len(inputs) != manifest['cases']:
        raise ValueError('Duplicate/missing audit inputs')
    by_id = {r['data']['case']['id']: r for r in records}
    for key, case in cases.items():
        if key not in by_id or by_id[key]['data']['case'] != case:
            raise ValueError('Audit case differs from proposal input')
    notes = {}
    for name in names[3:]:
        for note in files[name]:
            key = note['caseId']
            if key in notes:
                raise ValueError('Duplicate audit review')
            notes[key] = note
    disagreements = files['comparison.json']['disagreements']
    ids = [d['id'] for d in disagreements]
    if len(set(ids)) != len(ids) or set(ids) != set(notes):
        raise ValueError('Audit review coverage differs')
    receipt = {'fileHashes': {k: sha(v) for k,v in files.items()}, 'manifest': manifest,
               'disagreementIds': ids, 'accepted': False,
               'summary': {k: v for k, v in files['comparison.json'].items() if k != 'disagreements'},
               'annotationHashes': {item['id']: {'comparison': sha(item), 'review': sha(notes[item['id']])} for item in disagreements}}
    for item in disagreements:
        key = item['id']
        if key not in cases:
            raise ValueError('Unknown audit disagreement')
        row = by_id[key]
        if row['data']['answer'] != item['first']:
            raise ValueError('Audit original answer differs')
        row['data']['audit'] = dict(disagreement=True, accepted=False, comparison=item,
                                   review=notes[key], receiptSha256=sha(receipt),
                                   comparisonSha256=sha(item), reviewSha256=sha(notes[key]))
    return receipt


def validate_audit(data, passage, answer_validator):
    audit = data['audit']
    if audit is None:
        return
    if set(audit) != {'disagreement','accepted','comparison','review','receiptSha256','comparisonSha256','reviewSha256'} or audit['accepted'] is not False or audit['disagreement'] is not True:
        raise ValueError('Audit must remain held')
    comparison, note = audit['comparison'], audit['review']
    if sha(comparison) != audit['comparisonSha256'] or sha(note) != audit['reviewSha256']:
        raise ValueError('Audit annotation hash differs')
    if comparison['id'] != data['case']['id'] or note['caseId'] != comparison['id'] or comparison['first'] != data['answer']:
        raise ValueError('Audit case/answer differs')
    if comparison['ref'] != passage['ref'] or note['ref'] != passage['ref'] or note.get('accepted', False) is not False or note.get('disposition') not in {'held', 'clear_error', 'correctable'}:
        raise ValueError('Audit cannot confirm identity')
    second = dict(data, audit=None, answer=comparison['second'])
    answer_validator(second, passage)
    evidence = note.get('evidence', [])
    if 'supportingQuote' in note:
        evidence = [*evidence, {'location': note['quoteLocation'], 'quote': note['supportingQuote']}]
    if not evidence or not isinstance(note.get('finding'), str) or not note['finding'].strip():
        raise ValueError('Missing audit finding/evidence')
    for e in evidence:
        if e.get('location') not in {'passage','before','after'} or not isinstance(e.get('quote'), str) or not e['quote'] or e['quote'] not in passage['source'][e['location']]:
            raise ValueError('Audit quote differs')
