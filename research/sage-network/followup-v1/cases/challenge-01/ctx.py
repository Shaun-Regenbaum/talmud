import json,sys,re
# ctx.py file regex [width]  -> print snippets (tags stripped) with version + key
d=json.load(open(sys.argv[1])); pat=re.compile(sys.argv[2]); w=int(sys.argv[3]) if len(sys.argv)>3 else 200
def flat(t,p=""):
    if isinstance(t,list):
        for i,x in enumerate(t): yield from flat(x,f"{p}{i+1}.")
    elif t: yield p.rstrip("."),t
for v in d.get("versions",[]):
    for k,t in flat(v["text"]):
        t=re.sub(r'<i data-commentator[^>]*></i>','',t); t=re.sub(r'<[^>]+>','',t)
        for m in pat.finditer(t):
            s=max(0,m.start()-w); print(f"[{v['versionTitle']}] {k}: ...{t[s:m.end()+w]}...\n")
