"""Type every mention that needs a judgement, with the cheap model.

  TYPESAFE_API_KEY=... python3 pipeline/12_type_all.py --cap 2.50

Reads data/mentions.jsonl (one edition per work), writes data/typing.jsonl, one
line per mention. Resumable: a mention already in the output is skipped, and a
batch is written only when complete. Batches go out several at a time. A request
that hangs is dropped after a minute and tried again, and every failure is
printed, so a stall is never silent. Stops hard on a billing or key error and
at the dollar cap. The answer carries the model's own confidence, because the
check set showed that is what tells a trustworthy answer from a guess: right
99% of the time at 0.9 and above, about half the time below 0.7.
"""
import argparse, json, os, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, os.path.dirname(__file__))
import judged, textio
from judged import key_of
from kinds import KINDS, CONVENTIONS

API = 'https://api.typesafe.ai/v1/systemone'
PRICE_PER_M = 0.042
TIMEOUT = 60          # a request that hangs is dropped and tried again, not waited on
MAX_TRIES = 6


def call(key, model, chunk):
    state = {'conventions': CONVENTIONS, 'passages': {f'p{i}': x['marked'] for i, x in enumerate(chunk)}}
    questions = {f'p{i}': {'type': 'choice',
                           'instructions': f'In `passages.p{i}`, what is the stretch wrapped in ⟦ ⟧, as it is used there? Apply `conventions`.',
                           'criteria': KINDS} for i in range(len(chunk))}
    req = urllib.request.Request(API, data=json.dumps({'model': model, 'state': state, 'questions': questions}).encode(),
                                 headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode())


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='jev-latest'); ap.add_argument('--batch', type=int, default=20)
    ap.add_argument('--cap', type=float, default=2.5); ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--workers', type=int, default=8)
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
    need = judged.mentions(skip=done)
    if a.limit:
        need = need[:a.limit]
    judged.attach_passages(need)
    print(f'{len(need):,} mentions to type, {len(done):,} already done, cap ${a.cap:.2f}', flush=True)

    class Stop(Exception):
        pass

    def typed(chunk):
        """One batch, with retries. A batch too long for the model is split in two."""
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
                    return typed(chunk[:mid]) + typed(chunk[mid:])
                print(f'  retry {attempt}: HTTP {e.code} {body}', flush=True)
            except Exception as e:                # noqa: BLE001
                print(f'  retry {attempt}: {type(e).__name__}', flush=True)
            else:
                ans = d.get('answers') or {}
                used = (d.get('usage') or {}).get('input_tokens') or 0
                rows = []
                for j, m in enumerate(chunk):
                    r = ans.get(f'p{j}')
                    if r:
                        rows.append({'key': key_of(m), 'surface': m['surface'], 'mentionKind': m['kind'],
                                     'kind': r.get('choice'), 'confidence': r.get('confidence'),
                                     'p': r.get('probabilities'), 'tok': used // max(len(chunk), 1)})
                return rows
            time.sleep(min(30, 3 * attempt))
        print(f'  gave up on a batch of {len(chunk)} starting at {key_of(chunk[0])}; a rerun picks it up', flush=True)
        return []

    halt, t0, n_done, n_batches = threading.Event(), time.time(), 0, 0
    chunks = [need[i:i + a.batch] for i in range(0, len(need), a.batch)]
    with open(out_path, 'a') as out, ThreadPoolExecutor(a.workers) as pool:
        # Handed out a window at a time, so the dollar cap is checked between windows.
        for w in range(0, len(chunks), a.workers * 4):
            if tokens * PRICE_PER_M / 1e6 >= a.cap:
                print('STOPPED at the spend cap', flush=True); break
            futures = [pool.submit(typed, c) for c in chunks[w:w + a.workers * 4]]
            try:
                for f in as_completed(futures):
                    rows = f.result()
                    if rows:
                        out.write('\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n'); out.flush()
                        tokens += sum(r['tok'] for r in rows); n_done += len(rows)
                    n_batches += 1
                    if n_batches % 100 == 0:
                        print(f'  {n_done:,}/{len(need):,}  ${tokens * PRICE_PER_M / 1e6:.3f}  {time.time() - t0:.0f}s', flush=True)
            except Stop as e:
                halt.set()
                sys.exit(f'STOPPED: {e}')
    print(f'done. typed {n_done:,} of {len(need):,}, spent ${tokens * PRICE_PER_M / 1e6:.3f} in total', flush=True)
