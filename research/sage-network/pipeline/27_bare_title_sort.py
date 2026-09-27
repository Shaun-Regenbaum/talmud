"""Sort every bare-title mention into: the title alone (a person called Rav / Rebbi / 'master'),
a name cut short (title + a given name the finder missed), or an ordinary word.  Rules only, no model."""
import json, os, pickle, re, collections, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio
H = os.environ.get('BARE_DIR') or os.path.join(textio.DATA, 'bare-titles-work')  # working folder: context, sorted list, reader batches
os.makedirs(H, exist_ok=True)
ctx = pickle.load(open(f'{H}/ctx.pkl', 'rb'))
lx = json.load(open(textio.DATA + '/lexicon.json'))
GIVEN = set(lx['given'])
reg = json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'packages', 'talmud', 'src', 'lib', 'data', 'rabbi-places.json')))['rabbis']
REG = set()
for r in reg.values():
    for he in [r.get('canonicalHe')] + (r.get('aliasesHe') or []):
        w = (he or '').split()
        if len(w) >= 2 and w[0] in ('רב', 'רבי', 'רבן', 'מר'):
            REG.add(w[1])
NAMEISH = (GIVEN | REG)
typing = {}
for l in open(textio.DATA + '/typed.jsonl'):
    r = json.loads(l); typing[r['key']] = r
# words that usually follow a complete name: speech, particles, punctuation
CONT = set('''אמר אומר אומ' או' דאמר ואמר אמר. אומר: אומר. אומר, סבר סבר. לא לא. הלכה אין מאי כל היא הוה היה הכי עלה משום
ואמרי תני תנא דתני דתניא מתני מתניתין נראין מודה מחייב פוטר מתיר אוסר מטהר מטמא בשם קומי קמיה בעא בעי שאל איתיביה
מתקיף אית לית דרש דריש אזל אתא הוא איהו נמי גופיה לטעמיה ורבי ורבן ורב וחכמים כרבי כרב ודאמר דסבר פליג פליגי
לה ליה להו הא התם הכא אפילו ואפילו מיהו טעמא חדא אלא וכן כמאן מני עבד עביד קאמר אמרי אמרו'''.split())
WORDISH = {'חסד', 'לך', 'לכם', 'כח', 'טוב', 'שלום', 'עם', 'העם', 'מאד', 'הצאן', 'עמך', 'תבואות', 'בנים', 'להושיע', 'רבי', 'רבים', 'ומבטח', 'ורב'}
VERSE_BEFORE = {'ורב', 'עד', 'כי', 'אשר', 'על', 'אל', 'ורוב'}


def strip(w):
    return re.sub(r'[.,:;!?"\(\)\[\]]+$', '', w or '')


SPEECH = {'אמר', 'אומר', "אמ'", "אומ'", "או'", "א'", 'דאמר', 'ואמר', 'סבר', 'אמרי', 'קאמר', 'מתקיף', 'איתיביה', 'בעא', 'בעי', 'בשם', 'קומי', 'קמיה', 'משמיה', 'דרש', 'דריש', 'מודה', 'מתיר', 'אוסר', 'מחייב', 'פוטר', 'מטהר', 'מטמא', 'פליג'}
AMBIG_Y = {'לא', 'בא', 'בון', 'יסא', 'אבא'}   # given names in the Yerushalmi that are also common words


def classify(o):
    key = f"{o['corpus']}|{o['work']}|{o['unit']}|{o['addr']}|{o['start']}"
    nx = strip(o['after'][0]) if o['after'] else ''
    if o['corpus'] == 'yerushalmi' and nx in AMBIG_Y:
        return 'unsure', 'Yerushalmi name that is also a word: ' + nx
    if nx in SPEECH:
        return 'alone', 'speech follows: ' + nx
    t = typing.get(key)
    if t and t['kind'] in ('word', 'term', 'biblical', 'divine', 'place', 'group') and (t.get('sure') or (t.get('confidence') or 0) >= 0.9):
        return 'word', 'typing said ' + t['kind']
    nxt_raw = o['after'][0] if o['after'] else ''
    nxt = strip(nxt_raw)
    if not nxt or nxt_raw in ('.', ',', ':') or nxt_raw != nxt and nxt in CONT:
        return 'alone', 'sentence ends or speech follows'
    if nxt in CONT:
        return 'alone', 'speech or particle follows: ' + nxt
    if nxt in WORDISH:
        return 'word', 'ordinary word follows: ' + nxt
    ab = nxt.endswith("'") and len(nxt) >= 3
    if nxt in NAMEISH or (ab and any(g.startswith(nxt[:-1]) for g in NAMEISH if len(g) > len(nxt) - 1)):
        return 'cut', 'a known given name follows: ' + nxt
    if nxt.startswith(('ו', 'ד', 'ל', 'ב', 'כ', 'מ', 'ש', 'ה')) and nxt[1:] in CONT:
        return 'alone', 'prefixed speech word follows'
    return 'unsure', 'next word: ' + nxt


res = []
for o in ctx:
    c, why = classify(o)
    res.append({**{k: o[k] for k in ('corpus', 'work', 'unit', 'addr', 'start', 'surface', 'ctx')}, 'after': o['after'][:1], 'class': c, 'why': why})
json.dump(res, open(f'{H}/sorted.json', 'w'), ensure_ascii=False)
tab = collections.Counter((r['surface'], r['class']) for r in res)
for s in ('רב', 'רבי', "ר'"):
    tot = sum(v for (x, _), v in tab.items() if x == s)
    print(s, tot, {c: f"{tab[(s, c)]} ({100 * tab[(s, c)] / tot:.0f}%)" for c in ('alone', 'cut', 'word', 'unsure')})
uns = collections.Counter(strip(r['after'][0]) if r['after'] else '' for r in res if r['class'] == 'unsure')
print('top unsure next words:', uns.most_common(40))
