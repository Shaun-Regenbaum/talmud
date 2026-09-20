"""Draw name pairs for two frontier models to mark, straight from the text.

  python3 pipeline/17_pair_sample.py --n 120 --seed 4242 --out checkset/pairs-dev.json

A third come from the 50 commonest patterns, a third from the rest of the top
2,000, and a third from the long tail of patterns outside the top 2,000. The
tail joins three pairs in ten and no pattern list can reach it, so it gets the
same weight as the easy cases. Seeded, so the draw can be repeated.
"""
import argparse, collections, json, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
import judged, lexicon, textio

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=120); ap.add_argument('--seed', type=int, default=4242)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    lx = lexicon.Lexicon.load(os.path.join(textio.DATA, 'lexicon.json'))
    allp = list(judged.pairs(lx))
    rank = {k: i for i, (k, _) in enumerate(collections.Counter(p['pattern'] for p in allp).most_common())}
    stratum = lambda p: 'top50' if rank[p['pattern']] < 50 else 'top2000' if rank[p['pattern']] < 2000 else 'tail'   # noqa: E731
    by = collections.defaultdict(list)
    for p in allp:
        by[stratum(p)].append(p)
    rng = random.Random(a.seed)
    items = []
    for st in ('top50', 'top2000', 'tail'):
        for p in rng.sample(by[st], a.n // 3):
            items.append({'id': f'{st}-{len(items)}', 'stratum': st, **p})
    with open(a.out, 'w') as f:
        json.dump({'seed': a.seed, 'pairsInText': len(allp), 'strata': {k: len(v) for k, v in by.items()}, 'items': items},
                  f, ensure_ascii=False, indent=1)
    print(f'{len(allp):,} pairs in the text:', {k: len(v) for k, v in by.items()})
    print(f'drew {len(items)} -> {a.out}')
