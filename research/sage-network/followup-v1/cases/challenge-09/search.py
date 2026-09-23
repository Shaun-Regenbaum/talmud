import json, sys, hashlib, urllib.request, datetime, os
# Sefaria full-text search (exact phrase); saves raw bytes
q, fname = sys.argv[1], sys.argv[2]
body = json.dumps({"query": {"match_phrase": {"exact": {"query": q}}}, "size": 100, "_source": ["ref", "heRef", "version", "exact"]}).encode()
url = "https://www.sefaria.org/api/search/text/_search"
t = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
b = urllib.request.urlopen(req, timeout=30).read()
open("sources/" + fname, "wb").write(b)
log_path = "sources/fetch_log.json"; log = json.load(open(log_path))
log.append({"search_phrase": q, "url": url, "method": "POST match_phrase exact", "fetched_at": t, "saved_file": "sources/" + fname, "sha256": hashlib.sha256(b).hexdigest()})
json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
d = json.loads(b)
print("total", d["hits"]["total"])
seen=set()
for h in d["hits"]["hits"]:
    s = h["_source"]
    if s["ref"] in seen: continue
    seen.add(s["ref"]); print(s["ref"], "|", s.get("version"), "|", s["exact"][:300].replace("\n"," "))
