"""Type every mention that needs a judgement, with the cheap model.

  TYPESAFE_API_KEY=... python3 pipeline/12_type_all.py --cap 2.50

Reads data/mentions.jsonl (one edition per work), writes data/typing.jsonl, one
line per mention. Resumable: a mention already in the output is skipped, and a
batch is written only when complete. Stops hard on a billing or key error and
at the dollar cap. The answer carries the model's own confidence, because the
check set showed that is what tells a trustworthy answer from a guess: right
99% of the time at 0.9 and above, about half the time below 0.7.
"""
import argparse, json, os, sys, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import textio
from kinds import KINDS, CONVENTIONS

API = 'https://api.typesafe.ai/v1/systemone'
PRICE_PER_M = 0.042


def key_of(m):
    return f"{m['corpus']}|{m['work']}|{m['unit']}|{m['addr']}|{m['start']}"


def call(key, model, chunk):
    state = {'conventions': CONVENTIONS, 'passages': {f'p{i}': x['marked'] for i, x in enumerate(chunk)}}
    questions = {f'p{i}': {'type': 'choice',
                           'instructions': f'In `passages.p{i}`, what is the stretch wrapped in ⟦ ⟧, as it is used there? Apply `conventions`.',
                           'criteria': KINDS} for i in range(len(chunk))}
    req = urllib.request.Request(API, data=json.dumps({'model': model, 'state': state, 'questions': questions}).encode(),
                                 headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode())


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='jev-latest'); ap.add_argument('--batch', type=int, default=20)
    ap.add_argument('--cap', type=float, default=2.5); ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    key = os.environ.get('TYPESAFE_API_KEY') or sys.exit('set TYPESAFE_API_KEY')
    out_path = os.path.join(textio.DATA, 'typing.jsonl')
    done, tokens = set(), 0
    if os.path.exists(out_path):
        for line in open(out_path):
            try:
                r = json.loads(line); done.add(r['key']); tokens += r.get('tok', 0)
            except Exception:
                pass
    prim = textio.primary_witness()
    need = []
    for line in open(os.path.join(textio.DATA, 'mentions.jsonl')):
        m = json.loads(line)
        if prim.get((m['corpus'], m['work'])) != m['witness']:
            continue
        if m['kind'] in ('abbrev', 'bare') or (m['kind'] == 'name' and not m['certain']):
            if key_of(m) not in done:
                need.append(m)
    if a.limit:
        need = need[:a.limit]
    # attach passages in one pass over the text
    want = {(m['corpus'], m['work'], m['witness'], m['unit'], m['addr']) for m in need}
    text = {}
    for c, w, wit, unit, addr, t in textio.segments():
        if (c, w, wit, unit, addr) in want:
            text[(c, w, wit, unit, addr)] = t
    for m in need:
        t = text.get((m['corpus'], m['work'], m['witness'], m['unit'], m['addr']), '')
        lo, hi = max(0, m['start'] - 220), min(len(t), m['end'] + 220)
        m['marked'] = t[lo:m['start']] + '⟦' + t[m['start']:m['end']] + '⟧' + t[m['end']:hi]
    print(f'{len(need):,} mentions to type, {len(done):,} already done, cap ${a.cap:.2f}', flush=True)
    i, fails, t0 = 0, 0, time.time()
    with open(out_path, 'a') as out:
        while i < len(need):
            if tokens * PRICE_PER_M / 1e6 >= a.cap:
                print('STOPPED at the spend cap', flush=True); break
            chunk = need[i:i + a.batch]
            try:
                d = call(key, a.model, chunk)
            except urllib.error.HTTPError as e:
                body = e.read().decode()[:160]
                if e.code in (401, 402, 403):
                    sys.exit(f'STOPPED: {e.code} {body}')
                if e.code == 400 and 'max_tokens' in body and a.batch > 2:
                    a.batch //= 2; continue
                fails += 1
                if fails > 25:
                    sys.exit(f'STOPPED: too many failures, last {e.code} {body}')
                time.sleep(min(60, 3 * fails)); continue
            except Exception as e:                # noqa: BLE001
                fails += 1
                if fails > 25:
                    sys.exit(f'STOPPED: too many failures, last {type(e).__name__}')
                time.sleep(min(60, 3 * fails)); continue
            ans = d.get('answers') or {}
            used = (d.get('usage') or {}).get('input_tokens') or 0
            lines = []
            for j, m in enumerate(chunk):
                r = ans.get(f'p{j}')
                if not r:
                    continue
                lines.append(json.dumps({'key': key_of(m), 'surface': m['surface'], 'mentionKind': m['kind'],
                                         'kind': r.get('choice'), 'confidence': r.get('confidence'),
                                         'p': r.get('probabilities'), 'tok': used // max(len(chunk), 1)},
                                        ensure_ascii=False))
            out.write('\n'.join(lines) + '\n'); out.flush()
            tokens += used; i += a.batch
            if (i // a.batch) % 100 == 0:
                print(f'  {i:,}/{len(need):,}  ${tokens * PRICE_PER_M / 1e6:.3f}  {time.time() - t0:.0f}s', flush=True)
    print(f'done. spent ${tokens * PRICE_PER_M / 1e6:.3f} in total', flush=True)
