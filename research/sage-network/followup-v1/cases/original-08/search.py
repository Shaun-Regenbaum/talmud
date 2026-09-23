"""Query the public Sefaria search index for exact phrases; save raw responses."""
import hashlib, json, sys, time, urllib.request
from pathlib import Path
OUT = Path(__file__).parent / "sources"
LOG = OUT / "fetch-log.json"
URL = "https://www.sefaria.org/api/search-wrapper"

def search(name, phrase, size=40):
    body = json.dumps({"query": phrase, "type": "text", "field": "exact", "size": size,
                       "slop": 0, "source_proj": ["ref", "version", "lang"],
                       "filters": [], "filter_fields": [], "sort_type": "relevance",
                       "aggs": []}).encode()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json",
                                                          "User-Agent": "talmud-research/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    (OUT / name).write_bytes(raw)
    log = json.loads(LOG.read_text())
    log.append({"file": name, "url": URL + " POST " + phrase,
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
    LOG.write_text(json.dumps(log, ensure_ascii=False, indent=1))
    d = json.loads(raw)
    hits = d.get("hits", {}).get("hits", [])
    print(name, d.get("hits", {}).get("total"))
    for h in hits:
        s = h.get("_source", {})
        print("  ", s.get("ref"), "|", " ".join(h.get("highlight", {}).get("exact", []))[:200])

if __name__ == "__main__":
    search(sys.argv[1], sys.argv[2])
