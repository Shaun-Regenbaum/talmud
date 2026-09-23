import json, sys, hashlib, urllib.request, datetime, os
# Fetch URL(s), save exact response bytes, log url/time/sha256 in sources/fetch_log.json
# usage: python3 fetch.py URL FILENAME [URL FILENAME ...]
os.makedirs("sources", exist_ok=True)
log_path = "sources/fetch_log.json"
log = json.load(open(log_path)) if os.path.exists(log_path) else []
for url, fname in zip(sys.argv[1::2], sys.argv[2::2]):
    t = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "talmud-research/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            b = r.read()
    except Exception as e:
        print("FAIL", url, e)
        log.append({"url": url, "fetched_at": t, "error": str(e)})
        continue
    path = "sources/" + fname
    open(path, "wb").write(b)
    log.append({"url": url, "fetched_at": t, "saved_file": path, "sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b)})
    print("saved", path, len(b))
json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
