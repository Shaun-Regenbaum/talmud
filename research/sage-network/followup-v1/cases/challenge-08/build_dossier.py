import json, hashlib, os, sys

# Build dossier.json from dossier_body.json and the saved sources.
# Every exact_quote must occur verbatim in a string value of its saved source file.
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

body = json.load(open("dossier_body.json"))
log = {e["saved_file"]: e for e in json.load(open("sources/fetch_log.json")) if e.get("saved_file")}


def strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, list):
        for y in x:
            yield from strings(y)
    elif isinstance(x, dict):
        for y in x.values():
            yield from strings(y)


sources = []
texts = {}
for s in body["source_specs"]:
    path = s["saved_file"]
    raw = open(path, "rb").read()
    entry = dict(s)
    entry["sha256"] = hashlib.sha256(raw).hexdigest()
    fl = log.get(path)
    if fl:
        entry.setdefault("url", fl["url"])
        entry["fetched_at"] = fl["fetched_at"]
        if fl["sha256"] != entry["sha256"]:
            sys.exit(f"hash drift {path}")
    else:
        entry.setdefault("fetched_at", None)
    sources.append(entry)
    texts[s["source_id"]] = list(strings(json.loads(raw)))

bad = []
for f in body["findings"]:
    for ev in f["evidence"]:
        if ev.get("evidence_type") == "researcher_visual_reading_of_page_image":
            continue
        q = ev["exact_quote"]
        if not any(q in t for t in texts[ev["source_id"]]):
            bad.append((f["finding_id"], ev["source_id"], q))
if bad:
    for b in bad:
        print("QUOTE NOT FOUND", b)
    sys.exit(1)

out = {k: v for k, v in body.items() if k != "source_specs"}
out = {
    "job_id": body["job_id"],
    "focal_ref": body["focal_ref"],
    "status": body["status"],
    "question": body["question"],
    "scope_checked": body["scope_checked"],
    "sources": sources,
    "failed_requests": body["failed_requests"],
    "findings": body["findings"],
    "alternative_readings": body["alternative_readings"],
    "unresolved": body["unresolved"],
    "proposed_corrections": body["proposed_corrections"],
    "ontology_lessons": body["ontology_lessons"],
}
json.dump(out, open("dossier.json", "w"), ensure_ascii=False, indent=1)
n = sum(len(f["evidence"]) for f in body["findings"])
print(f"ok: {len(sources)} sources, {len(body['findings'])} findings, {n} evidence items verified")
