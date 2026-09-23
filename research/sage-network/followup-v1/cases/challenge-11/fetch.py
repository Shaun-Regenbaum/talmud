"""Fetch public source addresses, save the exact bytes, and log address, time and hash.

Usage: python3 fetch.py URL FILENAME [URL FILENAME ...]
"""
import datetime
import hashlib
import json
import os
import sys
import urllib.request

LOG = "sources/fetch_log.json"
os.makedirs("sources", exist_ok=True)
log = json.load(open(LOG)) if os.path.exists(LOG) else []
for url, name in zip(sys.argv[1::2], sys.argv[2::2]):
    at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "talmud-sage-network-research/1.0"})
        with urllib.request.urlopen(req, timeout=40) as r:
            data = r.read()
    except Exception as error:
        print("FAIL", url, error)
        log.append({"url": url, "fetched_at": at, "error": str(error)})
        continue
    path = "sources/" + name
    with open(path, "wb") as f:
        f.write(data)
    digest = hashlib.sha256(data).hexdigest()
    log.append({"url": url, "fetched_at": at, "saved_file": path, "sha256": digest})
    print("OK", name, len(data), digest[:12])
with open(LOG, "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=1)
