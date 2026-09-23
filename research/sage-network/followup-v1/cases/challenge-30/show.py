import json,re,sys
def flat(t,path=()):
    if isinstance(t,str): yield path,t
    elif isinstance(t,list):
        for i,x in enumerate(t,1): yield from flat(x,path+(i,))
f=sys.argv[1]; pat=sys.argv[2] if len(sys.argv)>2 else None
d=json.load(open("sources/"+f))
for v in d.get("versions",[]):
    print("==",d.get("ref"),v["versionTitle"],v["language"])
    for p,s in flat(v["text"]):
        s=re.sub("<[^>]+>","",s)
        if not s.strip(): continue
        if pat is None or re.search(pat,s) or (p and str(p[0])==pat): print(p,s[:1500])
