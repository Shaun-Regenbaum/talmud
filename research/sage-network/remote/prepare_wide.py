"""Prepare independently reviewable named-person cases from a verified graph."""
import hashlib,json,re,sqlite3,sys
from pathlib import Path


def encode(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def sha(s):return hashlib.sha256(s.encode()).hexdigest()
def words(s):
    s=re.sub('[\u0591-\u05c7]','',s or '')
    s=re.sub(r"ר['׳]",'רבי ',s)
    return re.findall('[א-ת]+',s)
def head(s):
    w=words(s)
    while w and w[0] in {'רב','רבי','רבן'}:w.pop(0)
    return w[0] if w else None

def prepare(root,registry_path,dest):
    db=sqlite3.connect(f'file:{root}/namesake-source-review-v12/parent.sqlite?mode=ro',uri=True)
    records={r[0]:list(r) for r in db.execute('SELECT record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json FROM sage_graph_records')};db.close()
    for folder in ['namesake-source-review-v12','direct-interaction-review-v13']:
        for r in json.loads((root/folder/'changes.json').read_text())['records']:
            payload=encode(r['data']);records[r['record_id']]=[r[k] for k in ['record_id','kind','passage_id','ref','subject_id','object_id','authority','decision']]+[sha(payload),payload]
    manifest=json.loads((root/'direct-interaction-review-v13/d1/manifest.json').read_text())
    rows=sorted(records.values());assert len(rows)==manifest['recordCount']
    assert sha(encode([r[:-1] for r in rows]))==manifest['recordSetSha256'],'Graph snapshot differs'
    assert all(sha(r[-1])==r[-2] for r in rows)
    registry=json.loads(registry_path.read_text())['rabbis'].copy()
    for r in rows:
        if r[1]=='registry_person':
            d=json.loads(r[-1]);registry[r[4]]=d.get('registryEntry',d)
    entries=[]
    for slug,d in sorted(registry.items()):
        entries.append({'id':slug,**{k:d.get(k) for k in ['canonical','canonicalHe','aliases','generation','bio','sources']}})
    aliases={'יוסה':'יוסי','יוסיי':'יוסי','חונא':'הונא','חונה':'הונא','זעירא':'זירא','לעזר':'אלעזר','ליעזר':'אליעזר','זעירה':'זירא','עקיבה':'עקיבא','בא':'אבא','יודה':'יהודה','חייה':'חייא','חגיי':'חגי','אימי':'אמי','הושעיה':'הושעיא'}
    def norm(w):return aliases.get(w,w)
    def similar(a,b):
        if a==b:return True
        if min(len(a),len(b))<3 or abs(len(a)-len(b))>1:return False
        if len(a)==len(b):return sum(x!=y for x,y in zip(a,b))<=1
        short,long=sorted([a,b],key=len)
        return any(long[:i]+long[i+1:]==short for i in range(len(long)))
    def heads(e):return {norm(h) for s in [e.get('canonicalHe') or '',*(e.get('aliases') or [])] if (h:=head(s))}
    indexed=[(e,heads(e)) for e in entries]
    pilot={c['personKey'] for c in json.loads((root/'remote-identity-pilot-v1/inputs.json').read_text())}
    cases=[];account=[];no_candidates=[]
    for r in rows:
        if r[1]!='passage':continue
        p=json.loads(r[-1])
        for person in p['people']:
            key=p['id']+'/'+person['id'];state='queued'
            if person.get('named')!='name':state='not_named'
            elif key in pilot:state='pilot_completed'
            loc=person.get('quoteLocation');quote=person.get('quote')
            if state=='queued' and (not quote or not any(quote in p['source'].get(k,'') for k in (['before','after'] if loc=='context' else [loc]))):state='source_quote_needs_review'
            if state!='queued':account.append({'personKey':key,'status':state});continue
            h=head(person['label']);h=norm(h) if h else None
            candidates=[e for e,hs in indexed if h and any(similar(h,x) for x in hs)]
            if not candidates:
                label=person['label'].strip()
                candidates=[e for e in entries if label in [e.get('canonical'),e.get('canonicalHe'),*(e.get('aliases') or [])]]
            # Unqualified Rav and Rabbi are titles used as personal names.
            if person['label'].strip() in {'רב','רבי'}:
                names={'רב':{'rav','rav-abba-arikha'},'רבי':{'rabbi-yehudah-hanasi'}}[person['label'].strip()]
                candidates=[e for e in entries if e['id'] in names or e.get('canonicalHe')==person['label'].strip()]
            if not candidates:state='no_registry_candidates'
            case={'id':'case-'+sha(key)[:20],'personKey':key,'ref':p['ref'],'person':person,'source':p['source'],'candidates':candidates}
            if candidates:cases.append(case)
            else:no_candidates.append(case)
            account.append({'personKey':key,'status':state,'candidateCount':len(candidates),'caseId':case['id']})
    dest.mkdir(parents=True,exist_ok=True)
    from collections import Counter
    report={'revision':manifest['revision'],'sourceRecordSetSha256':manifest['recordSetSha256'],'registrySha256':sha(encode(entries)),'counts':dict(Counter(a['status'] for a in account)),'cases':len(cases),'passages':sum(r[1]=='passage' for r in rows),'limitations':['Only the saved extracted passages, not the entire Talmud.','Registry names and biographies are candidate evidence, not verified dates.','All outputs are proposals; no production identity changes.']}
    for old in dest.glob('inputs-*.json'):old.unlink()
    for i in range(0,len(cases),256):(dest/f'inputs-{i//256:03d}.json').write_text(json.dumps(cases[i:i+256],ensure_ascii=False)+'\n')
    (dest/'no-candidates.json').write_text(json.dumps(no_candidates,ensure_ascii=False)+'\n')
    (dest/'accounting.json').write_text(json.dumps(account,ensure_ascii=False)+'\n');(dest/'registry.json').write_text(json.dumps(entries,ensure_ascii=False)+'\n');report['inputFiles']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(dest.glob('inputs-*.json'))}
    (dest/'manifest.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

if __name__=='__main__':prepare(Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]))
