import json, sys, hashlib, urllib.request, datetime, os
# Sefaria exact-phrase search (naive_lemmatizer field, slop 0); save raw response bytes
log_path = "sources/fetch_log.json"
log = json.load(open(log_path)) if os.path.exists(log_path) else []
url = "https://www.sefaria.org/api/search-wrapper"
for phrase, fname in zip(sys.argv[1::2], sys.argv[2::2]):
    body = json.dumps({"query": phrase, "type": "text", "field": "exact", "slop": 0, "size": 100,
                       "source_proj": ["ref","heRef","version","lang"], "filters": [], "filter_fields": []}).encode()
    t = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 research"})
        with urllib.request.urlopen(req, timeout=40) as r:
            b = r.read()
    except Exception as e:
        print("FAIL", phrase, e); log.append({"url": url, "post_body": body.decode(), "fetched_at": t, "error": str(e)}); continue
    path = "sources/" + fname
    open(path, "wb").write(b)
    log.append({"url": url, "post_body": body.decode(), "fetched_at": t, "saved_file": path, "sha256": hashlib.sha256(b).hexdigest()})
    d = json.loads(b)
    hits = d.get("hits", {}).get("hits", [])
    print("==", phrase, "total", d.get("hits", {}).get("total"))
    for h in hits:
        s = h["_source"]; print("  ", s.get("ref"), "|", s.get("version"))
json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
