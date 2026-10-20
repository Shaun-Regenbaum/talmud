"""Import whole checked source readings as local proposals, never historical facts."""
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compact_source_v2.validate import check, check_saved, digest, recipe_binding, sha

VERSION = 'source-reading-import-v1'
KINDS = {'source_reading', 'passage', 'person', 'claim'}


def require(value, message):
    if not value:
        raise ValueError(message)


def occurrence_key(source, start, end):
    """Source occurrence identity does not depend on a reader's person grouping."""
    return 'occ-' + digest([source['edition'], source['provenance']['segment_id'],
                            source['sha256'], start, end])


def checked_bundle(bundle):
    require(set(bundle) == {'job', 'config', 'result', 'amendment', 'inputProof'}, 'Unexpected bundle fields')
    job, config, result = (bundle[k] for k in ('job', 'config', 'result'))
    require(result['resultHash'] == digest({k: v for k, v in result.items() if k != 'resultHash'}), 'Changed queue result')
    require(result['manifestHash'] == digest(config), 'Changed queue configuration')
    require(result['jobHash'] == digest(job) and result['jobId'] == job['job_id'], 'Changed source job')
    for name, value in recipe_binding()['files'].items():
        require(config['recipeFiles'].get('compact_source/' + name) == value, 'Different frozen recipe')
    proof = bundle['inputProof']
    require(config['inputManifestHash'] == digest(proof['manifest']), 'Changed input manifest')
    matching = [s for s in proof['manifest']['shards'] if s['file'] == proof['file']]
    require(len(matching) == 1 and matching[0]['sha256'] == proof['sha256'], 'Shard not in input manifest')
    require(type(proof['index']) is int and 0 <= proof['index'] < matching[0]['jobs'], 'Invalid shard job index')
    choices = result['response']['choices']
    require(len(choices) == 1 and choices[0]['finish_reason'] == 'stop', 'Incomplete provider response')
    original = json.loads(choices[0]['message']['content'])
    amendment = bundle['amendment']
    if amendment is None:
        require(result.get('answer') == original, 'Answer differs from original response')
        compiled = check_saved(job, result['compiled'])
        require(compiled['answer'] == original, 'Compiled answer differs from original response')
    else:
        from anchor_repair_v2 import amend
        require(amendment == amend(job, original), 'Amendment differs from strict replay')
        compiled = amendment['compiled']
    sources = job['sources']
    focal = [s for s in sources if s.get('provenance', {}).get('focal') is True]
    require(len(focal) == 1 and focal[0]['ref'] == job['focal_ref'], 'Exactly one primary source required')
    for source in sources:
        require(isinstance(source.get('edition'), str) and bool(source['edition']), 'Source edition missing')
        provenance = source.get('provenance', {})
        for name in ('segment_id', 'raw_file_sha256', 'source_url'):
            require(isinstance(provenance.get(name), str) and bool(provenance[name]), 'Source provenance missing')
        require(provenance['source_url'].startswith('https://'), 'Source URL missing')
    require(len({(s['edition'], s['provenance']['segment_id']) for s in sources}) == len(sources), 'Duplicate source segment')
    return compiled, focal[0]


