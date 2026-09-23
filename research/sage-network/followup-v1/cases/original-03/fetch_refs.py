import json, sys, hashlib, urllib.request, urllib.parse, datetime, os
# Fetch Sefaria v3 texts (all versions), save exact bytes, log hash; print text
log_path = "sources/fetch_log.json"
log = json.load(open(log_path)) if os.path.exists(log_path) else []
for ref, fname in zip(sys.argv[1::2], sys.argv[2::2]):
    url = "https://www.sefaria.org/api/v3/texts/" + urllib.parse.quote(ref) + "?version=hebrew%7Call&version=english%7Call"
    t = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            b = r.read()
    except Exception as e:
        print("FAIL", ref, e); log.append({"ref": ref, "url": url, "fetched_at": t, "error": str(e)}); continue
    path = "sources/" + fname
    open(path, "wb").write(b)
    log.append({"ref": ref, "url": url, "fetched_at": t, "saved_file": path, "sha256": hashlib.sha256(b).hexdigest()})
    d = json.loads(b)
    print("==", ref, "->", path)
    for v in d.get("versions", []):
        print(" [", v["language"], v["versionTitle"], "]")
        print(json.dumps(v["text"], ensure_ascii=False)[:2500])
json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
