"""Does the finder find the names we already know are there?

  python3 pipeline/18_anchor_recall.py            (run after 03_mentions.py)

A random check set cannot catch a rare but systematic hole. Eighty-four sampled
passages happened not to contain ריש לקיש, so nobody noticed the finder had
never found him once in 1,162 places. This check needs no model and no sample:
for each name that is one fixed string, it counts the string in the raw text and
counts the mentions the finder reported, in the same edition of each work. A
name the finder reaches far less often than the text contains is a hole.

The string count is a ceiling, not the truth: רב יהודה also sits inside
רב יהודה בר יחזקאל, and the finder rightly reports the longer name there. So
a mention counts if it CONTAINS the string. What is left is what was missed.
"""
import collections, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio

# Fixed strings: the anchors (ANCHORS.md) plus other names that are one string.
NAMES = ['רבן יוחנן בן זכאי', 'רבי עקיבא', 'רבי מאיר', 'רב יהודה', 'אביי', 'רב פפא', 'רב אשי',
         'מר בר רב אשי', 'רבי יוחנן', 'ריש לקיש', 'רבי אבהו', 'רבי יונה',
         'רב הונא', 'רב חסדא', 'רב נחמן', 'רב ששת', 'רב יוסף', 'רבינא', 'עולא', 'רבי זירא', 'רבי ירמיה',
         'בן עזאי', 'בר קפרא', 'רבי טרפון', 'רבי יהושע בן לוי', 'רבי שמעון בן לקיש', 'רבי אמי', 'רבי אסי',
         'חזקיה', 'זעירי', 'רבי חנינא', 'רבי ינאי', 'רב כהנא', 'רבה בר בר חנה', 'רב דימי', 'רבין']
HOLE = 0.90           # below this share, print it as a hole
# Also a Bible figure, so the raw string count is far above the number of sage mentions.
SHARED_WITH_BIBLE = {'חזקיה'}

if __name__ == '__main__':
    prim = textio.primary_witness()
    found = collections.Counter()
    for line in open(os.path.join(textio.DATA, 'mentions.jsonl')):
        m = json.loads(line)
        if prim.get((m['corpus'], m['work'])) != m['witness']:
            continue
        for nm in NAMES:
            if nm in m['surface']:
                found[nm] += 1
    pats = {nm: re.compile(r'(?<![א-ת"\'])[ודלכבמש]{0,3}' + re.escape(nm) + r'(?![א-ת"\'])') for nm in NAMES}
    in_text = collections.Counter()
    for c, w, wit, unit, addr, t in textio.primary_witness_segments():
        for nm, p in pats.items():
            if nm in t:
                in_text[nm] += len(p.findall(t))
    print(f'{"name":22s} {"in the text":>11s} {"found":>7s}  share')
    holes = []
    for nm in NAMES:
        share = found[nm] / in_text[nm] if in_text[nm] else 1.0
        flag = ''
        if share < HOLE and nm in SHARED_WITH_BIBLE:
            flag = '   (also a Bible figure: the text count is a false ceiling)'
        elif share < HOLE:
            flag = '   <-- HOLE'; holes.append(nm)
        print(f'{nm:22s} {in_text[nm]:11,d} {found[nm]:7,d}  {share:5.0%}{flag}')
    with open(os.path.join(textio.DATA, 'anchor-recall.json'), 'w') as f:
        json.dump({nm: {'inText': in_text[nm], 'found': found[nm]} for nm in NAMES}, f, ensure_ascii=False, indent=1)
    print(f'\n{len(holes)} of {len(NAMES)} names are found less than {HOLE:.0%} of the time' if holes
          else f'\nall {len(NAMES)} names are found at least {HOLE:.0%} of the time')
