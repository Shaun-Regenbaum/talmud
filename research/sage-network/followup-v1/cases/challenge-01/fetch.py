import json, sys, hashlib, urllib.request, urllib.parse, datetime, os
# Fetch URLs and save exact bytes; append to sources/fetch_log.json. Args: url fname [url fname ...]
log_path = "sources/fetch_log.json"
log = json.load(open(log_path)) if os.path.exists(log_path) else []
for url, fname in zip(sys.argv[1::2], sys.argv[2::2]):
    t = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "research-fetch/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            b = r.read()
    except Exception as e:
        print("FAIL", url, e); log.append({"url": url, "fetched_at": t, "error": str(e)}); continue
    path = "sources/" + fname
    open(path, "wb").write(b)
    log.append({"url": url, "fetched_at": t, "saved_file": path, "sha256": hashlib.sha256(b).hexdigest()})
    print("OK", fname, len(b))
json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
