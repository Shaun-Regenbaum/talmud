import json, sys, hashlib, urllib.request, datetime, os
# Sefaria exact-phrase search; save raw response. Usage: search.py "phrase" outfile [size]
log_path = "sources/fetch_log.json"
log = json.load(open(log_path)) if os.path.exists(log_path) else []
q, fname = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 50
url = "https://www.sefaria.org/api/search-wrapper"
body = json.dumps({"query": q, "type": "text", "field": "exact", "size": size, "source_proj": True}).encode()
t = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 research"})
try:
    with urllib.request.urlopen(req, timeout=40) as r: b = r.read()
except Exception as e:
    print("FAIL", e); log.append({"url": url, "query": q, "fetched_at": t, "error": str(e)}); json.dump(log, open(log_path,"w"), ensure_ascii=False, indent=1); sys.exit()
open("sources/"+fname, "wb").write(b)
log.append({"url": url, "method": "POST", "query": q, "fetched_at": t, "saved_file": "sources/"+fname, "sha256": hashlib.sha256(b).hexdigest()})
json.dump(log, open(log_path,"w"), ensure_ascii=False, indent=1)
d = json.loads(b)
hits = d.get("hits", {}).get("hits", [])
tot = d.get("hits", {}).get("total")
print("total", tot)
seen=set()
for h in hits:
    s = h["_source"]; ref = s.get("ref")
    if ref in seen: continue
    seen.add(ref)
    print(ref, "|", s.get("version"), "|", (s.get("exact") or s.get("naive_lemmatizer") or "")[:300].replace("\n"," "))
