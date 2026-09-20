"""Count every pattern that joins two names, across one edition per work.

  python3 pipeline/04_relations.py      ->  data/patterns.json

Run after the typing passes (12, 13, 14). A mention they call an ordinary word
or a Bible figure is not counted as a name here.
"""
import collections, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import judged, lexicon, relations, textio

if __name__ == '__main__':
    lx = lexicon.Lexicon.load(os.path.join(textio.DATA, 'lexicon.json'))
    # What the typing passes said is not a rabbinic name: an ordinary word, a
    # legal term, a name of God, a Bible figure. None of these is half of a pair.
    rejected = judged.rejected_keys()
    print(f'typing rejects {len(rejected):,} mentions' if rejected
          else 'NO typed.jsonl: every mention is counted, words and Bible figures included')
    count = collections.Counter(); examples = {}; total = 0
    for c, w, wit, unit, addr, t in textio.primary_witness_segments():
        keep = lambda m: f'{c}|{w}|{unit}|{addr}|{m.start}' not in rejected      # noqa: E731
        for a, b, sig in relations.pairs(t, lx, keep):
            k = relations.signature(sig); count[k] += 1; total += 1
            # up to three passages, each from a different work, so one tractate's
            # habit is not taken for the meaning of the pattern
            ex = examples.setdefault(k, [])
            if len(ex) < 3 and w not in {e['work'] for e in ex}:
                ex.append({'work': w, 'ref': f'{w} {unit}:{addr}', 'a': a.surface, 'b': b.surface,
                           'text': t[max(0, a.start - 40):b.end + 40]})
    with open(os.path.join(textio.DATA, 'patterns.json'), 'w') as f:
        json.dump({'pairs': total, 'distinct': len(count),
                   'patterns': [{'pattern': k, 'n': n, 'examples': examples[k]} for k, n in count.most_common(2000)]},
                  f, ensure_ascii=False, indent=1)
    print(f'name pairs: {total:,}   distinct joining patterns: {len(count):,}')
    run = 0
    for i, (_, n) in enumerate(count.most_common(), 1):
        run += n
        if i in (50, 150, 300, 600, 1000, 2000):
            print(f'  the {i:,} commonest patterns cover {run / total:.1%} of pairs')
    for k, n in count.most_common(12):
        print(f'  {n:6,}  {k}')
