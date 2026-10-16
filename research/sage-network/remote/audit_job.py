"""Blind second readings of a random sample and harder identity cases."""
from pathlib import Path
import modal
HERE=Path(__file__).parent
app=modal.App('talmud-identity-accuracy-review')
source=modal.Volume.from_name('talmud-identity-wide-review')
output=modal.Volume.from_name('talmud-identity-accuracy-review',create_if_missing=True)
image=modal.Image.debian_slim(python_version='3.12').apt_install('curl').add_local_file(HERE/'runner.py','/app/runner.py').add_local_file(HERE/'wide_job.py','/app/wide_job.py').add_local_file('/Users/shaunie/Documents/Talmud/results/remote-identity-audit-v1/selection.json','/app/selection.json')

@app.function(image=image,volumes={'/source':source,'/audit':output},cpu=1,memory=1024,timeout=1800)
def prepare():
    import sys,json,hashlib
    from concurrent.futures import ThreadPoolExecutor
    sys.path.insert(0,'/app')
    from runner import digest,validate,atomic
    source.reload();output.reload();dest=Path('/audit')
    if (dest/'manifest.json').exists():
        old=json.loads((dest/'manifest.json').read_text())
        if 'referencesHash' in old:
            verify_prepared();return old
        if (dest/'first').exists():raise RuntimeError('Cannot replace an active audit')
    selection=json.loads(Path('/app/selection.json').read_text());wanted={c['id'] for group in ['randomPool','riskPool'] for c in selection[group]};cases={}
    manifest=json.loads(Path('/source/inputs/manifest.json').read_text())
    for name,h in manifest['inputFiles'].items():
        p=Path('/source/inputs')/name
        if hashlib.sha256(p.read_bytes()).hexdigest()!=h:raise RuntimeError('Source input checksum differs')
        for c in json.loads(p.read_text()):
            if c['id'] in wanted:cases[c['id']]=c
    def read(entry):
        case=cases[entry['id']]
        for stage in ['retry','first']:
            p=Path('/source/results')/entry['shard']/stage/(entry['id']+'.json')
            if not p.exists():continue
            result=json.loads(p.read_text());h=result.pop('resultHash',None)
            if digest(result)!=h or result['inputHash']!=digest(case):raise RuntimeError('Source result checksum differs')
            if result['status']=='complete':validate(case,result['answer']);return result['answer']
        return None
    selected=[];references=[];counts={};pending=[]
    for group,target in [('randomPool',300),('riskPool',200)]:
        pool=selection[group]
        with ThreadPoolExecutor(max_workers=16) as executor:answers=list(executor.map(read,pool))
        eligible=[(e,a) for e,a in zip(pool,answers) if a is not None][:target]
        counts[group]=len(eligible)
        for e,a in eligible:selected.append(cases[e['id']]);references.append({'id':e['id'],'group':group,'firstAnswer':a})
        pending.extend(e['id'] for e,a in zip(pool,answers) if a is None)
    if counts!={'randomPool':300,'riskPool':200}:raise RuntimeError('Not enough completed cases for requested sample')
    atomic(dest/'inputs.json',selected);atomic(dest/'references.json',references)
    result={'cases':len(selected),'counts':counts,'inputHash':digest(selected),'referencesHash':digest(references),'sourceRevision':manifest['revision'],'pendingSampleCases':pending,'limitations':['Random sample is conditional on results completed at selection time.','Hard-case sample is separate from the random sample.','Two readings agreeing is not an independent historical verification.','No production writes.']}
    atomic(dest/'manifest.json',result);output.commit();return result

@app.function(image=image,volumes={'/audit':output},secrets=[modal.Secret.from_name('talmud-identity-accuracy-review')],cpu=1,memory=1024,timeout=14400,max_containers=1,retries=0)
def review():
    import sys,json
    sys.path.insert(0,'/app')
    import runner
    from wide_job import RULES
    output.reload();root=Path('/audit')
    verify_prepared()
    runner.MODEL='google/gemini-3.8-flash'
    first=runner.run(root/'inputs.json',root/'first',output.commit,limit=20,concurrency=16,max_tokens=8192,guide=runner.GUIDE+RULES,budget_reserve=2)
    if first.get('stopReason') or 'complete' not in first:return first
    remaining=[]
    for case in json.loads((root/'inputs.json').read_text()):
        p=root/'first'/(case['id']+'.json')
        if not p.exists():continue
        d=json.loads(p.read_text());checksum=d.pop('resultHash',None)
        if checksum!=runner.digest(d):raise RuntimeError('Result checksum differs')
        if d['status']!='complete':remaining.append(case)
    if remaining:
        runner.atomic(root/'retry-inputs.json',remaining);output.commit()
        runner.run(root/'retry-inputs.json',root/'retry',output.commit,limit=20,concurrency=16,max_tokens=16384,guide=runner.GUIDE+RULES,budget_reserve=2)
    return summarize()

def verify_prepared():
    import sys,json
    sys.path.insert(0,'/app')
    from runner import digest
    root=Path('/audit');manifest=json.loads((root/'manifest.json').read_text())
    for file,key in [('inputs.json','inputHash'),('references.json','referencesHash')]:
        if digest(json.loads((root/file).read_text()))!=manifest[key]:raise RuntimeError('Prepared audit checksum differs')

def summarize():
    verify_prepared()
    import sys,json
    sys.path.insert(0,'/app')
    from runner import digest,validate,atomic
    root=Path('/audit');cases={c['id']:c for c in json.loads((root/'inputs.json').read_text())};refs=json.loads((root/'references.json').read_text());counts={};diff=[];missing=[];cost=0
    for ref in refs:
        answer=None
        for stage in ['first','retry']:
            p=root/stage/(ref['id']+'.json')
            if not p.exists():continue
            d=json.loads(p.read_text());h=d.pop('resultHash',None)
            if h!=digest(d) or d['inputHash']!=digest(cases[ref['id']]):raise RuntimeError('Audit checksum differs')
            cost+=d.get('response',{}).get('usage',{}).get('cost',0) or 0
            if d['status']=='complete':validate(cases[ref['id']],d['answer']);answer=d['answer']
        if answer is None:missing.append(ref['id']);continue
        same=answer['personId']==ref['firstAnswer']['personId'];key=ref['group']+('Agree' if same else 'Disagree');counts[key]=counts.get(key,0)+1
        if not same:diff.append({'id':ref['id'],'ref':cases[ref['id']]['ref'],'group':ref['group'],'first':ref['firstAnswer'],'second':answer})
    result={'counts':counts,'disagreements':diff,'missing':missing,'recordedCost':cost,'interpretation':'Agreement is not a verified accuracy score; source adjudication remains required.'}
    atomic(root/'comparison.json',result);output.commit();return result

@app.function(image=image,volumes={'/audit':output},cpu=0.125,memory=512,timeout=180)
def status():
    import json
    output.reload();root=Path('/audit');out={}
    for name in ['manifest','comparison']:
        p=root/(name+'.json')
        if p.exists():
            d=json.loads(p.read_text());out[name]={k:v for k,v in d.items() if k not in ['disagreements','pendingSampleCases']}
    for stage in ['first','retry']:
        p=root/stage/'progress.json'
        if p.exists():out[stage]=json.loads(p.read_text())
    return out
