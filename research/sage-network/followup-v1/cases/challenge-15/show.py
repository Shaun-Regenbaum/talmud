import json, sys
# print every version's text of a saved Sefaria v3 response
d = json.load(open(sys.argv[1]))
def walk(t, p=""):
    if isinstance(t, list):
        for i, x in enumerate(t): walk(x, f"{p}.{i+1}")
    elif t: print(p, t); print()
for v in d.get("versions", []):
    if len(sys.argv) > 2 and sys.argv[2] not in v["versionTitle"]: continue
    print("###", v["versionTitle"], v["language"]); walk(v["text"])
