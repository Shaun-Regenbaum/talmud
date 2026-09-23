"""Replace quotes that fail exact match with the exact substring from the saved
source, located by diacritic-insensitive matching (vowel points, cantillation,
Unicode combining marks). The dossier quote then equals the saved bytes."""
import json, os, unicodedata, sys
sys.argv=[sys.argv[0]]
HERE=os.path.dirname(os.path.abspath(__file__))
import importlib.util
spec=importlib.util.spec_from_file_location('b', os.path.join(HERE,'build_dossier.py'))
src_map=None
body=json.load(open(os.path.join(HERE,'dossier_body.json'),encoding='utf-8'))
exec(open(os.path.join(HERE,'build_dossier.py'),encoding='utf-8').read().split('sources = []')[0])
paths={s[0]:s[1] for s in SRC}
def skel(s):
    out=[];idx=[]
    for i,ch in enumerate(s):
        for c in unicodedata.normalize('NFD',ch):
            if unicodedata.combining(c) or '֑'<=c<='ׇ' and c not in '־׀׃׆': continue
            out.append(c);idx.append(i)
    return ''.join(out),idx
def resolve(sid,q):
    strs=load_strings(paths[sid])
    if any(q in s for s in strs): return q
    k,_=skel(q)
    for s in strs:
        sk,idx=skel(s)
        p=sk.find(k)
        if p>=0:
            a=idx[p]; b=idx[p+len(k)-1]+1
            # include trailing combining marks of last base char
            while b<len(s) and (unicodedata.combining(s[b]) or '֑'<=s[b]<='ׇ' and s[b] not in '־׀׃׆'): b+=1
            return s[a:b]
    print('UNRESOLVED',sid,q); return q
def walk(evs):
    for ev in evs: ev['exact_quote']=resolve(ev['source_id'],ev['exact_quote'])
for f in body['findings']: walk(f['evidence'])
for a in body['alternative_readings']: walk(a.get('evidence',[]))
for c in body['proposed_corrections']: walk(c.get('evidence',[]))
json.dump(body,open(os.path.join(HERE,'dossier_body.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('done')
