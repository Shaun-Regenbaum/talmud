"""The cheap typed-judgement model types the mentions. It does the bulk of the work.

  TYPESAFE_API_KEY=... python3 pipeline/10_typing_jev.py \\
        --sample checkset/typing-dev.json --out checkset/typing-dev.jev.json

Jev does not write text. It picks among options and returns a probability for
each, so every answer carries its own doubt. It is priced on input tokens only.
Resumable, with a hard dollar cap.
"""
import argparse, json, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from kinds import KINDS, CONVENTIONS

API = 'https://api.typesafe.ai/v1/systemone'
PRICE_PER_M = 0.042


def call(key, model, chunk):
    state = {'conventions': CONVENTIONS, 'passages': {x['id']: x['marked'] for x in chunk}}
    questions = {x['id']: {
        'type': 'choice',
        'instructions': f'In `passages.{x["id"]}`, what is the stretch wrapped in ⟦ ⟧, as it is used there? '
                        'Apply `conventions`.',
        'criteria': KINDS} for x in chunk}
    req = urllib.request.Request(API, data=json.dumps({'model': model, 'state': state, 'questions': questions}).encode(),
                                 headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode())


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--model', default='jev-latest'); ap.add_argument('--batch', type=int, default=20)
    ap.add_argument('--cap', type=float, default=1.0)
    a = ap.parse_args()
    key = os.environ.get('TYPESAFE_API_KEY') or sys.exit('set TYPESAFE_API_KEY')
    items = json.load(open(a.sample))['items']
    st = json.load(open(a.out)) if os.path.exists(a.out) else {'model': a.model, 'labels': {}, 'tokensIn': 0}
    todo = [x for x in items if x['id'] not in st['labels']]
    print(f'{a.model}: {len(todo)} of {len(items)} to type')
    i = 0
    while i < len(todo):
        if st['tokensIn'] * PRICE_PER_M / 1e6 >= a.cap:
            print('STOPPED at the spend cap'); break
        chunk = todo[i:i + a.batch]
        try:
            d = call(key, a.model, chunk)
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:200]
            if e.code in (401, 402, 403):
                sys.exit(f'STOPPED: {e.code} {body}')          # no credits or bad key: do not hammer
            if e.code == 400 and 'max_tokens' in body and a.batch > 2:
                a.batch //= 2; print(f'  too large, batch -> {a.batch}'); continue
            print(f'  FAILED {e.code} {body}'); time.sleep(4); i += a.batch; continue
        for qid, ans in (d.get('answers') or {}).items():
            st['labels'][qid] = {'kind': ans.get('choice'), 'confidence': ans.get('confidence'),
                                 'p': ans.get('probabilities')}
        st['tokensIn'] += (d.get('usage') or {}).get('input_tokens') or 0
        with open(a.out + '.part', 'w') as f:
            json.dump(st, f, ensure_ascii=False, indent=1)
        os.replace(a.out + '.part', a.out)
        i += a.batch
    print(f'typed {len(st["labels"])}/{len(items)}  input tokens {st["tokensIn"]:,}  '
          f'cost ${st["tokensIn"] * PRICE_PER_M / 1e6:.4f}')
