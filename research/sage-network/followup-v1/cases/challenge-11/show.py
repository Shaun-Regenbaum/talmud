import json, sys, re
for f in sys.argv[1:]:
    d = json.load(open("sources/" + f))
    print("=====", f, d.get("ref"))
    for v in d.get("versions", []):
        t = v["text"]
        s = json.dumps(t, ensure_ascii=False)
        s = re.sub(r"<[^>]+>", "", s)
        print(" [", v["language"], v["versionTitle"], "]", s[:int(sys.argv[0] and 6000)])
