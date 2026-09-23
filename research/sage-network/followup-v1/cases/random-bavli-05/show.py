import json,sys
# Print non-empty versions of a saved Sefaria v3 text file, flattening nested lists with indices
def flat(t, pre=""):
    if isinstance(t, list):
        for i, x in enumerate(t): yield from flat(x, f"{pre}{i+1}:")
    elif t and str(t).strip(): yield pre.rstrip(":"), t
for f in sys.argv[1:]:
    d = json.load(open(f))
    for v in d.get("versions", []):
        items = list(flat(v["text"]))
        if not items: continue
        print("##", f, "|", v["language"], "|", v["versionTitle"])
        for k, x in items: print(k, x)
