"""Reconcile completed readings and keep recovery separate from original attempts."""
from pathlib import Path
import modal

HERE = Path(__file__).parent
app = modal.App('talmud-identity-recovery')
volume = modal.Volume.from_name('talmud-identity-wide-review')
image = (modal.Image.debian_slim(python_version='3.12').apt_install('curl')
         .add_local_file(HERE/'runner.py', '/app/runner.py')
         .add_local_file(HERE/'wide_job.py', '/app/wide_job.py'))

@app.function(image=image, volumes={'/data': volume}, cpu=2, memory=2048, timeout=1800)
def reconcile():
    import sys, json, hashlib, collections
    from concurrent.futures import ThreadPoolExecutor
    sys.path.insert(0, '/app')
    from runner import digest, validate, atomic
    volume.reload()
    root = Path('/data')
    manifest = json.loads((root/'inputs/manifest.json').read_text())
    def read_shard(item):
        name, expected = item
        path = root/'inputs'/name
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Input checksum differs')
        good, missing, errors, interrupted = [], [], [], []
        for case in json.loads(path.read_text()):
            answer = None
            paths = [root/'results'/path.stem/stage/(case['id']+'.json') for stage in ['first', 'retry']]
            paths += [root/'recovery-v2/results'/(case['id']+'.json')]
            for saved in paths:
                if not saved.exists():
                    marker=saved.with_name(saved.stem+'.attempt.json')
                    if marker.exists():
                        attempt=json.loads(marker.read_text())
                        if attempt.get('inputHash') != digest(case):raise RuntimeError('Interrupted input hash differs')
                        interrupted.append({'id':case['id'],'path':str(marker.relative_to(root)),'started':attempt.get('started')})
                    continue
                d = json.loads(saved.read_text())
                checksum = d.pop('resultHash', None)
                if checksum != digest(d) or d.get('inputHash') != digest(case):
                    raise RuntimeError('Saved result checksum differs: '+str(saved))
                if d['status'] == 'complete':
                    validate(case, d['answer'])
                    answer = {'id':case['id'], 'inputHash':d['inputHash'], 'answer':d['answer'], 'resultHash':checksum, 'recipe':d['recipe'], 'path':str(saved.relative_to(root))}
                else:
                    errors.append({'id':case['id'], 'stage':str(saved.relative_to(root)), 'error':d.get('error')})
            if answer is None:
                missing.append(case)
            else:
                good.append(answer)
        return good, missing, errors, interrupted
    good, missing, errors, interrupted = [], [], [], []
    with ThreadPoolExecutor(max_workers=16) as pool:
        for a,b,c,d in pool.map(read_shard, manifest['inputFiles'].items()):
            good.extend(a); missing.extend(b); errors.extend(c); interrupted.extend(d)
    if len(good)+len(missing) != manifest['cases']:
        raise RuntimeError('Case accounting differs')
    dest = root/'recovery-v2'
    if not (dest/'inputs.json').exists():
        atomic(dest/'inputs.json', missing)
        atomic(dest/'queue-manifest.json', {'inputHash':digest(missing),'sourceManifestHash':digest(manifest),'interruptedAttempts':interrupted,'retryAuthorization':'Recovery requested after original workers finished; unknown earlier charges are retained, not counted as zero.'})
    queue=json.loads((dest/'inputs.json').read_text())
    binding=json.loads((dest/'queue-manifest.json').read_text())
    if digest(queue)!=binding['inputHash'] or digest(manifest)!=binding['sourceManifestHash']:raise RuntimeError('Recovery queue integrity differs')
    atomic(dest/'answers.json',good)
    atomic(dest/'remaining.json',missing)
    atomic(dest/'errors.json',errors)
    report = {'total':manifest['cases'], 'complete':len(good), 'remaining':len(missing), 'answersHash':digest(good), 'remainingHash':digest(missing), 'sourceRevision':manifest['revision'], 'sourceManifestHash':digest(manifest), 'failureReasons':dict(collections.Counter(e['error'] for e in errors))}
    atomic(dest/'reconciliation.json', report)
    volume.commit()
    return report

@app.function(image=image, volumes={'/data':volume}, secrets=[modal.Secret.from_name('talmud-identity-wide-review')],cpu=1,memory=1024,timeout=7200,max_containers=1,retries=0)
def recover():
    import sys,json
    sys.path.insert(0,'/app')
    from runner import run, GUIDE, digest
    from wide_job import RULES
    volume.reload()
    root=Path('/data/recovery-v2')
    binding=json.loads((root/'queue-manifest.json').read_text())
    if digest(json.loads((root/'inputs.json').read_text()))!=binding['inputHash'] or digest(json.loads(Path('/data/inputs/manifest.json').read_text()))!=binding['sourceManifestHash']:raise RuntimeError('Recovery queue integrity differs')
    return run(root/'inputs.json',root/'results',volume.commit,limit=100,excluded_providers=('decart/fp4',),max_premium=1.5,concurrency=32,max_tokens=32768,guide=GUIDE+RULES,budget_reserve=4)

