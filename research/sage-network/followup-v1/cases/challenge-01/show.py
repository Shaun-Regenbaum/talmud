import json,sys,re
# show.py file [grep-regex]
d=json.load(open(sys.argv[1])); pat=sys.argv[2] if len(sys.argv)>2 else None
def flat(t,p=""):
    if isinstance(t,list):
        for i,x in enumerate(t): yield from flat(x,f"{p}{i+1}.")
    elif t: yield p.rstrip("."),t
for v in d.get("versions",[]):
    print("[",v["language"],v["versionTitle"],"]")
    for k,t in flat(v["text"]):
        if pat is None or re.search(pat,t): print(k,":",t)
