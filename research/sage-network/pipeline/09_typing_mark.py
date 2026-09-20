"""Two frontier models type the sampled mentions, separately. They are the reference.

  python3 pipeline/09_typing_mark.py --sample checkset/typing-dev.json \\
          --model openai/gpt-6-astra --out checkset/typing-dev.astra.json --cap 1.50
"""
import argparse, json, os, re, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from kinds import KINDS, CONVENTIONS

API = 'https://openrouter.ai/api/v1/chat/completions'
SYSTEM = (CONVENTIONS + '\n\nFor EACH item say what the wrapped stretch is. "kind" is one of:\n'
          + '\n'.join(f'  "{k}": {v}' for k, v in KINDS.items())
          + '\n\n"sure": false if a careful reader could reasonably disagree.'
          + '\n"reading": ONLY for a short form, the name spelled out if you are confident, else null.'
          + '\n\nReturn ONLY JSON: {"items":[{"id":"...","kind":"...","sure":true,"reading":null}]}')


def call(model, key, items, effort):
    body = {'model': model, 'temperature': 0, 'max_tokens': 6000, 'reasoning': {'effort': effort},
            'usage': {'include': True}, 'response_format': {'type': 'json_object'},
            'messages': [{'role': 'system', 'content': SYSTEM},
                         {'role': 'user', 'content': json.dumps(
                             {'items': [{'id': x['id'], 'passage': x['marked']} for x in items]}, ensure_ascii=False)}]}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={
        'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'X-Title': 'sage-network typing'})
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.loads(r.read().decode())
    if 'error' in d:
        raise RuntimeError(d['error'].get('message'))
    m = re.search(r'\{.*\}', d['choices'][0]['message'].get('content') or '', re.S)
    return (json.loads(m.group(0)) if m else {'items': []}), d.get('usage') or {}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', required=True); ap.add_argument('--model', required=True)
    ap.add_argument('--out', required=True); ap.add_argument('--batch', type=int, default=15)
    ap.add_argument('--cap', type=float, default=1.5); ap.add_argument('--effort', default='low')
    a = ap.parse_args()
    key = os.environ.get('OPENROUTER_API_KEY') or sys.exit('set OPENROUTER_API_KEY')
    items = json.load(open(a.sample))['items']
    st = json.load(open(a.out)) if os.path.exists(a.out) else {'model': a.model, 'labels': {}, 'spend': 0.0}
    todo = [x for x in items if x['id'] not in st['labels']]
    print(f'{a.model}: {len(todo)} of {len(items)} to type, cap ${a.cap:.2f}')
    for i in range(0, len(todo), a.batch):
        if st['spend'] >= a.cap:
            print(f'STOPPED at the spend cap (${st["spend"]:.3f})'); break
        chunk = todo[i:i + a.batch]
        try:
            out, usage = call(a.model, key, chunk, a.effort)
        except Exception as e:                   # noqa: BLE001
            print(f'  batch {i // a.batch}: FAILED {type(e).__name__}: {e}'); time.sleep(3); continue
        ids = {x['id'] for x in chunk}
        for r in out.get('items') or []:
            if r.get('id') in ids and r.get('kind') in KINDS:
                st['labels'][r['id']] = {'kind': r['kind'], 'sure': bool(r.get('sure', True)), 'reading': r.get('reading')}
        st['spend'] += float(usage.get('cost') or 0)
        with open(a.out + '.part', 'w') as f:
            json.dump(st, f, ensure_ascii=False, indent=1)
        os.replace(a.out + '.part', a.out)
    print(f'typed {len(st["labels"])}/{len(items)}  spent ${st["spend"]:.3f}')
