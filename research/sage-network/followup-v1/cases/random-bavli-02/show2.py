import json,sys,re
def flat(x,p=""):
    if isinstance(x,str): yield p,x
    elif isinstance(x,list):
        for i,y in enumerate(x,1): yield from flat(y,f"{p}.{i}" if p else str(i))
for f in sys.argv[1:]:
    d=json.load(open(f)); print("\n======",f, d.get("ref"))
    for v in d.get("versions",[]):
        print("####", v["language"], "|", v["versionTitle"])
        for p,s in flat(v["text"]):
            s=re.sub(r"<[^>]+>","",s)
            if s.strip(): print(f"[{p}]", s)
