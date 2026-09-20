"""Have a frontier model mark a check set. Two models from two labs, separately.

  python3 pipeline/06_checkset_label.py --sample checkset/pilot.json \\
          --model openai/gpt-6-astra --out checkset/pilot.astra.json --cap 2.00

The markers replace human markers, so three things keep them honest:

  * They see the Hebrew and Aramaic only. No translation, and nothing the
    pipeline produced, so they cannot be steered toward its answers.
  * Every name they report must be an exact piece of the passage. That is
    checked by machine, and a label that quotes words not on the page is
    thrown out and counted. A model cannot invent a sage without being caught.
  * They may say they are unsure. A forced guess would hide exactly the cases
    the study is about.

Resumable: finished batches are kept. --cap is a hard limit in dollars, read
from the provider's own reported cost, and the run stops when it is reached.
"""
import argparse, json, os, re, sys, time, urllib.request

API = 'https://openrouter.ai/api/v1/chat/completions'

INSTRUCTIONS = """You are marking passages of classical rabbinic Hebrew and Aramaic for a study of who is named in them. Work only from the words on the page.

For EACH passage, report:

1. "mentions": every place a PERSON or GROUP is named. For each one:
   - "text": the name exactly as printed, copied character for character from the passage, including any short form such as ר"י or ר'. Do not expand short forms. Do not include a prefix letter that is glued on (for דרבי יוחנן report רבי יוחנן). Include the father's name when it is part of the name (רב הונא בריה דרב יהושע is one name).
   - "kind": one of
       "sage"      a rabbinic figure (tanna, amora, or a sage named without a title)
       "biblical"  a figure from the Bible
       "person"    any other named individual
       "group"     a named group (חכמים, רבנן, בית שמאי, בית הלל)
       "divine"    a name or title of God
   - "sure": true or false. Say false when the word might not be a name here (רב can mean "much", רבי can be "my teacher").
   List a name once per time it appears, in reading order.

2. "links": for each pair of NAMED SAGES that the passage joins directly, in reading order:
   - "a", "b": positions in your "mentions" list, counting from 0
   - "rel": one of
       "passes-on"   a reports a teaching in b's name (אמר רב יהודה אמר שמואל: a = רב יהודה, b = שמואל)
       "says-to"     a addresses b
       "objects-to"  a raises an objection against b
       "asks"        a asks b a question
       "disputes"    a and b are given as holding opposite views
       "alt-author"  the teaching is given to a, "and some say" to b
       "together"    named side by side with no stated relation
   - "words": the exact words in the passage that state the relation, copied character for character ("" if none)

Rules: never add a name that is not printed. If a passage names nobody, return empty lists. Return ONLY JSON, no commentary:
{"passages":[{"id":"...","mentions":[...],"links":[...]}]}"""


def call(model, key, passages, effort):
    body = {
        'model': model, 'temperature': 0, 'max_tokens': 9000,
        'reasoning': {'effort': effort}, 'usage': {'include': True},
        'response_format': {'type': 'json_object'},
        'messages': [
            {'role': 'system', 'content': INSTRUCTIONS},
            {'role': 'user', 'content': json.dumps(
                {'passages': [{'id': p['id'], 'text': p['text']} for p in passages]}, ensure_ascii=False)},
        ],
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={
        'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
        'X-Title': 'sage-network check set'})
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.loads(r.read().decode())
    if 'error' in d:
        raise RuntimeError(d['error'].get('message'))
    content = d['choices'][0]['message'].get('content') or ''
    m = re.search(r'\{.*\}', content, re.S)
    return json.loads(m.group(0)) if m else {'passages': []}, d.get('usage') or {}


def verify(item, label):
    """Drop any mention whose text is not literally in the passage. Return kept, dropped."""
    text = item['text']
    kept, dropped, remap = [], [], {}
    for i, m in enumerate(label.get('mentions') or []):
        t = (m.get('text') or '').strip()
        if t and t in text:
            remap[i] = len(kept); kept.append(m)
        else:
            dropped.append(t)
    links = []
    for l in label.get('links') or []:
        if l.get('a') in remap and l.get('b') in remap:
            w = (l.get('words') or '').strip()
            links.append({**l, 'a': remap[l['a']], 'b': remap[l['b']], 'wordsOnPage': (w in text) if w else None})
    return {'id': item['id'], 'mentions': kept, 'links': links}, dropped


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--batch', type=int, default=7)
    ap.add_argument('--cap', type=float, default=2.0, help='stop when the provider-reported spend reaches this')
    ap.add_argument('--effort', default='low')
    a = ap.parse_args()
    key = os.environ.get('OPENROUTER_API_KEY')
    if not key:
        sys.exit('set OPENROUTER_API_KEY')
    items = json.load(open(a.sample))['items']
    state = json.load(open(a.out)) if os.path.exists(a.out) else {
        'model': a.model, 'sample': a.sample, 'labels': {}, 'dropped': {}, 'spend': 0.0,
        'tokensIn': 0, 'tokensOut': 0, 'calls': 0}
    todo = [x for x in items if x['id'] not in state['labels']]
    print(f'{a.model}: {len(todo)} of {len(items)} to mark, spent so far ${state["spend"]:.3f}, cap ${a.cap:.2f}')
    for i in range(0, len(todo), a.batch):
        if state['spend'] >= a.cap:
            print(f'STOPPED at the spend cap (${state["spend"]:.3f})'); break
        chunk = todo[i:i + a.batch]
        try:
            out, usage = call(a.model, key, chunk, a.effort)
        except Exception as e:                       # noqa: BLE001
            print(f'  batch {i // a.batch}: FAILED {type(e).__name__}: {e}'); time.sleep(3); continue
        got = {p.get('id'): p for p in out.get('passages') or []}
        for it in chunk:
            if it['id'] in got:
                lab, dropped = verify(it, got[it['id']])
                state['labels'][it['id']] = lab
                if dropped:
                    state['dropped'][it['id']] = dropped
        state['spend'] += float(usage.get('cost') or 0)
        state['tokensIn'] += usage.get('prompt_tokens') or 0
        state['tokensOut'] += usage.get('completion_tokens') or 0
        state['calls'] += 1
        with open(a.out + '.part', 'w') as f:
            json.dump(state, f, ensure_ascii=False, indent=1)
        os.replace(a.out + '.part', a.out)
        print(f'  batch {i // a.batch}: {len(got)}/{len(chunk)} marked  in {usage.get("prompt_tokens")} out '
              f'{usage.get("completion_tokens")}  ${float(usage.get("cost") or 0):.4f}', flush=True)
    n_m = sum(len(v['mentions']) for v in state['labels'].values())
    n_d = sum(len(v) for v in state['dropped'].values())
    print(f'marked {len(state["labels"])}/{len(items)}  mentions {n_m}  thrown out as not on the page {n_d}  '
          f'spent ${state["spend"]:.3f}')
