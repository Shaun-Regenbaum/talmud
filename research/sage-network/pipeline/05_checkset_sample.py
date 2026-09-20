"""Draw the passages that the marker models will label.

  python3 pipeline/05_checkset_sample.py --n 28 --out checkset/pilot.json

The sample is drawn from the TEXT, not from what the pipeline found, so that
names the finder misses can be counted as misses. Two strata, recorded on each
item so rates can be re-weighted:

  titled   the passage contains a title token; most names live here
  any      drawn uniformly, so a passage the finder thinks is empty still has a
           chance of being looked at

Seeded, so the same command draws the same passages. Each item carries its
edition, reference, licence and a fingerprint, like research/pilot-v1.
"""
import argparse, hashlib, json, os, random, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio

TITLE = re.compile(r"(?<![א-ת])[ודלכבמש]{0,2}(רבי|רב|רבן|ר'|א\"ר)(?![א-ת])")
MIN_CHARS, MAX_CHARS = 40, 650

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=28)
    ap.add_argument('--seed', type=int, default=20260920)
    ap.add_argument('--titled-share', type=float, default=0.7)
    ap.add_argument('--out', required=True)
    ap.add_argument('--exclude', nargs='*', default=[], help='earlier samples whose items must not be drawn again')
    a = ap.parse_args()
    taken = set()
    for p in a.exclude:
        taken |= {x['id'] for x in json.load(open(p))['items']}
    rng = random.Random(a.seed)
    pools = {}
    lic = {}
    for u in textio.units():
        lic[(u['work'], u['witness'])] = (u.get('license'), u.get('sourceUrl'))
    chosen = textio.primary_witness()
    for c, w, wit, unit, addr, t in textio.segments():
        if chosen.get((c, w)) != wit or not (MIN_CHARS <= len(t) <= MAX_CHARS):
            continue
        iid = f'{c}|{w}|{unit}|{addr}'
        if iid in taken:
            continue
        pools.setdefault((c, 'titled' if TITLE.search(t) else 'plain'), []).append((iid, c, w, wit, unit, addr, t))
    corpora = sorted({c for c, _ in pools})
    per = max(1, a.n // len(corpora))
    items = []
    for c in corpora:
        n_t = round(per * a.titled_share)
        titled = rng.sample(pools.get((c, 'titled'), []), min(n_t, len(pools.get((c, 'titled'), []))))
        rest = [x for k in ('titled', 'plain') for x in pools.get((c, k), []) if x not in titled]
        anyp = rng.sample(rest, min(per - len(titled), len(rest)))
        for stratum, group in (('titled', titled), ('any', anyp)):
            for iid, cc, w, wit, unit, addr, t in group:
                l, url = lic.get((w, wit), (None, None))
                items.append({'id': iid, 'corpus': cc, 'work': w, 'edition': wit, 'unit': unit, 'addr': addr,
                              'stratum': stratum, 'text': t, 'license': l, 'sourceUrl': url,
                              'sha256': hashlib.sha256(t.encode()).hexdigest()})
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    json.dump({'seed': a.seed, 'titledShare': a.titled_share, 'n': len(items),
               'note': 'Hebrew and Aramaic only. Drawn from the text, not from pipeline output.',
               'items': items}, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(items)} passages from {len(corpora)} bodies of text -> {a.out}')
