import json, sys
def flat(t, p=""):
    if isinstance(t, list):
        for i, x in enumerate(t): yield from flat(x, f"{p}.{i+1}")
    else: yield p, t
for fn in sys.argv[1:]:
    d = json.load(open(fn))
    print("########", fn, d.get("ref"), "|", d.get("versionTitle"), "|", d.get("heVersionTitle"))
    for key in ("he","text"):
        for p, t in flat(d.get(key, [])):
            if t: print(key, p, t)
