"""Say what every pair of neighbouring names states, with the cheap model.

  TYPESAFE_API_KEY=... python3 pipeline/19_pair_all.py --cap 3.00

Reads the text and the typing answers (judged.pairs), writes data/pair-kinds.jsonl,
one line per pair: the kind, the model's confidence, and its odds over every
kind. The odds are kept because the check set showed the confidence is honest
(52 of 53 right at 0.7 and above, 28 of 45 below), and because a pair the two
frontier markers split on should stay a spread of odds, not a forced label.
Resumable. Several requests at a time, a hung one is dropped after a minute,
every failure is printed. Stops hard on a billing or key error and at the cap.
"""
import argparse, json, os, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, os.path.dirname(__file__))
import judged, lexicon, textio
from relkinds import RELATION_KINDS, PAIR_CONVENTIONS

API = 'https://api.typesafe.ai/v1/systemone'
PRICE_PER_M = 0.042
TIMEOUT, MAX_TRIES = 60, 6


class Stop(Exception):
    pass


def call(key, model, chunk):
    body = {'model': model, 'state': {'conventions': PAIR_CONVENTIONS, 'items': {f'q{i}': {'passage': p['marked']} for i, p in enumerate(chunk)}},
            'questions': {f'q{i}': {'type': 'choice', 'criteria': RELATION_KINDS,
                                    'instructions': f'What does the passage in `items.q{i}` state about A and B? Apply `conventions`.'}
                          for i in range(len(chunk))}}
    req = urllib.request.Request(API, data=json.dumps(body).encode(),
                                 headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode())


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='jev-latest'); ap.add_argument('--batch', type=int, default=10)
    ap.add_argument('--cap', type=float, default=3.0); ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--workers', type=int, default=12)
    a = ap.parse_args()
    key = os.environ.get('TYPESAFE_API_KEY') or sys.exit('set TYPESAFE_API_KEY')
    out_path = os.path.join(textio.DATA, 'pair-kinds.jsonl')
    done, tokens = set(), 0
    if os.path.exists(out_path):
        for line in open(out_path):
            r = json.loads(line); done.add(r['key']); tokens += r.get('tok', 0)
    lx = lexicon.Lexicon.load(os.path.join(textio.DATA, 'lexicon.json'))
    need = [p for p in judged.pairs(lx) if p['key'] not in done]
    if a.limit:
        need = need[:a.limit]
    print(f'{len(need):,} pairs to judge, {len(done):,} already done, cap ${a.cap:.2f}', flush=True)
    halt = threading.Event()

    def judged_chunk(chunk):
        for attempt in range(1, MAX_TRIES + 1):
            if halt.is_set():
                return []
            try:
                d = call(key, a.model, chunk)
            except urllib.error.HTTPError as e:
                body = e.read().decode()[:160]
                if e.code in (401, 402, 403):
                    raise Stop(f'{e.code} {body}') from e
                if e.code == 400 and 'max_tokens' in body and len(chunk) > 1:
                    mid = len(chunk) // 2
                    return judged_chunk(chunk[:mid]) + judged_chunk(chunk[mid:])
                print(f'  retry {attempt}: HTTP {e.code} {body}', flush=True)
            except Exception as e:                # noqa: BLE001
                print(f'  retry {attempt}: {type(e).__name__}', flush=True)
            else:
                ans = d.get('answers') or {}
                used = (d.get('usage') or {}).get('input_tokens') or 0
                return [{'key': p['key'], 'ref': p['ref'], 'a': p['a'], 'b': p['b'], 'pattern': p['pattern'],
                         'kind': r.get('choice'), 'confidence': r.get('confidence'), 'p': r.get('probabilities'),
                         'tok': used // max(len(chunk), 1)}
                        for j, p in enumerate(chunk) if (r := ans.get(f'q{j}'))]
            time.sleep(min(30, 3 * attempt))
        print(f'  gave up on a batch starting at {chunk[0]["key"]}; a rerun picks it up', flush=True)
        return []

    t0, n_done, n_batches = time.time(), 0, 0
    chunks = [need[i:i + a.batch] for i in range(0, len(need), a.batch)]
    with open(out_path, 'a') as out, ThreadPoolExecutor(a.workers) as pool:
        for w in range(0, len(chunks), a.workers * 4):      # a window at a time, so the cap is checked between windows
            if tokens * PRICE_PER_M / 1e6 >= a.cap:
                print('STOPPED at the spend cap', flush=True); break
            futures = [pool.submit(judged_chunk, c) for c in chunks[w:w + a.workers * 4]]
            try:
                for f in as_completed(futures):
                    rows = f.result()
                    if rows:
                        out.write('\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n'); out.flush()
                        tokens += sum(r['tok'] for r in rows); n_done += len(rows)
                    n_batches += 1
                    if n_batches % 200 == 0:
                        print(f'  {n_done:,}/{len(need):,}  ${tokens * PRICE_PER_M / 1e6:.3f}  {time.time() - t0:.0f}s', flush=True)
            except Stop as e:
                halt.set()
                sys.exit(f'STOPPED: {e}')
    print(f'done. judged {n_done:,} of {len(need):,}, spent ${tokens * PRICE_PER_M / 1e6:.3f} in total', flush=True)
