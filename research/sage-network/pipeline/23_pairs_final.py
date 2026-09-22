"""One answer per pair, with where it came from.

  python3 pipeline/23_pairs_final.py

Sources, in the order they are trusted:

  rule     both names are the same string, so the same man named twice
           (14 of 15 on the held-out set)
  reader   a stronger reader's mark, from a batch that passed its hidden test
           pairs (21_reader_merge.py). Carries a direction.
  cheap    the cheap model, where its confidence is 0.9 or more
           (32 of 32 on the held-out set). No direction: its kinds are worded
           A-to-B and it was never asked.
  open     none of the above. The cheap model's odds are kept and nothing is
           claimed. Below 0.7 it was right 34 times in 71.

Writes data/pairs-final.jsonl and prints what rests on what.
"""
import collections, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio
from relkinds import USE

TRUST = 0.9
DIRECTION_SETTLED_FROM = 19     # reader batches before this chose their own rule for kin and teacher


def same_string(a, b):
    strip = lambda s: re.sub(r"^(רבי|ר'|רב|רבן) ", 'T ', s)                 # noqa: E731
    return a == b or strip(a) == strip(b)


if __name__ == '__main__':
    cheap, read = {}, {}
    for line in open(os.path.join(textio.DATA, 'pair-kinds.jsonl')):
        r = json.loads(line); cheap[r['key']] = r
    p = os.path.join(textio.DATA, 'pair-read.jsonl')
    if os.path.exists(p):
        for line in open(p):
            r = json.loads(line); read[r['key']] = r
    source, by_use, disagree = collections.Counter(), collections.Counter(), collections.Counter()
    with open(os.path.join(textio.DATA, 'pairs-final.jsonl'), 'w') as out:
        for k, c in cheap.items():
            row = {'key': k, 'ref': c['ref'], 'a': c['a'], 'b': c['b'], 'pattern': c['pattern']}
            if same_string(c['a'], c['b']):
                row.update(kind='same-man', source='rule', direction='')
            elif k in read:
                r = read[k]
                direction = r['direction']
                if r['kind'] in ('kin', 'teacher') and int(r.get('batch') or 0) < DIRECTION_SETTLED_FROM:
                    direction = None      # the guide had not yet said what direction means for these two kinds
                row.update(kind=r['kind'], source='reader', direction=direction, sure=r['sure'])
                if c.get('kind') != r['kind']:
                    disagree[(c.get('kind'), r['kind'])] += 1
            elif (c.get('confidence') or 0) >= TRUST:
                row.update(kind=c['kind'], source='cheap', direction=None, confidence=c['confidence'])
            else:
                row.update(kind=None, source='open', direction=None, odds=c.get('p'), confidence=c.get('confidence'))
            source[row['source']] += 1
            if row['kind']:
                by_use[USE[row['kind']]] += 1
            out.write(json.dumps(row, ensure_ascii=False) + '\n')
    n = sum(source.values())
    print(f'pairs: {n:,}')
    for s in ('rule', 'reader', 'cheap', 'open'):
        print(f'  {s:7s} {source[s]:7,d}  {source[s] / n:5.1%}')
    print('settled pairs by what they are used for:', dict(by_use.most_common()))
    if read:
        changed = sum(disagree.values())
        print(f'\nthe reader changed the cheap model\'s top answer on {changed:,} of {source["reader"]:,} pairs it read ({changed / max(source["reader"], 1):.0%}); commonest:')
        for (x, y), c in disagree.most_common(10):
            print(f'  {x} -> {y}: {c}')
        d = collections.Counter(r['direction'] for r in read.values() if USE[r['kind']] in ('order', 'scene'))
        print('direction, among the reader\'s order and scene pairs:', dict(d))
