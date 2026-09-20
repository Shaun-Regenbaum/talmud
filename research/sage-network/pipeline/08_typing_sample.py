"""Draw mentions that need a judgement, for the markers and the cheap model.

  python3 pipeline/08_typing_sample.py --per 60 --out checkset/typing-dev.json

Three kinds of mention cannot be settled by rules, and each is sampled:

  unsure   a known given name used with no title (יעקב: the patriarch, or a sage?)
           or a title before a word seen too rarely to judge
  bare     a one-word name that is also an ordinary word (רב is "much", לוי is a
           tribe, שמואל is a prophet)
  short    a short form (ר"ה is Rav Huna, and also Rosh Hashanah)

The judgement is made per MENTION, not per string, because the same string is a
sage on one page and a Bible figure on the next.
"""
import argparse, collections, json, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--per', type=int, default=60)
    ap.add_argument('--seed', type=int, default=4242)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    prim = textio.primary_witness()
    pools = collections.defaultdict(list)
    for line in open(os.path.join(textio.DATA, 'mentions.jsonl')):
        m = json.loads(line)
        if prim.get((m['corpus'], m['work'])) != m['witness']:
            continue
        if m['kind'] == 'abbrev':
            pools['short'].append(m)
        elif m['kind'] == 'bare' and not m['certain']:
            pools['bare'].append(m)
        elif m['kind'] == 'bare':
            pools['bare-sure'].append(m)
        elif m['kind'] == 'name' and not m['certain']:
            pools['unsure'].append(m)
    picked = []
    for stratum in ('unsure', 'bare', 'bare-sure', 'short'):
        n = a.per if stratum != 'bare-sure' else a.per // 2
        picked += [dict(x, stratum=stratum) for x in rng.sample(pools[stratum], min(n, len(pools[stratum])))]
    # attach the passage each mention sits in
    want = {(x['corpus'], x['work'], x['witness'], x['unit'], x['addr']) for x in picked}
    text = {}
    for c, w, wit, unit, addr, t in textio.segments():
        if (c, w, wit, unit, addr) in want:
            text[(c, w, wit, unit, addr)] = t
    items = []
    for i, x in enumerate(picked):
        t = text.get((x['corpus'], x['work'], x['witness'], x['unit'], x['addr']))
        if not t:
            continue
        lo, hi = max(0, x['start'] - 220), min(len(t), x['end'] + 220)
        marked = t[lo:x['start']] + '⟦' + t[x['start']:x['end']] + '⟧' + t[x['end']:hi]
        items.append({'id': f't{i:04d}', 'stratum': x['stratum'], 'surface': x['surface'],
                      'corpus': x['corpus'], 'work': x['work'], 'edition': x['witness'],
                      'unit': x['unit'], 'addr': x['addr'], 'marked': marked})
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    json.dump({'seed': a.seed, 'n': len(items),
               'pools': {k: len(v) for k, v in pools.items()}, 'items': items},
              open(a.out, 'w'), ensure_ascii=False, indent=1)
    print({k: len(v) for k, v in pools.items()})
    print(f'{len(items)} mentions -> {a.out}')
