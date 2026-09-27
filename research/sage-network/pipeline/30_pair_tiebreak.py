"""Settle Fable/Opus disagreements (pairs where the two blind readers of 21/22 gave different kinds) with a third blind reader (Sonnet): two of three decide.

Scores Sonnet on the hidden known answers first. Writes the outcome into data/pair-read.jsonl:
  2 of 3 agree  -> that kind; direction from the agreeing readers when they agree on it; 'votes' records all three
  all differ    -> Fable's answer stays, marked sure=false and 'disputed': true
Prints the counts. Run after copying the labels back into reader/labels-NNN.jsonl."""
import collections, glob, json, os, sys
SN = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, f'{SN}/pipeline')
from relkinds import USE  # noqa: E402
T = os.environ.get('TIEBREAK_DIR') or os.path.join(SN, 'data', 'tiebreak')  # disputed.json + reader/batch-, map-, labels-NNN
PASS = 0.80


def load(p):
    out = {}
    if os.path.exists(p):
        for line in open(p):
            try:
                r = json.loads(line); out[r['n']] = r
            except Exception:
                pass
    return out


A = json.load(open(f'{SN}/checkset/pairs-heldout.astra.json'))['labels']
F = json.load(open(f'{SN}/checkset/pairs-heldout.fable.json'))['labels']
gold = {i: A[i]['kind'] for i in A if i in F and A[i]['kind'] == F[i]['kind']}
disputed = {d['key']: d for d in json.load(open(f'{T}/disputed.json'))}
sonnet, g = {}, collections.Counter()
for mp_path in sorted(glob.glob(f'{T}/reader/map-*.json')):
    b = mp_path[-8:-5]; mp = json.load(open(mp_path)); lab = load(f'{T}/reader/labels-{b}.jsonl')
    bk = collections.Counter()
    for n, m in mp.items():
        if n not in lab:
            continue
        if m['type'] == 'gold':
            bk['n'] += 1; bk['kind'] += lab[n]['kind'] == gold.get(m['key']); bk['use'] += USE.get(lab[n]['kind']) == USE.get(gold.get(m['key']))
        else:
            sonnet[m['key']] = lab[n]
    ok = bk['n'] and bk['use'] / bk['n'] >= PASS
    print(f"batch {b}: {len(lab)} lines; hidden: same kind {bk['kind']}/{bk['n']}, same use {bk['use']}/{bk['n']} -> {'used' if ok else 'LEFT OUT'}")
    g.update(bk)
    if not ok:
        for n, m in mp.items():
            sonnet.pop(m['key'], None)
print(f"Sonnet on hidden known answers: same kind {g['kind']}/{g['n']} ({100 * g['kind'] / max(g['n'], 1):.1f}%)")

out = collections.Counter(); settled = {}
for k, d in disputed.items():
    f, o, s = d['fable'], d['opus'], sonnet.get(k)
    if not s:
        out['no third read'] += 1; continue
    votes = {'fable': f['kind'], 'opus': o['kind'], 'sonnet': s['kind']}
    top, n = collections.Counter(votes.values()).most_common(1)[0]
    if n >= 2:
        agree = [x for x in (f, o, s) if x['kind'] == top]
        dirs = {x.get('dir') or '' for x in agree}
        settled[k] = {'kind': top, 'direction': dirs.pop() if len(dirs) == 1 else '', 'sure': all(x.get('sure', True) for x in agree),
                      'votes': votes, 'disputed': False}
        out['sided with fable' if f['kind'] == top else 'sided with opus'] += 1
    else:
        settled[k] = {'kind': f['kind'], 'direction': f.get('dir') or '', 'sure': False, 'votes': votes, 'disputed': True}
        out['all three differ'] += 1
print('disputed pairs:', len(disputed), dict(out))

if '--write' in sys.argv:
    path = os.path.join(os.environ.get('SAGE_NETWORK_DATA') or f'{SN}/data', 'pair-read.jsonl')
    rows = [json.loads(line) for line in open(path)]
    changed = 0
    for r in rows:
        s = settled.get(r['key'])
        if s:
            changed += r['kind'] != s['kind']
            r.update(kind=s['kind'], direction=s['direction'], sure=s['sure'], votes=s['votes'], disputed=s['disputed'],
                     reader='majority of Fable, Opus and Sonnet, each reading blind')
    with open(path, 'w') as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'wrote {path}: {len(settled)} pairs settled, {changed} changed kind')