@app.function(image=image,volumes={'/data':volume},cpu=1,memory=1024,timeout=900)
def finalize():
    """Merge a verified snapshot with the small recovery run without rescanning all responses."""
    import sys,json,collections,hashlib
    sys.path.insert(0,'/app')
    from runner import digest,validate,atomic
    volume.reload();root=Path('/data');dest=root/'recovery-v2'
    original=json.loads((root/'inputs/manifest.json').read_text())
    binding=json.loads((dest/'queue-manifest.json').read_text())
    queued=json.loads((dest/'inputs.json').read_text())
    if digest(queued)!=binding['inputHash'] or digest(original)!=binding['sourceManifestHash']:
        raise RuntimeError('Recovery queue integrity differs')
    previous=json.loads((dest/'reconciliation.json').read_text())
    answers=json.loads((dest/'answers.json').read_text())
    remaining=json.loads((dest/'remaining.json').read_text())
    if digest(answers)!=previous['answersHash'] or digest(remaining)!=previous['remainingHash']:
        raise RuntimeError('Snapshot integrity differs')
    if previous.get('sourceManifestHash',binding['sourceManifestHash'])!=digest(original):
        raise RuntimeError('Snapshot source binding differs')
    baseline_ids=[a['id'] for a in answers];queued_ids=[c['id'] for c in queued]
    if len(baseline_ids)!=len(set(baseline_ids)) or len(queued_ids)!=len(set(queued_ids)):
        raise RuntimeError('Duplicate snapshot or queue cases')
    if remaining!=[c for c in queued if c['id'] not in set(baseline_ids)]:
        raise RuntimeError('Snapshot remaining cases differ from queue')
    if previous['sourceRevision']!=original['revision'] or len(answers)+len(remaining)!=original['cases']:
        raise RuntimeError('Snapshot coverage differs')
    source_cases={}
    for name,expected in original['inputFiles'].items():
        raw=(root/'inputs'/name).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=expected:raise RuntimeError('Source input checksum differs')
        for case in json.loads(raw):
            if case['id'] in source_cases:raise RuntimeError('Duplicate source case')
            source_cases[case['id']]=case
    if set(source_cases)!=set(baseline_ids)|set(queued_ids):raise RuntimeError('Snapshot source coverage differs')
    if any(case!=source_cases[case['id']] for case in queued):raise RuntimeError('Queued source differs')
    recipes={}
    for answer in answers:
        if answer['inputHash']!=digest(source_cases[answer['id']]):raise RuntimeError('Baseline source differs')
        validate(source_cases[answer['id']],answer['answer'])
        if 'recipe' not in answer:
            folder=str(Path(answer['path']).parent)
            if folder not in recipes:
                recipes[folder]=json.loads((root/folder/'manifest.json').read_text())['recipe']
            answer['recipe']=recipes[folder]
    indexed={a['id']:a for a in answers}
    errors=[]
    for case in queued:
        path=dest/'results'/(case['id']+'.json')
        if not path.exists():continue
        d=json.loads(path.read_text());checksum=d.pop('resultHash',None)
        if checksum!=digest(d) or d.get('inputHash')!=digest(case):raise RuntimeError('Recovery result integrity differs')
        if d['status']=='complete':
            validate(case,d['answer'])
            indexed[case['id']]={'id':case['id'],'inputHash':d['inputHash'],'answer':d['answer'],'resultHash':checksum,'recipe':d['recipe'],'path':str(path.relative_to(root))}
        else:errors.append({'id':case['id'],'error':d.get('error')})
    answers=list(indexed.values());remaining=[c for c in queued if c['id'] not in indexed]
    if len(answers)+len(remaining)!=original['cases']:raise RuntimeError('Final coverage differs')
    report={'total':original['cases'],'complete':len(answers),'remaining':len(remaining),'answersHash':digest(answers),'remainingHash':digest(remaining),'sourceRevision':original['revision'],'sourceManifestHash':digest(original),'failureReasons':dict(collections.Counter(e['error'] for e in errors)), 'remainingReasons':{c['id']:next((e['error'] for e in errors if e['id']==c['id']), 'Interrupted or no final recovery result') for c in remaining}}
    atomic(dest/'answers.json',answers);atomic(dest/'remaining.json',remaining);atomic(dest/'reconciliation.json',report);volume.commit()
    return report
