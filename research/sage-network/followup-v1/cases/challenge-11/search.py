"""Run an exact-phrase Sefaria search over the Bavli (Hebrew, no vowels) and save the raw response."""
import datetime, hashlib, json, os, sys, urllib.request
phrase, name = sys.argv[1], sys.argv[2]
body = {"query": phrase, "type": "text", "field": "exact", "size": 100, "slop": 0,
        "filters": ["Talmud/Bavli"], "filter_fields": ["path"], "source_proj": True, "sort_method": "sort", "sort_fields": ["pagesheetrank"], "sort_reverse": False}
url = "https://www.sefaria.org/api/search-wrapper"
at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "User-Agent": "talmud-sage-network-research/1.0"})
LOG = "sources/fetch_log.json"
log = json.load(open(LOG)) if os.path.exists(LOG) else []
try:
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
except Exception as e:
    print("FAIL", e); log.append({"url": url, "post_body": body, "fetched_at": at, "error": str(e)})
else:
    path = "sources/" + name
    open(path, "wb").write(data)
    log.append({"url": url, "post_body": body, "fetched_at": at, "saved_file": path, "sha256": hashlib.sha256(data).hexdigest()})
    d = json.loads(data)
    hits = d.get("hits", {})
    print("total", hits.get("total"))
    for h in hits.get("hits", []):
        print(h["_source"].get("ref"), "|", h["_source"].get("version"))
json.dump(log, open(LOG, "w"), ensure_ascii=False, indent=1)
