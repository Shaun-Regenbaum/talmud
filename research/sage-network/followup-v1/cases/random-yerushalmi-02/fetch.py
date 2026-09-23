import sys, json, hashlib, datetime, urllib.request, os
out='sources'; man=os.path.join(out,'_fetch_log.json')
log=json.load(open(man)) if os.path.exists(man) else []
sid, url, fname = sys.argv[1], sys.argv[2], sys.argv[3]
req=urllib.request.Request(url, headers={'User-Agent':'research-fetch/1.0'})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        b=r.read(); status=r.status
except Exception as e:
    print('FAIL', sid, url, e); log.append({'source_id':sid,'url':url,'error':str(e),'fetched_at':datetime.datetime.now(datetime.UTC).replace(tzinfo=None).isoformat()+'Z'}); json.dump(log,open(man,'w'),ensure_ascii=False,indent=1); sys.exit(1)
p=os.path.join(out,fname); open(p,'wb').write(b)
h=hashlib.sha256(b).hexdigest()
log.append({'source_id':sid,'url':url,'saved_file':p,'sha256':h,'bytes':len(b),'status':status,'fetched_at':datetime.datetime.now(datetime.UTC).replace(tzinfo=None).replace(microsecond=0).isoformat()+'Z'})
json.dump(log,open(man,'w'),ensure_ascii=False,indent=1)
print('OK',sid,len(b),h[:12])
