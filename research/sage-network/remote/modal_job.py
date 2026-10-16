"""Keep source review execution and checkpoints independent of a local terminal."""
import os
from pathlib import Path
import modal

HERE=Path(__file__).parent
INPUTS=Path(os.environ.get('REVIEW_INPUTS','/Users/shaunie/Documents/Talmud/results/remote-identity-pilot-v1/inputs.json'))
app=modal.App('talmud-source-review-pilot')
volume=modal.Volume.from_name('talmud-source-review-pilot',create_if_missing=True)
image=modal.Image.debian_slim(python_version='3.12').apt_install('curl').add_local_file(HERE/'runner.py','/app/runner.py').add_local_file(INPUTS,'/app/inputs.json').add_local_file(INPUTS.parent/'recovery/inputs.json','/app/recovery.json').add_local_file(INPUTS.parent/'repair/inputs.json','/app/repair.json')

@app.function(image=image,volumes={'/results':volume},cpu=0.125,memory=256,timeout=60)
def inspect_inputs():
    import json,hashlib
    p=Path('/app/inputs.json')
    return {'cases':len(json.loads(p.read_text())),'inputSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'savedFiles':[p.name for p in Path('/results').glob('pilot/*')]}

@app.function(image=image,volumes={'/results':volume},secrets=[modal.Secret.from_name('talmud-source-review-pilot')],cpu=0.125,memory=256,timeout=86400,max_containers=1,retries=0)
def review():
    import sys
    sys.path.insert(0,'/app')
    from runner import run
    return run('/app/inputs.json','/results/pilot',volume.commit)

@app.function(image=image,volumes={'/results':volume},secrets=[modal.Secret.from_name('talmud-source-review-pilot')],cpu=0.125,memory=256,timeout=86400,max_containers=1,retries=0)
def recover():
    import sys
    sys.path.insert(0,'/app')
    from runner import run
    return run('/app/recovery.json','/results/recovery',volume.commit,excluded_providers=('decart/fp4',),max_premium=1.5,concurrency=4)

@app.function(image=image,volumes={'/results':volume},secrets=[modal.Secret.from_name('talmud-source-review-pilot')],cpu=0.125,memory=256,timeout=86400,max_containers=1,retries=0)
def repair():
    import sys,json
    sys.path.insert(0,'/app')
    from runner import run,atomic,digest
    reports=[]
    inputs=Path('/app/repair.json')
    for wave,tokens in [(1,16384),(2,32768)]:
        output=Path('/results')/f'repair-{wave}'
        report=run(inputs,output,volume.commit,excluded_providers=('decart/fp4',),max_premium=1.5,concurrency=4,max_tokens=tokens)
        reports.append(report)
        if report.get('stopReason') or 'complete' not in report:break
        cases=json.loads(inputs.read_text());remaining=[]
        for case in cases:
            path=output/(case['id']+'.json')
            # Do not resend an interrupted, possibly billed request automatically.
            if not path.exists():continue
            result=json.loads(path.read_text());checksum=result.pop('resultHash',None)
            if checksum!=digest(result):raise RuntimeError('Repair result checksum failed')
            if result['status']!='complete':remaining.append(case)
        if not remaining or wave==2:break
        inputs=Path('/results/repair-2-inputs.json')
        atomic(inputs,remaining);volume.commit()
    atomic(Path('/results/repair-summary.json'),{'waves':reports});volume.commit()
    return reports

@app.function(image=image,volumes={"/results":volume},cpu=0.125,memory=256,timeout=60)
def status(folder="pilot"):
    if folder not in ("pilot","recovery","repair-1","repair-2"):raise ValueError("Unknown run")
    import json
    volume.reload()
    root=Path('/results')/folder
    summary={"completed":0,"failed":0,"attempted":len(list(root.glob('*.attempt.json'))),"cost":0.0,"costMissing":0,"inputTokens":0,"outputTokens":0}
    for path in root.glob('case-*.json'):
        if path.name.endswith('.attempt.json'):continue
        d=json.loads(path.read_text())
        summary['completed' if d.get('status')=='complete' else 'failed']+=1
        usage=d.get('response',{}).get('usage',{})
        if usage.get('cost') is None:summary['costMissing']+=1
        else:summary['cost']+=usage['cost']
        summary['inputTokens']+=usage.get('prompt_tokens',0)
        summary['outputTokens']+=usage.get('completion_tokens',0)
    for name in ['progress','summary','manifest']:
        p=root/(name+'.json')
        if p.exists():summary[name]=json.loads(p.read_text())
    return summary