def records(bundle):
    compiled, focal = checked_bundle(bundle)
    job, answer = bundle['job'], compiled['record']
    # This identifies a reading, not a historical person or a source occurrence.
    pid = 'sr1-' + digest([compiled['job_sha256'], compiled['recipe']['sha256'], compiled['answer_sha256']])
    sid = 'source_reading:' + pid
    sources = {s['source_id']: s for s in job['sources']}
    focal_index = job['sources'].index(focal)
    source = {'before': '\n'.join(s['text'] for s in job['sources'][:focal_index]),
              'passage': focal['text'], 'after': '\n'.join(s['text'] for s in job['sources'][focal_index + 1:])}
    locations = {s['source_id']: ('before' if i < focal_index else 'passage' if i == focal_index else 'after')
                 for i, s in enumerate(job['sources'])}
    anchors = {}
    for anchor in compiled['resolved_anchors']:
        s = sources[anchor['source_id']]
        item = copy.deepcopy(anchor)
        item.update(occurrenceKey=occurrence_key(s, anchor['start'], anchor['end']),
                    ref=s['ref'], edition=s['edition'], segmentId=s['provenance']['segment_id'],
                    location=locations[anchor['source_id']], primary=s is focal)
        anchors[anchor['path']] = item
    people = []
    for person in answer['people']:
        mentions = [anchors[f"people/{person['id']}/mentions/{i}"] for i in range(len(person['mentions']))]
        first = next((m for m in mentions if m['primary']), mentions[0])
        people.append(dict(id=person['id'], label=person['label'], named={'named': 'name', 'embedded_parent': 'father_of_named', 'unnamed': 'unnamed', 'generic': 'unnamed'}[person['form']],
                           quote=first['quote'], quoteLocation=first['location'], mentions=mentions,
                           reading=copy.deepcopy(person), sourceReadingId=sid, historicalIdentityResolved=False,
                           identityStatus='local', accepted=False))
    claims = []
    claim_records = []
    for relation in answer['relationships']:
        evidence = [anchors[f"relationships/{relation['id']}/evidence/{i}"] for i in range(len(relation['evidence']))]
        first = next((e for e in evidence if e['primary']), evidence[0])
        claim = dict(id=relation['id'], field='relations', relation='other:' + relation['relation'],
                     a=relation['subject'], b=relation['object'], quote=first['quote'], quoteLocation=first['location'],
                     note=relation['reason'], basis='source_reading', reading=copy.deepcopy(relation))
        claims.append(claim)
        participants = [dict(id=p['id'], localId=pid + '/' + p['id'], label=p['label'], named=p['named'],
                             quote=p['quote'], quoteLocation=p['quoteLocation'], historicalId=None)
                        for p in people if p['id'] in (relation['subject'], relation['object'])]
        claim_records.append(dict(id=pid + '/' + relation['id'], passageId=pid, ref=job['focal_ref'],
                                  claim=claim, participants=participants, evidence=evidence,
                                  classification=dict(decision='needs_review', flags=[], groups=[], id=relation['id'], mode='source_reading'),
                                  graphReady=False, historicalIdentityStatus='unresolved', accepted=False,
                                  sourceReadingId=sid, reviewReasons=['Initial source reading; not independently confirmed.']))
    passage = dict(id=pid, ref=job['focal_ref'], source=source, people=people, claims=claims,
                   sourceReadingId=sid, sourceSegments=copy.deepcopy(job['sources']))
    out = []
    def add(kind, ident, data, subject=None, object_=None):
        out.append(dict(record_id=kind + ':' + ident, kind=kind, passage_id=pid, ref=job['focal_ref'],
                        subject_id=subject, object_id=object_, authority='screening', decision='needs_review', data=data))
    add('passage', pid, passage)
    for person in people:
        add('person', pid + '/' + person['id'], person)
    for claim in claim_records:
        rel = claim['claim']
        add('claim', claim['id'], claim, pid + '/' + rel['a'] if rel['a'] else None, pid + '/' + rel['b'] if rel['b'] else None)
    add('source_reading', pid, dict(version=VERSION, passageId=pid, ref=job['focal_ref'],
                                   episode=copy.deepcopy(answer['episode']),
                                   provenance=dict(artifactBucket='talmud-source-evidence',
                                       artifactKey='source-readings/v1/artifacts/' + digest(bundle) + '.json',
                                       artifactSha256=digest(bundle),
                                       artifactBytes=len(json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()),
                                       artifactMediaType='application/json',
                                       jobSha256=compiled['job_sha256'], recipe=compiled['recipe'],
                                       sourceSha256=compiled['source_sha256'],
                                       inputProof=copy.deepcopy(bundle['inputProof']),
                                       resultSha256=bundle['result']['resultHash'],
                                       rawResponseSha256=digest(bundle['result']['response']),
                                       originalAnswerSha256=digest(json.loads(bundle['result']['response']['choices'][0]['message']['content'])),
                                       amendedAnswerSha256=compiled['answer_sha256'],
                                       amendmentReceiptSha256=bundle['amendment']['receipt']['receiptSha256'] if bundle['amendment'] else None,
                                       compiledSha256=digest(compiled)),
                                   acceptedIdentity=False, acceptedEra=False, confirmedConnections=False,
                                   occurrenceKeys=sorted({a['occurrenceKey'] for a in anchors.values() if a['path'].startswith('people/')}),
                                   primaryOccurrenceKeys=sorted({a['occurrenceKey'] for a in anchors.values() if a['primary'] and a['path'].startswith('people/')}),
                                   primaryEvidenceKeys=sorted({a['occurrenceKey'] for a in anchors.values() if a['primary'] and a['path'].startswith('relationships/')})))
    return out


def changes_for(bundles, parent_revision, input_artifacts, existing=None):
    """Existing rows are immutable; exact repeats become no-ops."""
    existing = existing or {}
    expected = {}
    require(isinstance(bundles, list) and bool(bundles), 'No source readings')
    used = set()
    for bundle in bundles:
        proof = bundle['inputProof']
        raw = input_artifacts.get(proof['sha256'])
        require(isinstance(raw, str) and sha(raw) == proof['sha256'], 'Missing or changed frozen shard')
        jobs = [json.loads(line) for line in raw.splitlines() if line.strip()]
        matching = [s for s in proof['manifest']['shards'] if s['file'] == proof['file']]
        require(len(matching) == 1 and len(jobs) == matching[0]['jobs'], 'Shard job count differs')
        require(type(proof['index']) is int and 0 <= proof['index'] < len(jobs) and jobs[proof['index']] == bundle['job'], 'Job not in frozen shard')
        used.add(proof['sha256'])
        for item in records(bundle):
            key = item['record_id']
            require(key not in expected, 'Duplicate source reading')
            expected[key] = item
    require(set(input_artifacts) == used, 'Unexpected input artifacts')
    changed = []
    for key, item in expected.items():
        old = existing.get(key)
        if old is not None:
            require(old == item, 'Existing source record differs: ' + key)
        else:
            changed.append(item)
    return dict(parentRevision=parent_revision, description="Add initial local name and relationship proposals from checked source readings", sourceReadingVersion=VERSION,
                sourceReadingBundles=copy.deepcopy(bundles), sourceReadingInputs=copy.deepcopy(input_artifacts), records=changed)


