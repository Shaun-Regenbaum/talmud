"""Review saved named occurrences in bounded, resumable lanes."""
from pathlib import Path
import modal

HERE=Path(__file__).parent
app=modal.App('talmud-identity-wide-review')
volume=modal.Volume.from_name('talmud-identity-wide-review',create_if_missing=True)
locks=modal.Dict.from_name('talmud-identity-wide-review-locks',create_if_missing=True)
image=modal.Image.debian_slim(python_version='3.12').apt_install('curl').add_local_file(HERE/'runner.py','/app/runner.py')
RULES=''' Candidate lists can be incomplete and can contain duplicate records. Never choose someone only because they are the sole candidate from an era, or because other candidates have longer names. If multiple records plausibly describe the same person, leave the choice unresolved and explain the duplicate. A full matching name is useful evidence but does not override conflicting relatives or chronology. Partners with short names can themselves be namesakes: do not assume their identities to prove a date. Distinguish the target named person from their father, son, or someone quoting them. Registry biographies and generation labels may be wrong; flag contradictions and leave disputed identities unresolved. Keep the explanation concise and quote only the short exact text needed. Do not invent a new person ID. An unresolved identity does not reject the interaction.'''

@app.function(image=image,volumes={'/data':volume},secrets=[modal.Secret.from_name('talmud-identity-wide-review')],cpu=1,memory=1024,timeout=86400,max_containers=8,retries=0)
def review_lane(lane:int):
    if lane not in range(8):raise ValueError('Unknown lane')
    if not locks.put(str(lane),'running',skip_if_exists=True):raise RuntimeError('Lane already running or awaiting recovery')
    try:
        volume.reload()
        return run_lane(lane)
    finally:
        locks.pop(str(lane))

def run_lane(lane):
    import sys,json,hashlib,time
    sys.path.insert(0,'/app')
    from runner import run,atomic,digest,GUIDE
    root=Path('/data');inputs=root/'inputs';manifest=json.loads((inputs/'manifest.json').read_text())
    reports=[]
    for index,path in enumerate(sorted(inputs.glob('inputs-*.json'))):
        if index%8!=lane:continue
        if hashlib.sha256(path.read_bytes()).hexdigest()!=manifest['inputFiles'][path.name]:raise RuntimeError('Input checksum differs')
        base=root/'results'/path.stem
        report=run(path,base/'first',volume.commit,limit=100,excluded_providers=('decart/fp4',),max_premium=1.5,concurrency=32,max_tokens=16384,guide=GUIDE+RULES,budget_reserve=25.6)
        reports.append({'shard':path.name,'first':report})
        atomic(root/f'lane-{lane}.json',{'status':'running','reports':reports,'updated':time.time()});volume.commit()
        if report.get('stopReason') or 'complete' not in report:return reports
        remaining=[]
        for case in json.loads(path.read_text()):
            result_path=base/'first'/(case['id']+'.json')
            if not result_path.exists():continue
            result=json.loads(result_path.read_text());checksum=result.pop('resultHash',None)
            if checksum!=digest(result):raise RuntimeError('Saved result checksum differs')
            if result['status']!='complete':remaining.append(case)
        if remaining:
            retry_input=base/'retry-inputs.json'
            atomic(retry_input,remaining);volume.commit()
            retry=run(retry_input,base/'retry',volume.commit,limit=100,excluded_providers=('decart/fp4',),max_premium=1.5,concurrency=32,max_tokens=32768,guide=GUIDE+RULES,budget_reserve=25.6)
            reports[-1]['retry']=retry
            if retry.get('stopReason') or 'complete' not in retry:
                atomic(root/f'lane-{lane}.json',{'status':'stopped','reports':reports,'updated':time.time()});volume.commit();return reports
    atomic(root/f'lane-{lane}.json',{'status':'finished','reports':reports,'updated':time.time()});volume.commit()
    return reports

@app.function(image=image,volumes={'/data':volume},cpu=0.125,memory=256,timeout=120)
def status():
    import json
    volume.reload();root=Path('/data');out={'lanes':{},'completed':0,'failed':0,'attempted':0,'cost':0.,'costMissing':0}
    for p in root.glob('lane-*.json'):out['lanes'][p.stem]=json.loads(p.read_text())
    results={}
    for p in (root/'results').glob('*/*/case-*.json'):
        if p.name.endswith('.attempt.json'):out['attempted']+=1;continue
        d=json.loads(p.read_text());k=p.name
        if k not in results or d['status']=='complete':results[k]=d['status']
        cost=d.get('response',{}).get('usage',{}).get('cost')
        if cost is None:out['costMissing']+=1
        else:out['cost']+=cost
    out['completed']=sum(v=='complete' for v in results.values());out['failed']=sum(v!='complete' for v in results.values())
    return out

@app.function(image=image,volumes={'/data':volume},cpu=0.5,memory=512,timeout=300)
def initialize():
    import json,zipfile,hashlib
    root=Path('/data');volume.reload()
    if (root/'results').exists():raise RuntimeError('Review already started')
    with zipfile.ZipFile(root/'inputs.zip') as archive:
        for info in archive.infolist():
            if Path(info.filename).name!=info.filename:raise RuntimeError('Unexpected archive path')
            dest=root/'inputs'/info.filename;dest.parent.mkdir(exist_ok=True);dest.write_bytes(archive.read(info))
    manifest=json.loads((root/'inputs/manifest.json').read_text())
    for name,expected in manifest['inputFiles'].items():
        if hashlib.sha256((root/'inputs'/name).read_bytes()).hexdigest()!=expected:raise RuntimeError('Input checksum differs')
    volume.commit()
    return {'cases':manifest['cases'],'shards':len(manifest['inputFiles'])}

@app.function(image=image,volumes={'/data':volume},cpu=0.125,memory=256,timeout=120)
def progress_snapshot():
    import json,time
    volume.reload();root=Path('/data');out={'checkedAt':time.time(),'completed':0,'unresolvedFailures':0,'shards':{}}
    for shard in sorted((root/'results').glob('inputs-*')):
        reads={}
        for stage in ['first','retry']:
            path=shard/stage/'progress.json'
            if path.exists():reads[stage]=json.loads(path.read_text())
        first=reads.get('first',{});retry=reads.get('retry',{})
        out['completed']+=first.get('complete',0)+retry.get('complete',0)
        out['unresolvedFailures']+=max(0,first.get('failed',0)-retry.get('complete',0))
        out['shards'][shard.name]=reads
    return out
