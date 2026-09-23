import json,sys
d=json.load(open('sources/'+sys.argv[1]))
if 'versions' not in d: print(str(d)[:500]); sys.exit()
def walk(t,p=''):
    if isinstance(t,list):
        for i,x in enumerate(t,1): walk(x,f'{p}:{i}')
    elif t: print(p,t)
for v in d['versions']:
    print('==',v['versionTitle'],v.get('language'),d.get('ref'))
    walk(v['text'])
