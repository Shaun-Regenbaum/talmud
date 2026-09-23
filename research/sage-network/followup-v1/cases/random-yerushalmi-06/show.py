import json, sys
# Print all versions of a saved Sefaria v3 response
d = json.load(open(sys.argv[1]))
for v in d.get("versions", []):
    print("[", v["language"], "|", v["versionTitle"], "|", v.get("versionSource",""), "]")
    t = v["text"]
    if isinstance(t, list):
        for i, x in enumerate(t, 1):
            print(" ", i, json.dumps(x, ensure_ascii=False))
    else:
        print(" ", json.dumps(t, ensure_ascii=False))
