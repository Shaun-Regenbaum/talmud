import json, sys, hashlib, datetime, urllib.request, urllib.parse, os
def fetch(url, name):
    req = urllib.request.Request(url, headers={"User-Agent":"research-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        b = r.read()
    path = os.path.join("sources", name)
    open(path,"wb").write(b)
    rec = {"url":url,"saved_file":path,"sha256":hashlib.sha256(b).hexdigest(),
           "fetched_at":datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),"bytes":len(b)}
    log = "sources/fetch_log.jsonl"
    open(log,"a").write(json.dumps(rec,ensure_ascii=False)+"\n")
    print(rec)
if __name__=="__main__":
    fetch(sys.argv[1], sys.argv[2])
