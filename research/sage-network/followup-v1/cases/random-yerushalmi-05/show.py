import json,sys,re
# Print versions of saved Sefaria v3 files; optional segment filter
for f in sys.argv[1:]:
    d=json.load(open(f))
    for v in d['versions']:
        print('=====',f,'|',v['language'],'|',v['versionTitle'])
        def walk(x,p):
            if isinstance(x,list):
                for i,y in enumerate(x,1): walk(y,p+[i])
            elif x: print(':'.join(map(str,p)), re.sub(r'<[^>]+>','',x) if '--raw' not in sys.argv else x)
        walk(v['text'],[])
