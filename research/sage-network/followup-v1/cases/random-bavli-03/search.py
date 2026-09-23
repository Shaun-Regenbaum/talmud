import json, sys, hashlib, datetime, urllib.request, os
def search(q, name, size=50):
    body = json.dumps({"query": q, "type": "text", "field": "naive_lemmatizer", "size": size, "slop": 0,
                       "source_proj": True, "sort_method":"score", "filters":[], "filter_fields":[]}).encode()
    url="https://www.sefaria.org/api/search-wrapper"
    req = urllib.request.Request(url, data=body, headers={"Content-Type":"application/json","User-Agent":"research-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r: b=r.read()
    path=os.path.join("sources",name); open(path,"wb").write(b)
    rec={"url":url,"post_body":json.loads(body),"saved_file":path,"sha256":hashlib.sha256(b).hexdigest(),
         "fetched_at":datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),"bytes":len(b)}
    open("sources/fetch_log.jsonl","a").write(json.dumps(rec,ensure_ascii=False)+"\n")
    d=json.loads(b)
    for h in d["hits"]["hits"]:
        s=h["_source"]; print(s.get("ref"),"|",s.get("version"))
search(sys.argv[1], sys.argv[2])
