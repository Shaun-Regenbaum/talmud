"""Cut reader batches for the bare-title mentions that sit in a name pair and that the rules could not settle.
Each batch: 380 unsure mentions + 20 rule-settled ones as hidden checks. Passage = +-160 characters."""
import json, os, random, sys, collections
sys.path.insert(0, os.path.dirname(__file__))
import textio
H = os.environ.get('BARE_DIR') or os.path.join(textio.DATA, 'bare-titles-work')  # working folder: context, sorted list, reader batches
os.makedirs(H, exist_ok=True)
OUT = f'{H}/reader'; os.makedirs(OUT, exist_ok=True)
BARE = {'רב', 'רבי', "ר'", 'מר'}
res = {(r['corpus'], r['work'], r['unit'], r['addr'], r['start']): r for r in json.load(open(f'{H}/sorted.json'))}
need = set()
for l in open(textio.DATA + '/pairs-final.jsonl'):
    r = json.loads(l); p = r['key'].split('|')
    for nm, st in ((r['a'], p[4]), (r['b'], p[5])):
        if nm in BARE:
            need.add((p[0], p[1], p[2], p[3], int(st)))
bykey = collections.defaultdict(list)
for k in need:
    bykey[k[:4]].append(k)
wit = textio.primary_witness()
passages = {}
for c, w, wt, unit, addr, t in textio.segments():
    if wit.get((c, w)) != wt:
        continue
    for k in bykey.get((c, w, unit, addr), []):
        st = k[4]; r = res[k]; ln = len(r['surface'])
        passages[k] = (t[max(0, st - 160):st] + '⟦' + t[st:st + ln] + '⟧' + t[st + ln:st + ln + 160]).replace('\t', ' ').replace('\n', ' ')
print('passages', len(passages), 'of', len(need))
rng = random.Random(20260927)
unsure = sorted(k for k in need if res[k]['class'] == 'unsure' and k in passages); rng.shuffle(unsure)
settled = sorted(k for k in need if res[k]['class'] != 'unsure' and k in passages)
PER, HID = 380, 20
nb = -(-len(unsure) // PER)
for b in range(1, nb + 1):
    chunk = [('q', k) for k in unsure[(b - 1) * PER:b * PER]] + [('check', k) for k in rng.sample(settled, HID)]
    rng.shuffle(chunk)
    with open(f'{OUT}/batch-{b:03d}.txt', 'w') as f:
        for n, (_, k) in enumerate(chunk):
            f.write(f'{n:03d}\t{passages[k]}\n')
    json.dump({f'{n:03d}': {'type': t, 'key': list(k), 'rule': res[k]['class']} for n, (t, k) in enumerate(chunk)},
              open(f'{OUT}/map-{b:03d}.json', 'w'), ensure_ascii=False)
print('batches', nb, 'unsure', len(unsure), 'settled pool', len(settled))
