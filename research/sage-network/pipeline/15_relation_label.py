"""Say what a joining pattern states, or what one pair in its passage states, with one model.

  ... --sample checkset/pairs-dev.json      judges each sampled PAIR in its passage
  ... --top 300                             judges the 300 commonest PATTERNS

  OPENROUTER_API_KEY=... python3 pipeline/15_relation_label.py --model openai/gpt-6-astra \\
          --top 300 --out checkset/relations-dev.astra.json --cap 1.50
  TYPESAFE_API_KEY=...   python3 pipeline/15_relation_label.py --model jev-latest \\
          --top 2000 --out checkset/relations.jev.json --cap 0.50

Reads data/patterns.json (04_relations.py). One model per run, so two frontier
models can label the same patterns separately and be compared, the same way the
name check sets were marked. Resumable. Stops hard at the dollar cap and on a
billing or key error.
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import textio
from relkinds import RELATION_KINDS, CONVENTIONS, PAIR_CONVENTIONS

OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'
JEV = 'https://api.typesafe.ai/v1/systemone'
JEV_PRICE_PER_M = 0.042
RULES = ('\n\n"kind" is one of:\n' + '\n'.join(f'  "{k}": {v}' for k, v in RELATION_KINDS.items())
         + '\n\n"sure": false if a careful reader could disagree, or the passages show different meanings.'
         + '\n\nReturn ONLY JSON: {"items":[{"id":"...","kind":"...","sure":true}]}')


def shown(p):
    if 'marked' in p:                                  # one pair in its passage
        return {'passage': p['marked']}
    return {'pattern': p['pattern'], 'passages': [f"[A]={e['a']}  [B]={e['b']}  ...{e['text']}..." for e in p['examples']]}


def post(url, key, body, timeout):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={
        'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'X-Title': 'sage-network relations'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def ask_chat(model, key, chunk, effort, conventions):
    d = post(OPENROUTER, key, {
        'model': model, 'temperature': 0, 'max_tokens': 8000, 'reasoning': {'effort': effort},
        'usage': {'include': True}, 'response_format': {'type': 'json_object'},
        'messages': [{'role': 'system', 'content': conventions + RULES},
                     {'role': 'user', 'content': json.dumps({'items': [{'id': i, **shown(p)} for i, p in chunk]},
                                                            ensure_ascii=False)}]}, 600)
    if 'error' in d:
        raise RuntimeError(f"{d['error'].get('code')} {d['error'].get('message')}")
    m = re.search(r'\{.*\}', d['choices'][0]['message'].get('content') or '', re.S)
    out = {}
    for r in (json.loads(m.group(0)) if m else {}).get('items') or []:
        if isinstance(r, dict) and r.get('kind') in RELATION_KINDS:
            out[str(r.get('id'))] = {'kind': r['kind'], 'sure': bool(r.get('sure', True))}
    return out, float((d.get('usage') or {}).get('cost') or 0)


def ask_jev(model, key, chunk, conventions, what):
    d = post(JEV, key, {
        'model': model, 'state': {'conventions': conventions, 'items': {i: shown(p) for i, p in chunk}},
        'questions': {i: {'type': 'choice', 'criteria': RELATION_KINDS,
                          'instructions': f'What does the {what} in `items.{i}` state about A and B? Apply `conventions`.'}
                      for i, _ in chunk}}, 120)
    out = {i: {'kind': r.get('choice'), 'confidence': r.get('confidence'), 'p': r.get('probabilities')}
           for i, r in (d.get('answers') or {}).items() if r.get('choice') in RELATION_KINDS}
    return out, ((d.get('usage') or {}).get('input_tokens') or 0) * JEV_PRICE_PER_M / 1e6


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--sample'); ap.add_argument('--top', type=int, default=300); ap.add_argument('--batch', type=int, default=20)
    ap.add_argument('--cap', type=float, default=1.5); ap.add_argument('--effort', default='low')
    a = ap.parse_args()
    jev = a.model.startswith('jev')
    key = os.environ.get('TYPESAFE_API_KEY' if jev else 'OPENROUTER_API_KEY') or sys.exit('set the API key')
    if a.sample:
        things = json.load(open(a.sample))['items']; name = lambda p: p['id']                    # noqa: E731
        conventions, what = PAIR_CONVENTIONS, 'passage'
    else:
        things = json.load(open(os.path.join(textio.DATA, 'patterns.json')))['patterns'][:a.top]
        name = lambda p: p['pattern']                                                            # noqa: E731
        conventions, what = CONVENTIONS, 'pattern'
    st = json.load(open(a.out)) if os.path.exists(a.out) else {'model': a.model, 'labels': {}, 'spend': 0.0}
    # a label is stored under the pattern or the item id, so it survives a recount that reorders the list
    todo = [(f'q{n}', p) for n, p in enumerate(things) if name(p) not in st['labels']]
    print(f'{a.model}: {len(todo)} of {len(things)} to label, cap ${a.cap:.2f}', flush=True)
    fails = 0
    for i in range(0, len(todo), a.batch):
        if st['spend'] >= a.cap:
            print(f'STOPPED at the spend cap (${st["spend"]:.3f})'); break
        chunk = todo[i:i + a.batch]
        try:
            out, cost = (ask_jev(a.model, key, chunk, conventions, what) if jev
                         else ask_chat(a.model, key, chunk, a.effort, conventions))
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:160]
            if e.code in (401, 402, 403):
                sys.exit(f'STOPPED: {e.code} {body}')
            fails += 1; print(f'  batch {i // a.batch}: HTTP {e.code} {body}', flush=True)
            if fails > 8:
                sys.exit('STOPPED: too many failures')
            time.sleep(3 * fails); continue
        except Exception as e:                   # noqa: BLE001
            fails += 1; print(f'  batch {i // a.batch}: FAILED {type(e).__name__}: {str(e)[:120]}', flush=True)
            if fails > 8:
                sys.exit('STOPPED: too many failures')
            time.sleep(3 * fails); continue
        for qid, p in chunk:
            if qid in out:
                st['labels'][name(p)] = out[qid]
        st['spend'] += cost
        with open(a.out + '.part', 'w') as f:
            json.dump(st, f, ensure_ascii=False, indent=1)
        os.replace(a.out + '.part', a.out)
    print(f'labelled {len(st["labels"])}/{len(things)}  spent ${st["spend"]:.3f}')
