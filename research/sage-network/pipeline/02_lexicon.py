"""Learn which words are given names, from one edition of each work.

  python3 pipeline/02_lexicon.py        ->  data/lexicon.json
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import lexicon, textio

if __name__ == '__main__':
    lx = lexicon.build((f'{w}/{unit}', t) for c, w, wit, unit, addr, t in textio.primary_witness_segments())
    lx.save(os.path.join(textio.DATA, 'lexicon.json'))
    print(f'given names learned: {len(lx.given):,}   distinct words seen: {len(lx.counts):,}')
