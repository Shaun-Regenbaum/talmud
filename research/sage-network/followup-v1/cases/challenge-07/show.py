import json,sys
def walk(t,p=""):
    if isinstance(t,str):
        if t.strip(): print(p, t)
    elif isinstance(t,list):
        for i,x in enumerate(t): walk(x,f"{p}.{i+1}")
for f in sys.argv[1:]:
    d=json.load(open("sources/"+f))
    print("=====",f, d.get("ref"))
    for v in d.get("versions",[]):
        print("--",v.get("versionTitle"), v.get("language"))
        walk(v["text"])
