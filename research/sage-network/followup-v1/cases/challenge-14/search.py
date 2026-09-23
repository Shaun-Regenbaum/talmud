import json, sys, urllib.request, hashlib, datetime
q, out = sys.argv[1], sys.argv[2]
body = json.dumps({"query": q, "type": "text", "field": "exact", "size": 60,
  "filters": [], "filter_fields": [], "sort_method": "score", "source_proj": True}).encode()
url = "https://www.sefaria.org/api/search-wrapper"
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "User-Agent": "research-fetch/1.0"})
with urllib.request.urlopen(req, timeout=40) as r: data = r.read()
open(out, "wb").write(data)
log = {"url": url, "post_body": json.loads(body), "saved_file": out, "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "sha256": hashlib.sha256(data).hexdigest()}
open("sources/fetch-log.jsonl", "a").write(json.dumps(log, ensure_ascii=False) + "\n")
d = json.loads(data)
seen=set()
for h in d["hits"]["hits"]:
    s = h["_source"]; 
    if s["ref"] in seen: continue
    seen.add(s["ref"]); print(s["ref"], "|", s.get("version"))
