"""Discover the relation vocabulary, rather than listing the phrases we recall.

Find every place two candidate names sit close together and count the words
between them. The frequent connectors ARE the relation vocabulary of the
corpus. Classification into weighted relations happens in 03.

  python3 pipeline/02_relations.py [--corpus bavli]
"""
import argparse, collections, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio, names

OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
MAX_GAP = 34          # characters; beyond this the two names are not related


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', default=None)
    a = ap.parse_args()
    conn = collections.Counter()
    example = {}
    pairs = 0
    for c, w, wit, unit, i, t in textio.primary_witness_segments(a.corpus):
        found = list(names.find(t))
        for (s1, n1), (s2, n2) in zip(found, found[1:]):
            gap = t[s1 + len(n1):s2]
            if len(gap) > MAX_GAP:
                continue
            key = gap.strip() or '<adjacent>'
            conn[key] += 1
            pairs += 1
            example.setdefault(key, {'ref': f'{w} {unit}:{i}',
                                     'text': t[max(0, s1 - 10):s2 + len(n2) + 10][:160]})
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'connectors.json'), 'w') as f:
        json.dump({'corpus': a.corpus or 'all', 'pairs': pairs,
                   'distinct': len(conn),
                   'connectors': conn.most_common(1000),
                   'examples': {k: example[k] for k, _ in conn.most_common(1000)}},
                  f, ensure_ascii=False)
    print(f'adjacent name pairs : {pairs:,}')
    print(f'distinct connectors : {len(conn):,}')
    for g, n in conn.most_common(15):
        print(f'  {n:6d}  {g}')


if __name__ == '__main__':
    main()
