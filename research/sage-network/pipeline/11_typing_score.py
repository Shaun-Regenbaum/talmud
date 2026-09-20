"""Do the two markers agree, and how does the cheap model score against them?

  python3 pipeline/11_typing_score.py --sample checkset/typing-dev.json \\
      --a checkset/typing-dev.astra.json --b checkset/typing-dev.fable.json --jev checkset/typing-dev.jev.json
"""
import argparse, collections, json

# what matters downstream: is this mention a sage, or not
IS_SAGE = lambda k: k == 'sage'

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', required=True); ap.add_argument('--a', required=True)
    ap.add_argument('--b', required=True); ap.add_argument('--jev', required=True); ap.add_argument('--out')
    a = ap.parse_args()
    items = {x['id']: x for x in json.load(open(a.sample))['items']}
    A, B, J = (json.load(open(p))['labels'] for p in (a.a, a.b, a.jev))
    ids = [i for i in items if i in A and i in B and i in J]
    agree = [i for i in ids if A[i]['kind'] == B[i]['kind']]
    res = {'items': len(ids), 'markersAgree': len(agree), 'byStratum': {}, 'disagreements': [], 'jevWrong': []}
    print(f'items: {len(ids)}   the two markers agree on the kind: {len(agree)} ({len(agree)/len(ids):.1%})')
    for i in ids:
        if A[i]['kind'] != B[i]['kind']:
            res['disagreements'].append({'id': i, 'surface': items[i]['surface'], 'stratum': items[i]['stratum'],
                                         'astra': A[i]['kind'], 'fable': B[i]['kind'], 'jev': J[i]['kind']})
    print(f'\n{"stratum":10s} {"agreed":>7s} {"jev same kind":>14s} {"jev same sage/not":>18s}')
    tot_k = tot_s = 0
    for st in ('unsure', 'bare', 'bare-sure', 'short'):
        g = [i for i in agree if items[i]['stratum'] == st]
        k = sum(J[i]['kind'] == A[i]['kind'] for i in g)
        s = sum(IS_SAGE(J[i]['kind']) == IS_SAGE(A[i]['kind']) for i in g)
        tot_k += k; tot_s += s
        res['byStratum'][st] = {'agreed': len(g), 'jevSameKind': k, 'jevSameSageOrNot': s}
        print(f'{st:10s} {len(g):7d} {k:8d} {k/max(len(g),1):5.1%} {s:11d} {s/max(len(g),1):5.1%}')
    n = len(agree)
    print(f'{"ALL":10s} {n:7d} {tot_k:8d} {tot_k/n:5.1%} {tot_s:11d} {tot_s/n:5.1%}')
    res['jevSameKind'] = tot_k; res['jevSameSageOrNot'] = tot_s
    # does Jev's own confidence tell us when to trust it?
    print('\nJev confidence against being right (kind):')
    for lo, hi in ((0.9, 1.01), (0.7, 0.9), (0.0, 0.7)):
        g = [i for i in agree if lo <= (J[i].get('confidence') or 0) < hi]
        ok = sum(J[i]['kind'] == A[i]['kind'] for i in g)
        res.setdefault('byConfidence', []).append({'from': lo, 'to': min(hi, 1.0), 'n': len(g), 'right': ok})
        print(f'  confidence {lo:.1f}-{min(hi,1.0):.1f}: {len(g):4d} items, right {ok:4d} ({ok/max(len(g),1):.1%})')
    for i in agree:
        if J[i]['kind'] != A[i]['kind']:
            res['jevWrong'].append({'id': i, 'surface': items[i]['surface'], 'stratum': items[i]['stratum'],
                                    'markers': A[i]['kind'], 'jev': J[i]['kind'], 'confidence': J[i].get('confidence'),
                                    'passage': items[i]['marked'][170:300]})
    print(f'\nwhere Jev differs from both markers ({len(res["jevWrong"])}):')
    for w in res['jevWrong'][:16]:
        print(f'  {w["stratum"]:9s} {w["surface"]:14s} markers={w["markers"]:9s} jev={w["jev"]:9s} conf={w["confidence"]}')
    print(f'\nwhere the markers split ({len(res["disagreements"])}):')
    for w in res['disagreements'][:10]:
        print(f'  {w["stratum"]:9s} {w["surface"]:14s} astra={w["astra"]:9s} fable={w["fable"]:9s} jev={w["jev"]}')
    if a.out:
        json.dump(res, open(a.out, 'w'), ensure_ascii=False, indent=1)
