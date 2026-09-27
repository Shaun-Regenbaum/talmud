"""Step 1 of 4 for lone titles: collect the words around every mention of רב / רבי / ר' / מר with no name after it.

  26_bare_title_context.py   context for every lone title                     -> $BARE_DIR/ctx.pkl
  27_bare_title_sort.py      rules sort them: alone / cut / word / unsure     -> $BARE_DIR/sorted.json
  28_bare_title_batches.py   reader batches of the unsure ones that sit in a pair (+ hidden rule-settled checks)
  29_bare_title_decide.py    score two blind readers, write data/bare-titles.jsonl (read by 24_name_map.py)

$BARE_DIR defaults to data/bare-titles-work. Readers follow bare-titles/HOW-TO-MARK.md and READER-TASK.md, written by hand for this step.
"""
import json, os, sys, collections, pickle
sys.path.insert(0, os.path.dirname(__file__))
import textio
H = os.environ.get('BARE_DIR') or os.path.join(textio.DATA, 'bare-titles-work')
os.makedirs(H, exist_ok=True)
BARE = {'רב', 'רבי', "ר'", 'מר'}
want = collections.defaultdict(list)
for l in open(os.path.join(textio.DATA, 'mentions.jsonl')):
    m = json.loads(l)
    if m['surface'] in BARE and m['kind'] == 'bare':
        want[(m['corpus'], m['work'], m['witness'], m['unit'], m['addr'])].append(m)
print('bare mentions', sum(len(v) for v in want.values()))
out = []
for c, w, wit, unit, addr, t in textio.segments():
    ms = want.get((c, w, wit, unit, addr))
    if not ms:
        continue
    for m in ms:
        before = t[:m['start']].split()[-3:]; after = t[m['end']:].split()[:3]
        out.append({'corpus': c, 'work': w, 'unit': unit, 'addr': addr, 'surface': m['surface'], 'prefix': m.get('prefix'),
                    'before': before, 'after': after, 'ctx': t[max(0, m['start'] - 60):m['end'] + 60], 'start': m['start']})
pickle.dump(out, open(os.path.join(H, 'ctx.pkl'), 'wb'))
print('with context', len(out))
for s in ('רב', 'רבי', "ר'", 'מר'):
    xs = [o for o in out if o['surface'] == s]
    nxt = collections.Counter(o['after'][0] if o['after'] else '<END>' for o in xs)
    by = collections.Counter(o['corpus'] for o in xs)
    print(f'\n{s}: {len(xs)} {dict(by)}\n  next word:', nxt.most_common(25))
