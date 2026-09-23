import json,sys
d=json.load(open(sys.argv[1]))
lo=int(sys.argv[2]) if len(sys.argv)>2 else 0; hi=int(sys.argv[3]) if len(sys.argv)>3 else 999
for v in d["versions"]:
    print("[",v["language"],v["versionTitle"],"]")
    t=v["text"]
    if isinstance(t,str): t=[t]
    for i,s in enumerate(t):
        if lo<=i+1<=hi: print(i+1, s)
