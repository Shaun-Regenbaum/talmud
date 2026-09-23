import json, sys, hashlib, urllib.request, datetime, os
# POST a Sefaria search query; save exact response bytes. Args: query fname
q, fname = sys.argv[1], sys.argv[2]
body = json.dumps({"query": q, "type": "text", "field": "exact", "size": 100, "source_proj": True,
                   "filters": [], "filter_fields": [], "slop": 0}).encode()
url = "https://www.sefaria.org/api/search-wrapper"
t = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "User-Agent": "research-fetch/1.0"})
with urllib.request.urlopen(req, timeout=40) as r:
    b = r.read()
open("sources/" + fname, "wb").write(b)
log = json.load(open("sources/fetch_log.json"))
log.append({"url": url, "method": "POST", "body": json.loads(body), "fetched_at": t, "saved_file": "sources/" + fname, "sha256": hashlib.sha256(b).hexdigest()})
json.dump(log, open("sources/fetch_log.json", "w"), ensure_ascii=False, indent=1)
d = json.loads(b)
hits = d.get("hits", {}).get("hits", [])
print("total", d.get("hits", {}).get("total"))
for h in hits:
    s = h["_source"]; print(s.get("ref"), "|", s.get("version"))
