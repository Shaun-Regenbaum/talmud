"""Fetch public source texts for this case, saving exact bytes and a log line per fetch."""
import datetime, hashlib, json, sys, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
LOG = HERE / "sources" / "fetch_log.jsonl"

def fetch(url, name):
    out = HERE / "sources" / name
    req = urllib.request.Request(url, headers={"User-Agent": "sage-network-research/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    out.write_bytes(data)
    rec = {"url": url, "saved_file": f"sources/{name}", "fetched_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
           "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    with LOG.open("a") as f:
        f.write(json.dumps(rec) + "\n")
    print(rec)

if __name__ == "__main__":
    for i in range(1, len(sys.argv), 2):
        try:
            fetch(sys.argv[i], sys.argv[i + 1])
        except Exception as e:
            print("FAILED", sys.argv[i], e)
