"""Fetch public source texts for random-yerushalmi-04 and log each saved file."""
import hashlib, json, sys, time, urllib.request, urllib.parse, os
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "sources", "fetch_log.json")

def fetch(url, name):
    req = urllib.request.Request(url, headers={"User-Agent": "sage-network-research/1.0"})
    at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = r.read(); status = r.status
    except Exception as e:
        data = None; status = repr(e)
    log = json.load(open(LOG)) if os.path.exists(LOG) else []
    entry = {"name": name, "url": url, "fetched_at": at, "status": status}
    if data is not None:
        path = os.path.join(HERE, "sources", name)
        open(path, "wb").write(data)
        entry["saved_file"] = "sources/" + name
        entry["sha256"] = hashlib.sha256(data).hexdigest()
        entry["bytes"] = len(data)
    log = [x for x in log if x["name"] != name] + [entry]
    json.dump(log, open(LOG, "w"), ensure_ascii=False, indent=1)
    print(name, status, entry.get("bytes"))
    return data

if __name__ == "__main__":
    for arg in sys.argv[1:]:
        name, url = arg.split("=", 1)
        fetch(url, name)
        time.sleep(0.5)
