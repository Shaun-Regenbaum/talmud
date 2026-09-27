"""Make a cleaner view of the rough name map, without deciding who anyone is.

- A lone "ר'" is almost always a name the finder cut short: its links move to a needs-checking list.
- A lone "רב", "רבי" or "מר" is often a real person (Rav, Rabbi Yehuda HaNasi) and sometimes a cut-short name:
  it stays, with a warning.
- Every link gets a strength: strong (3+ passages and at least one sure reading), medium (2+ passages),
  weak (one passage).
- Links whose only use is "the names stand near each other" leave the main view: they claim no relation.

Input: data/$SAGE_MAP/edges.csv, nodes.csv (default map-v1). Output: data/$SAGE_MAP.1/edges.csv, nodes.csv, needs-checking.csv, summary.json
"""
import collections
import csv
import json
import os
import pathlib

DATA = pathlib.Path(os.environ.get('SAGE_NETWORK_DATA', pathlib.Path(__file__).resolve().parent.parent / 'data'))
MAP = os.environ.get('SAGE_MAP', 'map-v1')
IN, OUT = DATA / MAP, DATA / f'{MAP}.1'
CUT_SHORT = {"ר'"}
AMBIGUOUS = {'רב': 'Rav, or a name cut short', 'רבי': 'Rabbi Yehuda HaNasi, or a name cut short', 'מר': '"the master", or a name cut short'}


def main():
    edges = list(csv.DictReader((IN / 'edges.csv').open()))
    nodes = {n['name']: n for n in csv.DictReader((IN / 'nodes.csv').open())}
    keep, check = [], []
    strength = collections.Counter()
    for e in edges:
        uses = json.loads(e['uses'])
        main_use = max(uses, key=uses.get)
        passages = sum(len(v) for v in json.loads(e['sample_refs']).values())
        rows = int(e['rows'])
        sure = json.loads(e['certainty']).get('sure', 0) + json.loads(e['sources']).get('rule', 0)
        e['main_use'] = main_use
        e['strength'] = 'strong' if rows >= 3 and sure >= 1 else 'medium' if rows >= 2 else 'weak'
        warn = [AMBIGUOUS[x] for x in (e['a'], e['b']) if x in AMBIGUOUS]
        e['warning'] = '; '.join(warn)
        if e['a'] in CUT_SHORT or e['b'] in CUT_SHORT:
            e['why_set_aside'] = 'a lone ר’ is a name the finder cut short'
            check.append(e)
        elif main_use == 'nothing':
            continue  # the names only stand near each other; no relation is claimed
        else:
            keep.append(e)
            strength[e['strength']] += 1
    OUT.mkdir(parents=True, exist_ok=True)
    cols = ['a', 'b', 'rows', 'main_use', 'strength', 'warning', 'top_kind', 'kinds', 'directed', 'certainty', 'sources', 'sample_refs', 'status']
    with (OUT / 'edges.csv').open('w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore'); w.writeheader(); w.writerows(keep)
    with (OUT / 'needs-checking.csv').open('w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols + ['why_set_aside'], extrasaction='ignore'); w.writeheader(); w.writerows(check)
    used = {x for e in keep for x in (e['a'], e['b'])}
    with (OUT / 'nodes.csv').open('w', newline='') as f:
        w = csv.writer(f); w.writerow(['name', 'spellings', 'warning', 'links_in_view', 'status'])
        deg = collections.Counter(x for e in keep for x in (e['a'], e['b']))
        for name in sorted(used, key=lambda n: -deg[n]):
            w.writerow([name, nodes[name]['spellings'], AMBIGUOUS.get(name, ''), deg[name], 'unverified: a name string, not a person'])
    summary = {'links_before': len(edges), 'links_in_view': len(keep), 'set_aside_cut_short': len(check),
               'dropped_near_each_other_only': len(edges) - len(keep) - len(check), 'names_in_view': len(used),
               'strength': dict(strength), 'links_touching_ambiguous_titles': sum(1 for e in keep if e['warning']),
               'status': 'Unverified. A cleaner view of names, not people.'}
    (OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
