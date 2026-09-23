"""Fetch public source texts for this case and save the exact bytes."""
import hashlib, json, sys, time, urllib.request
from pathlib import Path

OUT = Path(__file__).parent / "sources"
LOG = OUT / "fetch-log.json"

def fetch(name, url, data=None):
    headers = {"User-Agent": "talmud-research/1.0"}
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = data.encode()
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    path = OUT / name
    path.write_bytes(body)
    log = json.loads(LOG.read_text()) if LOG.exists() else []
    entry = {"file": name, "url": url,
             "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
             "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)}
    if data is not None:
        entry["post_body"] = data.decode()
    log.append(entry)
    LOG.write_text(json.dumps(log, ensure_ascii=False, indent=1))
    print(name, len(body))

if __name__ == "__main__":
    fetch(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
