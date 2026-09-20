"""Do the two markers agree on what a pattern states, and how do the cheap models do?

  python3 pipeline/16_relation_score.py --a checkset/relations-dev.astra.json \\
      --b checkset/relations-dev.fable.json --test checkset/relations.jev.json checkset/relations.gemflash.json

The reference is a pattern both markers label the same way. Scores are given
twice: per pattern, and weighted by how many name pairs the pattern joins,
because a mistake on "[A] בשם [B]" (4,600 pairs) is not the same size as a
mistake on a pattern seen 50 times.
"""
import argparse, collections, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio
from relkinds import USE

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--a', required=True); ap.add_argument('--b', required=True)
    ap.add_argument('--test', nargs='*', default=[]); ap.add_argument('--out')
    ap.add_argument('--sample', help='a pair sample: every item then counts once, and scores are split by stratum')
    a = ap.parse_args()
    stratum = {}
    if a.sample:
        items = json.load(open(a.sample))['items']
        n_of = {x['id']: 1 for x in items}; stratum = {x['id']: x['stratum'] for x in items}
        shown_as = {x['id']: f"{x['a']} | {x['b']}" for x in items}
    else:
        n_of = {p['pattern']: p['n'] for p in json.load(open(os.path.join(textio.DATA, 'patterns.json')))['patterns']}
        shown_as = {p: p for p in n_of}
    A, B = json.load(open(a.a))['labels'], json.load(open(a.b))['labels']
    both = [p for p in A if p in B and p in n_of]
    agree = [p for p in both if A[p]['kind'] == B[p]['kind']]
    w = lambda ps: sum(n_of[p] for p in ps)                                   # noqa: E731
    res = {'patterns': len(both), 'pairs': w(both), 'markersAgree': len(agree), 'markersAgreePairs': w(agree),
           'disagreements': [], 'models': {}}
    print(f'patterns marked by both: {len(both)}, joining {w(both):,} pairs')
    print(f'the two markers agree on {len(agree)} ({len(agree) / len(both):.1%}), joining {w(agree):,} pairs ({w(agree) / w(both):.1%})')
    for st in sorted(set(stratum.values())):
        g = [p for p in both if stratum[p] == st]
        print(f'  {st:8s} markers agree on {sum(p in agree for p in g)}/{len(g)}')
    use_agree = [p for p in both if USE[A[p]['kind']] == USE[B[p]['kind']]]
    res['markersAgreeOnUse'] = len(use_agree)
    print(f'on what the kind is USED for (order, scene, side-by-side, identity, nothing) they agree on '
          f'{len(use_agree)} ({len(use_agree) / len(both):.1%})')
    print('\nwhere they disagree:')
    for p in sorted((p for p in both if p not in agree), key=lambda p: -n_of[p]):
        res['disagreements'].append({'pattern': p, 'n': n_of[p], 'a': A[p]['kind'], 'b': B[p]['kind']})
        print(f'  {n_of[p]:5d}  {shown_as[p]:44s} {A[p]["kind"]:12s} {B[p]["kind"]}')
    kinds = collections.Counter(); kpairs = collections.Counter()
    for p in agree:
        kinds[A[p]['kind']] += 1; kpairs[A[p]['kind']] += n_of[p]
    print('\nwhat the agreed patterns state:')
    for k, c in kpairs.most_common():
        print(f'  {k:12s} {kinds[k]:4d} patterns  {c:6,d} pairs')
    res['agreedKinds'] = {k: {'patterns': kinds[k], 'pairs': kpairs[k]} for k in kinds}
    for path in a.test:
        T = json.load(open(path)); L = T['labels']
        have = [p for p in agree if p in L]
        right = [p for p in have if L[p]['kind'] == A[p]['kind']]
        print(f'\n{T["model"]}: labelled {len(have)} of the {len(agree)} agreed patterns')
        print(f'  same as the markers: {len(right)} ({len(right) / max(len(have), 1):.1%}) of patterns, '
              f'{w(right) / max(w(have), 1):.1%} of pairs')
        uhave = [p for p in use_agree if p in L]
        uright = sum(USE[L[p]['kind']] == USE[A[p]['kind']] for p in uhave)
        print(f'  same USE as the markers: {uright}/{len(uhave)} ({uright / max(len(uhave), 1):.1%})')
        res_use = {'labelled': len(uhave), 'same': uright}
        for st in sorted(set(stratum.values())):
            g = [p for p in have if stratum[p] == st]
            print(f'    {st:8s} {sum(p in right for p in g)}/{len(g)}')
        wrong = sorted((p for p in have if p not in right), key=lambda p: -n_of[p])
        for p in wrong[:12]:
            print(f'    {n_of[p]:5d}  {shown_as[p]:44s} markers={A[p]["kind"]:10s} model={L[p]["kind"]}')
        res['models'][T['model']] = {'use': res_use, 'labelled': len(have), 'same': len(right), 'samePairsShare': w(right) / max(w(have), 1),
                                     'wrong': [{'pattern': p, 'n': n_of[p], 'markers': A[p]['kind'], 'model': L[p]['kind']} for p in wrong]}
        if any('confidence' in v for v in L.values()):
            print('  its own confidence against being right:')
            for lo, hi in ((0.9, 1.01), (0.7, 0.9), (0.0, 0.7)):
                g = [p for p in have if lo <= (L[p].get('confidence') or 0) < hi]
                if g:
                    print(f'    {lo:.1f}-{min(hi, 1.0):.1f}: {sum(p in right for p in g)}/{len(g)} right')
    if a.out:
        with open(a.out, 'w') as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
