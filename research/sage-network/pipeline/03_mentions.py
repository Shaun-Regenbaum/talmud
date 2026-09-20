"""Every candidate name mention, in every edition, with where it sits.

  python3 pipeline/03_mentions.py       ->  data/mentions.jsonl

One line per mention. `certain` is false for anything the typing stage still
has to judge: bare רב and רבי, short forms, and a title before a word seen too
rarely to call a name.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import lexicon, names, textio

if __name__ == '__main__':
    lx = lexicon.Lexicon.load(os.path.join(textio.DATA, 'lexicon.json'))
    n = sure = 0
    with open(os.path.join(textio.DATA, 'mentions.jsonl'), 'w') as out:
        for c, w, wit, unit, addr, t in textio.segments():
            for m in names.find(t, lx):
                n += 1; sure += m.certain
                out.write(json.dumps({
                    'corpus': c, 'work': w, 'witness': wit, 'unit': unit, 'addr': addr,
                    'start': m.start, 'end': m.end, 'surface': m.surface, 'kind': m.kind,
                    'title': m.title, 'given': m.given, 'fathers': m.fathers,
                    'prefix': m.prefix, 'certain': bool(m.certain), 'alt': m.alt,
                }, ensure_ascii=False) + '\n')
    print(f'mentions: {n:,}   sure: {sure:,}   flagged for typing: {n - sure:,}')
