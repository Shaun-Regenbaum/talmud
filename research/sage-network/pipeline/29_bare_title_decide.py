"""Score the two readers of lone titles, then write one decision per bare-title mention that sits in a pair.

Decision order: both readers agree -> theirs; rule-settled -> the rule's (unless the next word is on the shaky list);
anything else -> 'unsettled' (the map keeps the bare title and flags it).
Writes research/sage-network/data/bare-titles.jsonl and prints the scores."""
import collections, glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import textio
H = os.environ.get('BARE_DIR') or os.path.join(textio.DATA, 'bare-titles-work')  # working folder: context, sorted list, reader batches
os.makedirs(H, exist_ok=True)
R = f'{H}/reader'
BACK = f'{H}/back'  # the readers' labels: back/fable/labels-NNN.jsonl and back/opus/labels-NNN.jsonl
SHAKY = {'כהן', 'בר', "כר'", "מתני'", 'ישראל', 'בריה', "מר'"}   # rule 'cut' calls that read wrong by hand
res = {tuple(r[k] for k in ('corpus', 'work', 'unit', 'addr', 'start')): r for r in json.load(open(f'{H}/sorted.json'))}
strip = lambda w: re.sub(r'[.,:;!?"\(\)\[\]]+$', '', w or '')  # noqa: E731


def load(p):
    out = {}
    if os.path.exists(p):
        for line in open(p):
            try:
                r = json.loads(line); out[r['n']] = r
            except Exception:
                pass
    return out


def rule_name(r):
    after = [strip(w) for w in r.get('after') or []]
    words = [r['surface']] + after[:1]
    if after[:1] and after[0] in ('בר', 'בן', 'ברבי') and len(after) > 1:
        words.append(after[1])
    return ' '.join(words)


score = collections.Counter(); dis = collections.Counter(); decisions = {}; badname = 0
for mp_path in sorted(glob.glob(f'{R}/map-*.json')):
    b = mp_path[-8:-5]
    mp = json.load(open(mp_path))
    text = {l.split('\t', 1)[0]: l.rstrip('\n').split('\t', 1)[1] for l in open(f'{R}/batch-{b}.txt')}
    F = load(f'{BACK}/fable/labels-{b}.jsonl'); O = load(f'{BACK}/opus/labels-{b}.jsonl')
    for n, m in mp.items():
        f, o = F.get(n), O.get(n)
        for who, x in (('fable', f), ('opus', o)):
            if x and x.get('kind') == 'cut':
                nm = (x.get('name') or '').strip()
                if not nm or nm not in text[n].replace('⟦', '').replace('⟧', ''):
                    x['kind'] = 'cut-badname'; badname += 1
        if m['type'] == 'check':
            for who, x in (('fable', f), ('opus', o)):
                if x:
                    score[(who, 'checks')] += 1
                    score[(who, 'agree_rule')] += x['kind'] == m['rule']
                    if x['kind'] != m['rule']:
                        dis[(who, m['rule'], x['kind'])] += 1
            continue
        if not (f and o):
            continue
        score['both'] += 1
        same = f['kind'] == o['kind'] and f['kind'] != 'cut-badname' and (f['kind'] != 'cut' or f.get('name') == o.get('name'))
        score['same'] += same
        both_sure = f.get('sure') and o.get('sure')
        score['both_sure'] += bool(both_sure); score['same_sure'] += bool(both_sure and same)
        k = tuple(m['key'])
        decisions[k] = {'decision': f['kind'] if same else 'unsettled', 'name': f.get('name') if same and f['kind'] == 'cut' else None,
                        'source': 'readers' if same else 'readers-disagree', 'fable': f['kind'], 'opus': o['kind']}
# every bare-title mention in a pair that the readers did not decide: the rule, or unsettled
need = set()
for l in open(textio.DATA + '/pairs-final.jsonl'):
    r = json.loads(l); p = r['key'].split('|')
    for nm, st in ((r['a'], p[4]), (r['b'], p[5])):
        if nm in {'רב', 'רבי', "ר'", 'מר'}:
            need.add((p[0], p[1], p[2], p[3], int(st)))
for k in need:
    if k in decisions:
        continue
    r = res[k]
    nx = strip(r['after'][0]) if r.get('after') else ''
    if r['class'] == 'cut' and nx not in SHAKY:
        decisions[k] = {'decision': 'cut', 'name': rule_name(r), 'source': 'rule'}
    elif r['class'] in ('alone', 'word'):
        decisions[k] = {'decision': r['class'], 'name': None, 'source': 'rule'}
    else:
        decisions[k] = {'decision': 'unsettled', 'name': None, 'source': 'rule-shaky' if r['class'] == 'cut' else 'unread'}
with open(textio.DATA + '/bare-titles.jsonl', 'w') as f:
    for k, d in sorted(decisions.items(), key=lambda kv: [str(x) for x in kv[0]]):
        f.write(json.dumps({'key': list(k), 'surface': res[k]['surface'], **d}, ensure_ascii=False) + '\n')
pc = lambda a, b: f'{100 * a / b:.1f}%' if b else '-'  # noqa: E731
print('checks (rule-settled, hidden): fable agrees with rule', pc(score[('fable', 'agree_rule')], score[('fable', 'checks')]),
      'opus', pc(score[('opus', 'agree_rule')], score[('opus', 'checks')]), 'n', score[('fable', 'checks')])
print('where readers overrode the rule:', dis.most_common(8))
per = collections.Counter(); ok = collections.Counter()
for mp_path in sorted(glob.glob(f'{R}/map-*.json')):
    b = mp_path[-8:-5]; mp = json.load(open(mp_path)); F = load(f'{BACK}/fable/labels-{b}.jsonl'); O = load(f'{BACK}/opus/labels-{b}.jsonl')
    for n, m in mp.items():
        if m['type'] == 'check' and n in F and n in O and F[n]['kind'] == O[n]['kind']:
            per[m['rule']] += 1; ok[m['rule']] += F[n]['kind'] == m['rule']
print('rule right, where both readers agree, by rule class:', {k: f'{ok[k]}/{per[k]}' for k in per})
print('unsure mentions read by both', score['both'], 'same answer', pc(score['same'], score['both']),
      '| both sure', score['both_sure'], 'same', pc(score['same_sure'], score['both_sure']), '| cut names not on the page', badname)
print('decisions by source and kind:', collections.Counter((d['source'], d['decision']) for d in decisions.values()).most_common())
