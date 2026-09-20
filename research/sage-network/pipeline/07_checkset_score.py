"""How far do the two markers agree, and how does the finder score against them?

  python3 pipeline/07_checkset_score.py --sample checkset/pilot.json \\
          --a checkset/pilot.astra.json --b checkset/pilot.fable.json

Agreement between the markers is the ceiling: the pipeline cannot be shown to
be more right than the two references are with each other. Only names BOTH
markers reported count as the reference. Names only one reported are listed,
not scored, because nobody has settled them.
"""
import argparse, collections, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import lexicon, names, textio


def norm_name(s):
    """Compare names, not typography: ר' and רבי are the same title."""
    s = s.strip().replace("ר' ", 'רבי ')
    return ' '.join(s.split())


def spans(text, mentions, kinds=('sage',)):
    """Where each reported name sits on the page. Names are matched to the page
    in reading order, so the second רבי יוחנן finds the second occurrence."""
    out, cursor = [], 0
    for m in mentions:
        t = (m.get('text') or '').strip()
        if not t:
            continue
        i = text.find(t, cursor)
        if i < 0:
            i = text.find(t)
        if i < 0:
            continue
        cursor = i + len(t)
        if m.get('kind') in kinds:
            out.append((i, i + len(t), t))
    return out


def overlap(a, b):
    return min(a[1], b[1]) - max(a[0], b[0]) > 0


def pair_up(xs, ys):
    """Greedy one-to-one matching of spans that overlap. Returns pairs, left over xs, left over ys."""
    used, pairs = set(), []
    for x in xs:
        j = next((k for k, y in enumerate(ys) if k not in used and overlap(x, y)), None)
        if j is not None:
            used.add(j); pairs.append((x, ys[j]))
    return pairs, [x for x in xs if not any(x is p[0] for p in pairs)], [y for k, y in enumerate(ys) if k not in used]


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', required=True); ap.add_argument('--a', required=True); ap.add_argument('--b', required=True)
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    items = {x['id']: x for x in json.load(open(a.sample))['items']}
    A, B = json.load(open(a.a)), json.load(open(a.b))
    lx = lexicon.Lexicon.load(os.path.join(textio.DATA, 'lexicon.json'))

    both = onlyA = onlyB = 0
    tp = fp = fn = exact = 0
    fp_sure = 0
    disagreements, misses, extras, boundary = [], [], [], []
    kind_same = kind_diff = 0
    for iid, it in items.items():
        la, lb = A['labels'].get(iid), B['labels'].get(iid)
        if not la or not lb:
            continue
        text = it['text']
        sa, sb = spans(text, la['mentions']), spans(text, lb['mentions'])
        ref_pairs, a_only, b_only = pair_up(sa, sb)
        both += len(ref_pairs); onlyA += len(a_only); onlyB += len(b_only)
        for x in a_only: disagreements.append((iid, 'only ' + A['model'].split('/')[-1], x[2]))
        for x in b_only: disagreements.append((iid, 'only ' + B['model'].split('/')[-1], x[2]))
        ka = {m['text'].strip(): m.get('kind') for m in la['mentions']}
        kb = {m['text'].strip(): m.get('kind') for m in lb['mentions']}
        for n in set(ka) & set(kb):
            kind_same += ka[n] == kb[n]; kind_diff += ka[n] != kb[n]
        # the reference is the span both markers gave; take the wider of the two
        ref = [(min(x[0], y[0]), max(x[1], y[1]), x[2]) for x, y in ref_pairs]
        unsettled = a_only + b_only
        found = [(m.start, m.end, m.surface, bool(m.certain)) for m in names.find(text, lx)]
        hits, missed, extra = pair_up(ref, found)
        tp += len(hits); fn += len(missed)
        for r, f in hits:
            same = norm_name(text[r[0]:r[1]]) == norm_name(text[f[0]:f[1]]) or (r[0], r[1]) == (f[0], f[1])
            exact += same
            if not same:
                boundary.append((iid, r[2], '<>', text[f[0]:f[1]]))
        for r in missed: misses.append((iid, r[2]))
        for f in extra:
            if any(overlap(f, u) for u in unsettled):
                continue                          # one marker gave it: not scored either way
            fp += 1; fp_sure += f[3]
            extras.append((iid, f[2], 'sure' if f[3] else 'flagged'))

    agree = 2 * both / (2 * both + onlyA + onlyB) if both else 0
    P = tp / (tp + fp) if tp + fp else 0; R = tp / (tp + fn) if tp + fn else 0
    res = {'passages': len(items), 'markers': [A['model'], B['model']],
           'sagesBothReported': both, 'onlyA': onlyA, 'onlyB': onlyB, 'markerAgreementF1': round(agree, 3),
           'kindSame': kind_same, 'kindDiff': kind_diff,
           'finder': {'found': tp, 'foundWithTheSameBoundary': exact, 'missed': fn, 'extra': fp, 'extraItWasSureOf': fp_sure,
                      'precision': round(P, 3), 'recall': round(R, 3)},
           'spend': round(A['spend'] + B['spend'], 3),
           'disagreements': disagreements, 'misses': misses, 'extras': extras, 'boundary': boundary}
    print(json.dumps({k: v for k, v in res.items() if k not in ('disagreements', 'misses', 'extras', 'boundary')}, ensure_ascii=False, indent=1))
    print('\nwhere the markers disagree:'); [print('  ', *d) for d in disagreements[:14]]
    print('\nfound, but the finder drew the edge of the name differently:'); [print('  ', *d) for d in boundary[:14]]
    print('\nnames both markers gave that the finder MISSED:'); [print('  ', *d) for d in misses[:14]]
    print('\nstrings the finder reported that NEITHER marker gave:'); [print('  ', *d) for d in extras[:14]]
    if a.out:
        json.dump(res, open(a.out, 'w'), ensure_ascii=False, indent=1)
