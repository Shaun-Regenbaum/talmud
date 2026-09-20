"""Second pass: a stronger model types the mentions the cheap model was unsure of.

  OPENROUTER_API_KEY=... python3 pipeline/13_type_hard.py --cap 4.50

The check set showed the cheap model is right 99% of the time when its own
confidence is 0.9 or more, and much less often below that. So everything below
0.9 in data/typing.jsonl is asked again here, with the same question the two
frontier markers were asked. Writes data/typing-hard.jsonl, one line per mention.
Resumable. Stops hard on a billing or key error and at the dollar cap.
"""
import argparse, json, os, re, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, os.path.dirname(__file__))
import judged, textio
from judged import key_of
from kinds import KINDS, MARKER_PROMPT

API = 'https://openrouter.ai/api/v1/chat/completions'
TRUST = 0.9           # the cheap model's answer stands at or above this
TIMEOUT = 120
MAX_TRIES = 5


class Stop(Exception):
    pass


def call(model, key, chunk, effort):
    body = {'model': model, 'temperature': 0, 'max_tokens': 6000, 'reasoning': {'effort': effort},
            'usage': {'include': True}, 'response_format': {'type': 'json_object'},
            'messages': [{'role': 'system', 'content': MARKER_PROMPT},
                         {'role': 'user', 'content': json.dumps(
                             {'items': [{'id': f'p{i}', 'passage': m['marked']} for i, m in enumerate(chunk)]},
                             ensure_ascii=False)}]}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={
        'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'X-Title': 'sage-network typing'})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        d = json.loads(r.read().decode())
    if 'error' in d:
        code = d['error'].get('code')
        if code in (401, 402, 403):
            raise Stop(f"{code} {d['error'].get('message')}")
        raise RuntimeError(d['error'].get('message'))
    m = re.search(r'\{.*\}', d['choices'][0]['message'].get('content') or '', re.S)
    return (json.loads(m.group(0)) if m else {'items': []}), float((d.get('usage') or {}).get('cost') or 0)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='google/gemini-3.8-flash'); ap.add_argument('--batch', type=int, default=15)
    ap.add_argument('--cap', type=float, default=4.5); ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--workers', type=int, default=8); ap.add_argument('--effort', default='low')
    a = ap.parse_args()
    key = os.environ.get('OPENROUTER_API_KEY') or sys.exit('set OPENROUTER_API_KEY')

    first = {}
    for line in open(os.path.join(textio.DATA, 'typing.jsonl')):
        r = json.loads(line); first[r['key']] = r
    out_path = os.path.join(textio.DATA, 'typing-hard.jsonl')
    done, spend = set(), 0.0
    if os.path.exists(out_path):
        for line in open(out_path):
            r = json.loads(line); done.add(r['key']); spend += r.get('cost', 0)
    # unsure, or never answered by the first pass at all
    need = [m for m in judged.mentions(skip=done)
            if (first.get(key_of(m)) or {}).get('confidence') is None or first[key_of(m)]['confidence'] < TRUST]
    if a.limit:
        need = need[:a.limit]
    judged.attach_passages(need)
    print(f'{len(need):,} mentions to type again, {len(done):,} already done, cap ${a.cap:.2f}', flush=True)

    halt = threading.Event()

    def typed(chunk):
        for attempt in range(1, MAX_TRIES + 1):
            if halt.is_set():
                return [], 0.0
            try:
                out, cost = call(a.model, key, chunk, a.effort)
            except urllib.error.HTTPError as e:
                body = e.read().decode()[:160]
                if e.code in (401, 402, 403):
                    raise Stop(f'{e.code} {body}') from e
                print(f'  retry {attempt}: HTTP {e.code} {body}', flush=True)
            except Stop:
                raise
            except Exception as e:                # noqa: BLE001
                print(f'  retry {attempt}: {type(e).__name__}: {str(e)[:120]}', flush=True)
            else:
                by_id = {r.get('id'): r for r in out.get('items') or [] if isinstance(r, dict)}
                rows = []
                for i, m in enumerate(chunk):
                    r = by_id.get(f'p{i}')
                    if r and r.get('kind') in KINDS:
                        rows.append({'key': key_of(m), 'surface': m['surface'], 'kind': r['kind'],
                                     'sure': bool(r.get('sure', True)), 'reading': r.get('reading'),
                                     'model': a.model, 'cost': cost / len(chunk)})
                return rows, cost
            time.sleep(min(30, 3 * attempt))
        print(f'  gave up on a batch of {len(chunk)} starting at {key_of(chunk[0])}; a rerun picks it up', flush=True)
        return [], 0.0

    t0, n_done, n_batches = time.time(), 0, 0
    chunks = [need[i:i + a.batch] for i in range(0, len(need), a.batch)]
    with open(out_path, 'a') as outf, ThreadPoolExecutor(a.workers) as pool:
        # Handed out a window at a time, so the dollar cap is checked between windows.
        for w in range(0, len(chunks), a.workers * 2):
            if spend >= a.cap:
                print(f'STOPPED at the spend cap (${spend:.3f})', flush=True); break
            futures = [pool.submit(typed, c) for c in chunks[w:w + a.workers * 2]]
            try:
                for f in as_completed(futures):
                    rows, cost = f.result()
                    if rows:
                        outf.write('\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n'); outf.flush()
                    spend += cost if rows else 0.0
                    n_done += len(rows); n_batches += 1
                    if n_batches % 50 == 0:
                        print(f'  {n_done:,}/{len(need):,}  ${spend:.3f}  {time.time() - t0:.0f}s', flush=True)
            except Stop as e:
                halt.set()
                sys.exit(f'STOPPED: {e}')
    print(f'done. typed {n_done:,} of {len(need):,}, spent ${spend:.3f} in total', flush=True)
