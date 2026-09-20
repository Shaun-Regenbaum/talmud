"""What the full pair run says, and the first thing it is good for.

  python3 pipeline/20_pair_table.py        (after 19_pair_all.py)

Prints how the pairs split by kind and how much of each rests on a confident
answer. Then it harvests the pairs judged to be the SAME MAN named twice where
one side is a short form: דר' אלעזר דאמר ר"א says, in that passage, that ר"א is
R. Elazar. Each such pair is a reading of a short form given by the text itself,
not by a model's memory of who ר"א usually is. Writes data/short-form-readings.json.
"""
import collections, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio
from relkinds import USE

TRUST = 0.7           # the check set: 52 of 53 right at or above this, 28 of 45 below
_SHORT = re.compile(r'^א?ר[א-ת]{0,3}"[א-ת]{1,2}')


def is_short(s):
    return bool(_SHORT.match(s))


if __name__ == '__main__':
    rows = [json.loads(line) for line in open(os.path.join(textio.DATA, 'pair-kinds.jsonl'))]
    n = len(rows)
    sure = [r for r in rows if (r.get('confidence') or 0) >= TRUST]
    print(f'pairs judged: {n:,}   confident ({TRUST}+): {len(sure):,} ({len(sure) / n:.1%})')
    kinds, ksure = collections.Counter(r['kind'] for r in rows), collections.Counter(r['kind'] for r in sure)
    print(f'\n{"kind":12s} {"pairs":>7s} {"share":>6s} {"confident":>10s}   used for')
    for k, c in kinds.most_common():
        print(f'{str(k):12s} {c:7,d} {c / n:6.1%} {ksure[k] / c:10.0%}   {USE.get(k, "?")}')
    use = collections.Counter(USE.get(r['kind'], '?') for r in sure)
    print('\nconfident pairs by what they are used for:', dict(use.most_common()))

    # the same pattern should mostly mean the same thing; where it does not, the pattern is ambiguous
    by_pat = collections.defaultdict(collections.Counter)
    for r in sure:
        by_pat[r['pattern']][r['kind']] += 1
    print('\nthe commonest patterns, and how one-sided the judgement of their pairs is:')
    for pat, c in sorted(by_pat.items(), key=lambda kv: -sum(kv[1].values()))[:25]:
        tot = sum(c.values()); top, topn = c.most_common(1)[0]
        print(f'  {tot:5,d}  {pat:30s} {top:11s} {topn / tot:4.0%}   then {", ".join(f"{k} {v}" for k, v in c.most_common(3)[1:])}')

    # short forms read by the text itself
    readings = collections.defaultdict(collections.Counter); where = {}
    for r in sure:
        if r['kind'] != 'same-man':
            continue
        a, b = r['a'], r['b']
        if is_short(a) != is_short(b):
            short, full = (a, b) if is_short(a) else (b, a)
            readings[short][full] += 1
            where.setdefault((short, full), r['ref'])
    out = {s: [{'reading': f, 'n': c, 'example': where[(s, f)]} for f, c in cnt.most_common()]
           for s, cnt in sorted(readings.items(), key=lambda kv: -sum(kv[1].values()))}
    with open(os.path.join(textio.DATA, 'short-form-readings.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    total = sum(sum(c.values()) for c in readings.values())
    print(f'\nshort forms the text itself spells out: {len(out)} forms, {total:,} passages')
    for s, lst in list(out.items())[:25]:
        print(f'  {s:14s} ' + '   '.join(f"{x['reading']} ×{x['n']}" for x in lst[:4]))
