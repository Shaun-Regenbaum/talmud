import json,sys
# Print all text of a Sefaria v3 response with index paths. Args: file [substring filter]
d=json.load(open(sys.argv[1])); flt=sys.argv[2] if len(sys.argv)>2 else None
for v in d.get('versions',[]):
  print('##',v.get('versionTitle'),v.get('language'))
  def walk(t,p=''):
    if isinstance(t,list):
      for i,x in enumerate(t): walk(x,p+'.'+str(i+1))
    elif t and (not flt or flt in t): print(p,t)
  walk(v['text'])
