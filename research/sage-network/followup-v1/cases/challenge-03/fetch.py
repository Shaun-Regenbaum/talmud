import json, sys, hashlib, urllib.request, urllib.parse, datetime, os
# Fetch a URL (or Sefaria v3 text ref with prefix 'ref:') and save exact bytes; log to sources/fetch_log.json
log_path = "sources/fetch_log.json"
log = json.load(open(log_path)) if os.path.exists(log_path) else []
for target, fname in zip(sys.argv[1::2], sys.argv[2::2]):
    if target.startswith("ref:"):
        url = "https://www.sefaria.org/api/v3/texts/" + urllib.parse.quote(target[4:]) + "?version=hebrew%7Call&version=english%7Call"
    else:
        url = target
    t = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 research-fetch"})
        with urllib.request.urlopen(req, timeout=30) as r:
            b = r.read()
    except Exception as e:
        print("FAIL", target, e); log.append({"target": target, "url": url, "fetched_at": t, "error": str(e)}); continue
    path = "sources/" + fname
    open(path, "wb").write(b)
    log.append({"target": target, "url": url, "fetched_at": t, "saved_file": path, "sha256": hashlib.sha256(b).hexdigest()})
    print("saved", path, len(b))
json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
