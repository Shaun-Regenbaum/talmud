"""Who keeps company with whom.

Two names in one segment is the feature that both merges and splits names:
never appearing together is evidence of being one man, and often appearing
together is evidence of being two. Nothing here reads a biography.

  python3 pipeline/03_association.py [--corpus bavli]
"""
import argparse, collections, json, math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio, names

OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
MIN_MENTIONS = 5      # below this a name cannot support a clustering claim


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', default=None)
    a = ap.parse_args()

    freq = collections.Counter()
    rows = []
    for c, w, wit, unit, i, t in textio.primary_witness_segments(a.corpus):
        ns = {n for _, n in names.find(t)}
        for n in ns:
            freq[n] += 1
        if ns:
            rows.append((w, unit, i, ns))

    keep = {n for n, c in freq.items() if c >= MIN_MENTIONS}
    seg = collections.Counter()
    page = collections.defaultdict(set)
    for w, unit, i, ns in rows:
        ns = sorted(ns & keep)
        for x in range(len(ns)):
            page[(w, unit)].add(ns[x])
            for y in range(x + 1, len(ns)):
                seg[(ns[x], ns[y])] += 1
    pagepair = collections.Counter()
    for names_on_page in page.values():
        ps = sorted(names_on_page)
        for x in range(len(ps)):
            for y in range(x + 1, len(ps)):
                pagepair[(ps[x], ps[y])] += 1

    # association above chance, so a common name does not dominate
    total = sum(pagepair.values()) or 1
    marg = collections.Counter()
    for (x, y), n in pagepair.items():
        marg[x] += n; marg[y] += n
    pmi = {}
    for (x, y), n in pagepair.items():
        if n < 5:
            continue
        px, py = marg[x] / (2 * total), marg[y] / (2 * total)
        pmi[(x, y)] = (round(math.log((n / total) / (px * py)), 3), n)

    with open(os.path.join(OUT, 'association.json'), 'w') as f:
        json.dump({'corpus': a.corpus or 'all',
                   'namesKept': len(keep), 'namesSeen': len(freq),
                   'freq': freq.most_common(),
                   'coSegment': {f'{x}|{y}': n for (x, y), n in seg.most_common(8000)},
                   'coPage': {f'{x}|{y}': n for (x, y), n in pagepair.most_common(12000)},
                   'pmi': {f'{x}|{y}': v for (x, y), v in
                           sorted(pmi.items(), key=lambda k: -k[1][0])[:3000]}},
                  f, ensure_ascii=False)
    print(f'names seen        : {len(freq):,}')
    print(f'names kept ({MIN_MENTIONS}+)  : {len(keep):,}')
    print(f'pairs in a segment: {len(seg):,}')
    for (x, y), n in seg.most_common(10):
        print(f'  {n:5d}  {x}  +  {y}')


if __name__ == '__main__':
    main()
