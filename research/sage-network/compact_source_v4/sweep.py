"""Check the word units on whole queues of real sources. Read-only; prints and optionally saves counts.

  python3 -m compact_source_v4.sweep SHARD.jsonl ... [--out FILE]

Every distinct source text (by its sha256) is split once. The sweep checks that the units join back
to the text exactly, that the JSON unit list survives a round trip, and that every word passes the
compact-source-v2 whole-word rule. It lists the words that do not, for review.
"""
import argparse
import json
import unicodedata
from collections import Counter

try:
    from . import units as U
    from compact_source_v2.validate import hebrew_word_character
except ImportError:
    import units as U
    from validate import hebrew_word_character


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('shards', nargs='+')
    ap.add_argument('--out')
    a = ap.parse_args()
    seen, c, scripts, worst, broken = set(), Counter(), Counter(), [], []
    for path in a.shards:
        with open(path, encoding='utf-8') as f:
            for line in f:
                job = json.loads(line)
                c['jobs'] += 1
                for s in job['sources']:
                    if s['sha256'] in seen:
                        continue
                    seen.add(s['sha256'])
                    text = s['text']
                    c['distinct sources'] += 1
                    c['chars'] += len(text)
                    us = U.units(text)
                    ws = [u for u in us if u['kind'] == 'word']
                    c['words'] += len(ws)
                    c['marks'] += len(us) - len(ws)
                    if ''.join(u['text'] for u in us) != text:
                        c['FAIL: units do not join back to the text'] += 1
                    listed = U.unit_list(s)
                    if json.loads(json.dumps(listed, ensure_ascii=False)) != listed:
                        c['FAIL: unit list does not survive JSON'] += 1
                    c['unit list chars'] += len(json.dumps(listed, ensure_ascii=False, separators=(',', ':')))
                    for w in ws:
                        if hebrew_word_character(text, w['start'] - 1) or hebrew_word_character(text, w['end']) or unicodedata.combining(text[w['start']]):
                            c['FAIL: word breaks the v2 whole-word rule'] += 1
                            if len(broken) < 12:
                                broken.append(dict(ref=s.get('ref'), word=w['text'], context=text[max(0, w['start'] - 6):w['end'] + 6],
                                                   before=repr(text[w['start'] - 1:w['start']]), after=repr(text[w['end']:w['end'] + 1])))
                        for ch in w['text']:
                            if unicodedata.category(ch)[0] == 'L':
                                scripts[unicodedata.name(ch, '?').split()[0]] += 1
                    worst.append((len(ws), s.get('ref') or s['source_id']))
    worst.sort(reverse=True)
    out = dict(counts=dict(sorted(c.items())), letterScripts=dict(scripts.most_common(8)), mostWords=worst[:5],
               unitListGrowth=round(c['unit list chars'] / max(1, c['chars']), 3), wordsBreakingTheRule=broken, tokenizer=U.TOKENIZER)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            f.write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
