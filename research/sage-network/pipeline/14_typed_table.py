"""Join the two typing passes into one answer per mention.

  python3 pipeline/14_typed_table.py

The cheap model's answer stands where its confidence is 0.9 or more. Below that
the second model's answer is used. Where the second model gave none, the cheap
answer is kept and marked as untrusted. Writes data/typed.jsonl and prints the
counts, so the share of mentions resting on each source is always on the page.
"""
import collections, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import judged, textio
from judged import key_of

TRUST = 0.9

if __name__ == '__main__':
    first, hard = {}, {}
    for line in open(os.path.join(textio.DATA, 'typing.jsonl')):
        r = json.loads(line); first[r['key']] = r
    p = os.path.join(textio.DATA, 'typing-hard.jsonl')
    if os.path.exists(p):
        for line in open(p):
            r = json.loads(line); hard[r['key']] = r
    source, kinds, flips = collections.Counter(), collections.Counter(), collections.Counter()
    with open(os.path.join(textio.DATA, 'typed.jsonl'), 'w') as out:
        for m in judged.mentions():
            k = key_of(m); f, h = first.get(k), hard.get(k)
            if f and (f.get('confidence') or 0) >= TRUST:
                row = {'kind': f['kind'], 'source': 'first', 'confidence': f['confidence']}
            elif h:
                row = {'kind': h['kind'], 'source': 'second', 'sure': h['sure'], 'reading': h.get('reading'),
                       'firstKind': f and f.get('kind'), 'confidence': f and f.get('confidence')}
                if f and f.get('kind') != h['kind']:
                    flips[(f.get('kind'), h['kind'])] += 1
            elif f:
                row = {'kind': f['kind'], 'source': 'first-untrusted', 'confidence': f.get('confidence')}
            else:
                row = {'kind': None, 'source': 'none'}
            source[row['source']] += 1; kinds[row['kind']] += 1
            out.write(json.dumps({'key': k, 'surface': m['surface'], 'mentionKind': m['kind'], **row},
                                 ensure_ascii=False) + '\n')
    n = sum(source.values())
    print(f'mentions needing a judgement: {n:,}')
    for s, c in source.most_common():
        print(f'  {s:16s} {c:7,d}  {c / n:5.1%}')
    print('kinds:')
    for kd, c in kinds.most_common():
        print(f'  {str(kd):10s} {c:7,d}  {c / n:5.1%}')
    print('second model changed the answer on', f'{sum(flips.values()):,}', 'mentions; the commonest changes:')
    for (x, y), c in flips.most_common(8):
        print(f'  {x} -> {y}: {c:,}')
