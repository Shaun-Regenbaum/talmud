import json,sys,re
d=json.load(open(sys.argv[1]))
rng = sys.argv[2] if len(sys.argv)>2 else None
for v in d.get("versions",[]):
    print("\n####", v["language"], "|", v["versionTitle"], "|", v.get("versionSource",""))
    txt=v["text"]
    if isinstance(txt,str): txt=[txt]
    for i,s in enumerate(txt,1):
        if rng:
            a,b=map(int,rng.split("-"))
            if not a<=i<=b: continue
        s=re.sub(r"<[^>]+>","",s) if isinstance(s,str) else s
        print(f"[{i}]", s)
