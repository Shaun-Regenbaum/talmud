"""Count every pattern that joins two names, across one edition per work.

  python3 pipeline/04_relations.py      ->  data/patterns.json
"""
import collections, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import lexicon, relations, textio

if __name__ == '__main__':
    lx = lexicon.Lexicon.load(os.path.join(textio.DATA, 'lexicon.json'))
    count = collections.Counter(); example = {}; total = 0
    for c, w, wit, unit, addr, t in textio.primary_witness_segments():
        for a, b, sig in relations.pairs(t, lx):
            k = relations.signature(sig); count[k] += 1; total += 1
            example.setdefault(k, {'ref': f'{w} {unit}:{addr}', 'a': a.surface, 'b': b.surface,
                                   'text': t[max(0, a.start - 25):b.end + 10]})
    with open(os.path.join(textio.DATA, 'patterns.json'), 'w') as f:
        json.dump({'pairs': total, 'distinct': len(count),
                   'patterns': [{'pattern': k, 'n': n, **example[k]} for k, n in count.most_common(2000)]},
                  f, ensure_ascii=False, indent=1)
    print(f'name pairs: {total:,}   distinct joining patterns: {len(count):,}')
    for k, n in count.most_common(12):
        print(f'  {n:6,}  {k}')
