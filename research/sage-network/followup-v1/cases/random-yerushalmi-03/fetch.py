import json, hashlib, sys, urllib.request, datetime, os
LOG='sources/fetch_log.json'
log=json.load(open(LOG)) if os.path.exists(LOG) else []
def fetch(url, fname):
    t=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    try:
        req=urllib.request.Request(url, headers={'User-Agent':'research-fetch/1.0'})
        with urllib.request.urlopen(req, timeout=30) as r: b=r.read()
        open('sources/'+fname,'wb').write(b)
        e={'url':url,'saved_file':'sources/'+fname,'fetched_at':t,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'status':'ok'}
    except Exception as ex:
        e={'url':url,'saved_file':None,'fetched_at':t,'status':'error','error':repr(ex)}
    log.append(e); json.dump(log,open(LOG,'w'),indent=1,ensure_ascii=False); print(e['status'],fname,e.get('bytes',e.get('error')))
for u,f in [a.rsplit('|',1) for a in sys.argv[1:]]: fetch(u,f)
