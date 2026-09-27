"""Join the labelled name pairs into a first map of NAMES, every link marked unverified.

A node is a name string as the finder read it, not a person: one string may cover several men, and one man may
appear under several strings. A link joins two names that stood near each other in at least one passage, with
every label the pair received, the direction where one was read, how sure the readers were, and sample passages.

Input:  data/pairs-final.jsonl (from 23_pairs_final.py)
Output: data/$SAGE_MAP/nodes.csv, edges.csv, summary.json (default map-v1)
"""
import collections
import csv
import json
import os
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from relkinds import USE  # noqa: E402

DATA = pathlib.Path(os.environ.get('SAGE_NETWORK_DATA', pathlib.Path(__file__).resolve().parent.parent / 'data'))
MAP = os.environ.get('SAGE_MAP', 'map-v1')  # map-v0 (24 Sep) was built before the weekend's full reading
OUT = DATA / MAP
# Only the title's spelling is joined: ר' is the short way to write רבי. This decides nothing about who is meant.
BARE = {'רב', 'רבי', "ר'", 'מר'}  # a title with no name after it: Rav, Rebbi, or a word the finder could not complete


def spelling(name):
    name = re.sub(r"^ר'\s+", 'רבי ', name)
    return re.sub(r"(^|\s)בר'\s+", r'\1ברבי ', name)


def main():
    rows = [json.loads(line) for line in (DATA / 'pairs-final.jsonl').open() if line.strip()]
    nodes = collections.defaultdict(lambda: {'pair_rows': 0, 'passages': set(), 'corpora': collections.Counter(), 'partners': set()})
    edges = collections.defaultdict(lambda: {'rows': 0, 'kinds': collections.Counter(), 'uses': collections.Counter(),
                                             'directed': collections.Counter(), 'certainty': collections.Counter(),
                                             'sources': collections.Counter(), 'refs': collections.defaultdict(list)})
    spellings = collections.defaultdict(set)
    same_spelling_pairs = 0
    for r in rows:
        spellings[spelling(r['a'])].add(r['a'])
        spellings[spelling(r['b'])].add(r['b'])
        a, b, kind = spelling(r['a']), spelling(r['b']), r.get('kind') or 'open'
        if a == b:
            same_spelling_pairs += 1  # one name written twice, or two spellings of one name, in one passage
            continue
        corpus = r['key'].split('|', 1)[0]
        for x, y in ((a, b), (b, a)):
            n = nodes[x]
            n['pair_rows'] += 1
            n['passages'].add(r['ref'])
            n['corpora'][corpus] += 1
            n['partners'].add(y)
        x, y = sorted((a, b))
        e = edges[(x, y)]
        e['rows'] += 1
        e['kinds'][kind] += 1
        e['uses'][USE.get(kind, 'open')] += 1
        if r.get('direction') in ('AB', 'BA'):
            frm, to = (a, b) if r['direction'] == 'AB' else (b, a)
            e['directed'][f'{kind}: {frm} -> {to}'] += 1
        e['certainty'][{True: 'sure', False: 'uncertain'}.get(r.get('sure'), 'not_marked')] += 1
        e['sources'][r.get('source')] += 1
        if len(e['refs'][kind]) < 3 and r['ref'] not in e['refs'][kind]:
            e['refs'][kind].append(r['ref'])
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / 'nodes.csv').open('w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['name', 'spellings', 'bare_title', 'pair_rows', 'passages', 'partners', 'corpora', 'status'])
        for name, n in sorted(nodes.items(), key=lambda kv: -kv[1]['pair_rows']):
            w.writerow([name, json.dumps(sorted(spellings[name]), ensure_ascii=False), name in BARE, n['pair_rows'], len(n['passages']),
                        len(n['partners']), json.dumps(dict(n['corpora']), ensure_ascii=False), 'unverified: a name string, not a person'])
    with (OUT / 'edges.csv').open('w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['a', 'b', 'rows', 'top_kind', 'kinds', 'uses', 'directed', 'certainty', 'sources', 'sample_refs', 'status'])
        for (x, y), e in sorted(edges.items(), key=lambda kv: -kv[1]['rows']):
            w.writerow([x, y, e['rows'], e['kinds'].most_common(1)[0][0], json.dumps(dict(e['kinds'])), json.dumps(dict(e['uses'])),
                        json.dumps(dict(e['directed']), ensure_ascii=False), json.dumps(dict(e['certainty'])), json.dumps(dict(e['sources'])),
                        json.dumps(dict(e['refs']), ensure_ascii=False), 'unverified'])
    uses = collections.Counter()
    for e in edges.values():
        uses[max(e['uses'], key=e['uses'].get)] += 1
    degree = sorted(nodes.items(), key=lambda kv: -len(kv[1]['partners']))
    summary = {
        'pair_rows': len(rows), 'pairs_within_one_name': same_spelling_pairs,
        'names': len(nodes), 'names_written_two_ways': sum(1 for v in spellings.values() if len(v) > 1),
        'bare_titles': {b: len(nodes[b]['partners']) for b in BARE if b in nodes},
        'links': len(edges),
        'links_by_main_use': dict(uses.most_common()),
        'links_seen_once': sum(1 for e in edges.values() if e['rows'] == 1),
        'links_with_a_direction': sum(1 for e in edges.values() if e['directed']),
        'links_all_sure': sum(1 for e in edges.values() if set(e['certainty']) == {'sure'}),
        'names_with_one_partner': sum(1 for n in nodes.values() if len(n['partners']) == 1),
        'most_connected': [(name, len(n['partners']), n['pair_rows']) for name, n in degree[:25]],
        'status': 'Unverified. Nodes are name strings, not people. Links record what nearby names were labelled in single passages.',
    }
    (OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    print(json.dumps({k: v for k, v in summary.items() if k != 'most_connected'}, ensure_ascii=False, indent=1))
    print('most connected:', ', '.join(f'{n} ({p})' for n, p, _ in summary['most_connected'][:15]))


if __name__ == '__main__':
    main()
