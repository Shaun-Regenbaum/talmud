"""Fetch public source texts for this case and save the exact bytes."""
import hashlib, json, sys, time, urllib.request, urllib.parse
from pathlib import Path

OUT = Path(__file__).parent / "sources"
LOG = OUT / "fetch-log.json"

def fetch(name, url):
    req = urllib.request.Request(url, headers={"User-Agent": "talmud-research/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    path = OUT / name
    path.write_bytes(body)
    log = json.loads(LOG.read_text()) if LOG.exists() else []
    log.append({"file": name, "url": url,
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)})
    LOG.write_text(json.dumps(log, ensure_ascii=False, indent=1))
    print(name, len(body))

if __name__ == "__main__":
    fetch(sys.argv[1], sys.argv[2])
