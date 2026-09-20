"""Check a stronger reader's marks against hidden test pairs, then merge them.

  python3 pipeline/21_reader_merge.py --dir <folder with batch-NNN.txt, map-NNN.json, labels-NNN.jsonl>

The pairs the cheap model was unsure of are read again by a stronger reader, a
batch at a time. Every batch hides twenty pairs from the held-out check set, on
which two markers agreed. A batch is merged only if its reader matches them on
at least 80% of what the kind is used for; otherwise it is reported and left
out. Writes data/pair-read.jsonl: one line per pair, keyed like pair-kinds.jsonl.
"""
import argparse, collections, glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio
from relkinds import RELATION_KINDS, USE

PASS = 0.80
HERE = os.path.join(os.path.dirname(__file__), '..')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True)
    ap.add_argument('--gold', default=os.path.join(HERE, 'checkset', 'pairs-heldout'))
    ap.add_argument('--reader', default='anthropic/claude-fable-5.1, read in a working session')
    a = ap.parse_args()
    A = json.load(open(a.gold + '.astra.json'))['labels']; F = json.load(open(a.gold + '.fable.json'))['labels']
    gold = {i: A[i]['kind'] for i in A if i in F and A[i]['kind'] == F[i]['kind']}
    merged, tot_ok, tot_n = {}, 0, 0
    for path in sorted(glob.glob(os.path.join(a.dir, 'labels-*.jsonl'))):
        b = re.search(r'labels-(\d+)\.jsonl$', path).group(1)
        mp = json.load(open(os.path.join(a.dir, f'map-{b}.json')))
        rows, bad = {}, 0
        for line in open(path):
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                bad += 1; continue
            if r.get('n') in mp and r.get('kind') in RELATION_KINDS:
                rows[r['n']] = r
            else:
                bad += 1
        g = [(n, m['key']) for n, m in mp.items() if m['type'] == 'gold' and n in rows and m['key'] in gold]
        kind_ok = sum(rows[n]['kind'] == gold[k] for n, k in g)
        use_ok = sum(USE[rows[n]['kind']] == USE[gold[k]] for n, k in g)
        share = use_ok / max(len(g), 1)
        verdict = 'merged' if share >= PASS and len(rows) >= 0.95 * len(mp) else 'LEFT OUT'
        print(f'batch {b}: {len(rows)}/{len(mp)} lines, {bad} unreadable; hidden test pairs: same kind {kind_ok}/{len(g)}, same use {use_ok}/{len(g)} -> {verdict}')
        if verdict == 'merged':
            tot_ok += kind_ok; tot_n += len(g)
            for n, m in mp.items():
                if m['type'] == 'pair' and n in rows:
                    r = rows[n]
                    merged[m['key']] = {'key': m['key'], 'kind': r['kind'], 'sure': bool(r.get('sure', True)),
                                        'direction': r.get('dir') or '', 'reader': a.reader, 'batch': b}
    out = os.path.join(textio.DATA, 'pair-read.jsonl')
    old = {}
    if os.path.exists(out):
        for line in open(out):
            r = json.loads(line); old[r['key']] = r
    old.update(merged)
    with open(out, 'w') as f:
        for r in old.values():
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'\nmerged {len(merged):,} pairs this run, {len(old):,} read in all; on hidden test pairs the merged batches match the markers {tot_ok}/{tot_n}')
    print('kinds among pairs read:', dict(collections.Counter(r['kind'] for r in old.values()).most_common()))