def validate_changes(changes, rows):
    require(changes.get('sourceReadingVersion') == VERSION, 'Unknown source reading import')
    existing = {}
    for key, row in rows.items():
        existing[key] = dict(record_id=key, kind=row[1], passage_id=row[2], ref=row[3],
                             subject_id=row[4], object_id=row[5], authority=row[6], decision=row[7], data=json.loads(row[-1]))
    expected = changes_for(changes['sourceReadingBundles'], changes['parentRevision'], changes['sourceReadingInputs'], existing)
    require(changes['records'] == expected['records'], 'Source reading records differ from strict reconstruction')


def analysis_projection(items):
    """Union exact primary anchors; keep conflicting local groupings as proposals."""
    occurrences, evidence, people, claims = {}, {}, [], []
    for item in items:
        data = item['data']
        if item['kind'] == 'person':
            people.append(dict(personKey=item['record_id'][len('person:'):], label=data['label'],
                               reason=data['reading']['reason'], alternatives=data['reading']['alternatives'],
                               occurrenceKeys=[m['occurrenceKey'] for m in data['mentions']],
                               status='initial_proposal'))
            for anchor in data['mentions']:
                if anchor['primary']:
                    occurrences.setdefault(anchor['occurrenceKey'], dict(ref=anchor['ref'], quote=anchor['quote'],
                        start=anchor['start'], end=anchor['end'], offsetUnit=anchor['offset_unit'], sourceSha256=anchor['source_sha256'], personProposals=[]))['personProposals'].append(item['record_id'])
        elif item['kind'] == 'claim':
            claims.append(dict(claimKey=item['record_id'], passageId=item['passage_id'],
                               relationship=data['claim']['reading'], status='initial_proposal'))
            for anchor in data['evidence']:
                if anchor['primary']:
                    evidence.setdefault(anchor['occurrenceKey'], dict(ref=anchor['ref'], quote=anchor['quote'],
                        start=anchor['start'], end=anchor['end'], offsetUnit=anchor['offset_unit'], sourceSha256=anchor['source_sha256'], claimProposals=[]))['claimProposals'].append(item['record_id'])
    for collection, field in ((occurrences, 'personProposals'), (evidence, 'claimProposals')):
        for value in collection.values():
            value[field] = sorted(set(value[field]))
    return dict(version=VERSION, people=people, relationships=claims,
                primaryOccurrences=occurrences, primaryEvidence=evidence,
                acceptedIdentity=False, acceptedEra=False, confirmedConnections=False)


def main():
    import argparse
    import sqlite3
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, required=True, help='Frozen bundles plus inputArtifacts')
    parser.add_argument('--parent-db', type=Path, required=True)
    parser.add_argument('--parent-revision', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    capture = json.loads(args.capture.read_text())
    bundles, held = [], []
    for bundle in capture['bundles']:
        try:
            checked_bundle(bundle)
        except (ValueError, KeyError, TypeError) as error:
            held.append(dict(jobId=bundle.get('job', {}).get('job_id'), bundleSha256=digest(bundle),
                             status='needs_review', reason=str(error)))
        else:
            bundles.append(bundle)
    if not bundles:
        raise ValueError('No fully validated readings; no import created')
    with sqlite3.connect(args.parent_db.resolve().as_uri() + '?mode=ro', uri=True) as db:
        import shared_records
        table = shared_records.record_table(db)
        require(db.execute('SELECT state FROM sage_graph_revisions WHERE id=?', (args.parent_revision,)).fetchone() == ('verified',), 'Parent is not verified')
        columns = 'record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json'
        keys = [item['record_id'] for bundle in bundles for item in records(bundle)]
        rows = {}
        for start in range(0, len(keys), 100):
            chunk = keys[start:start + 100]
            query = f'SELECT {columns} FROM {table} WHERE revision_id=? AND record_id IN ({",".join("?" for _ in chunk)})'
            rows.update((r[0], r) for r in db.execute(query, (args.parent_revision, *chunk)))
    used = {b['inputProof']['sha256'] for b in bundles}
    inputs = {key: capture['inputArtifacts'][key] for key in used}
    # Rebuild against the parent, including exact-repeat handling.
    existing = {k: dict(record_id=k, kind=r[1], passage_id=r[2], ref=r[3], subject_id=r[4], object_id=r[5],
                        authority=r[6], decision=r[7], data=json.loads(r[-1])) for k, r in rows.items()}
    changes = changes_for(bundles, args.parent_revision, inputs, existing)
    validate_changes(changes, rows)
    args.output.mkdir(parents=True, exist_ok=False)
    artifacts = args.output / 'artifacts'
    artifacts.mkdir()
    for bundle in bundles:
        (artifacts / (digest(bundle) + '.json')).write_text(
            json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False))
    for name, value in [('changes.json', changes), ('held.json', held),
                        ('analysis.json', analysis_projection([item for b in bundles for item in records(b)]))]:
        (args.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
