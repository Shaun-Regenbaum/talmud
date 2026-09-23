"""Query the public Sefaria search endpoint for exact Hebrew phrases; save raw responses."""
import json, sys, urllib.request, hashlib, os
from datetime import datetime, timezone
from fetch import LOG
HERE = os.path.dirname(os.path.abspath(__file__))
def search(phrase, name, path_prefix="Talmud/Yerushalmi"):
    body = {"query": {"bool": {"must": [{"match_phrase": {"naive_lemmatizer": {"query": phrase, "slop": 0}}}],
             "filter": {"bool": {"should": [{"regexp": {"path": path_prefix + ".*"}}]}}}},
            "size": 60, "_source": ["ref", "exact", "version"], "highlight": {"fields": {"naive_lemmatizer": {}}}}
    url = "https://www.sefaria.org/api/search/text/_search"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "User-Agent": "sage-network-research/1.0"})
    at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        with urllib.request.urlopen(req, timeout=40) as r: data = r.read(); status = r.status
    except Exception as e:
        data = None; status = repr(e)
    log = json.load(open(LOG))
    entry = {"name": name, "url": url, "post_body": body, "fetched_at": at, "status": status}
    if data is not None:
        open(os.path.join(HERE, "sources", name), "wb").write(data)
        entry.update(saved_file="sources/" + name, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))
    log = [x for x in log if x["name"] != name] + [entry]
    json.dump(log, open(LOG, "w"), ensure_ascii=False, indent=1)
    print(name, status)
    if data:
        for h in json.loads(data)["hits"]["hits"]:
            print(" ", h["_source"]["ref"], "|", h["_source"].get("version"), "|", " ... ".join(h.get("highlight", {}).get("naive_lemmatizer", []))[:300])
if __name__ == "__main__":
    search(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "Talmud/Yerushalmi")
