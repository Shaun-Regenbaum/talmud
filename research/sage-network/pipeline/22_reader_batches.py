"""Cut the pairs the cheap model was unsure of into batches for a stronger reader.

  python3 pipeline/22_reader_batches.py --dir <folder> --first 1 --batches 6

The reading order is fixed once (seeded) and saved as queue.json in the folder,
so later runs carry on where the last stopped and never hand out a pair twice.
Left out of the queue: pairs the same-string rule settles, pairs the cheap model
is 0.9 sure of (--below sets the line), and every pair in a check set.

Each batch is 380 queue pairs plus 20 held-out pairs on which both markers agreed,
shuffled together with neutral numbers. map-NNN.json says which line is which and
is not for the reader. 21_reader_merge.py scores the hidden pairs and merges.
"""
import argparse, json, os, random, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import judged, lexicon, textio
from relkinds import READER_GUIDE

HERE = os.path.join(os.path.dirname(__file__), '..')
PER, HIDDEN, SEED = 380, 20, 20260920


def same_string(a, b):
    strip = lambda s: re.sub(r"^(רבי|ר'|רב|רבן) ", 'T ', s)                 # noqa: E731
    return a == b or strip(a) == strip(b)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True); ap.add_argument('--first', type=int, default=1)
    ap.add_argument('--batches', type=int, default=6); ap.add_argument('--below', type=float, default=0.7)
    a = ap.parse_args()
    os.makedirs(a.dir, exist_ok=True)
    jev = {}
    for line in open(os.path.join(textio.DATA, 'pair-kinds.jsonl')):
        r = json.loads(line); jev[r['key']] = r
    lx = lexicon.Lexicon.load(os.path.join(textio.DATA, 'lexicon.json'))
    pairs = {p['key']: p for p in judged.pairs(lx)}
    qpath = os.path.join(a.dir, 'queue.json')
    if os.path.exists(qpath):
        queue = json.load(open(qpath))
    else:
        in_check = {(x['ref'], x['a'], x['b']) for f in ('pairs-dev.json', 'pairs-heldout.json')
                    for x in json.load(open(os.path.join(HERE, 'checkset', f)))['items']}
        queue = [k for k, p in pairs.items() if k in jev and (jev[k].get('confidence') or 0) < a.below
                 and not same_string(p['a'], p['b']) and (p['ref'], p['a'], p['b']) not in in_check]
        random.Random(SEED).shuffle(queue)
        json.dump(queue, open(qpath, 'w'))
    gold_items = json.load(open(os.path.join(HERE, 'checkset', 'pairs-heldout.json')))['items']
    A = json.load(open(os.path.join(HERE, 'checkset', 'pairs-heldout.astra.json')))['labels']
    F = json.load(open(os.path.join(HERE, 'checkset', 'pairs-heldout.fable.json')))['labels']
    gold = [g for g in gold_items if A[g['id']]['kind'] == F[g['id']]['kind']]
    with open(os.path.join(a.dir, 'HOW-TO-MARK.md'), 'w') as f:
        f.write(READER_GUIDE)
    for b in range(a.first, a.first + a.batches):
        rng = random.Random(SEED + b)
        chunk = [('pair', k, pairs[k]['marked']) for k in queue[(b - 1) * PER:b * PER] if k in pairs]
        if not chunk:
            print(f'batch {b:03d}: the queue is finished'); break
        chunk += [('gold', x['id'], x['marked']) for x in rng.sample(gold, HIDDEN)]
        rng.shuffle(chunk)
        with open(os.path.join(a.dir, f'batch-{b:03d}.txt'), 'w') as f:
            for n, (_, _, m) in enumerate(chunk):
                f.write(f"{n:03d}\t{m.replace(chr(10), ' ').replace(chr(9), ' ')}\n")
        json.dump({f'{n:03d}': {'type': t, 'key': k} for n, (t, k, _) in enumerate(chunk)},
                  open(os.path.join(a.dir, f'map-{b:03d}.json'), 'w'))
    print(f'queue: {len(queue):,} pairs, {-(-len(queue) // PER)} batches in all; wrote batches {a.first} to {a.first + a.batches - 1}')
