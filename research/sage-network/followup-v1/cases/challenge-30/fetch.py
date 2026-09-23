import json, sys, hashlib, datetime, urllib.request, urllib.parse, os
LOG = "sources/fetch_log.json"
def fetch(url, fname):
    req = urllib.request.Request(url, headers={"User-Agent": "research-fetch/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    except Exception as e:
        print("FAIL", url, e); return None
    path = os.path.join("sources", fname)
    open(path, "wb").write(data)
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    log = json.load(open(LOG)) if os.path.exists(LOG) else []
    log.append({"url": url, "saved_file": path, "fetched_at": ts, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    json.dump(log, open(LOG, "w"), ensure_ascii=False, indent=1)
    print("OK", fname, len(data))
    return data
if __name__ == "__main__":
    for i in range(1, len(sys.argv), 2):
        fetch(sys.argv[i], sys.argv[i+1])
