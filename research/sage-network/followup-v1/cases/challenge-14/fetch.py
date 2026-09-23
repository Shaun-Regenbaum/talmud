import sys, json, hashlib, urllib.request, datetime, os
# usage: fetch.py URL outfile
url, out = sys.argv[1], sys.argv[2]
req = urllib.request.Request(url, headers={"User-Agent": "research-fetch/1.0"})
with urllib.request.urlopen(req, timeout=40) as r:
    data = r.read()
os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
open(out, "wb").write(data)
log = {"url": url, "saved_file": out, "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
with open("sources/fetch-log.jsonl", "a") as f:
    f.write(json.dumps(log) + "\n")
print(json.dumps(log))
