"""The mentions that need a judgement, and the passage each one is shown in.

Shared by the two typing passes so both judge the same stretch of the same text.
"""
import json, os
import textio

WINDOW = 220        # characters of text shown on each side of the mention


def key_of(m):
    return f"{m['corpus']}|{m['work']}|{m['unit']}|{m['addr']}|{m['start']}"


def needs_judgement(m):
    """A short form, a bare title, or a name the finder was not sure of."""
    return m['kind'] in ('abbrev', 'bare') or (m['kind'] == 'name' and not m['certain'])


def mentions(skip=()):
    """Mentions needing a judgement, one edition per work, minus the keys in `skip`."""
    prim = textio.primary_witness()
    need = []
    for line in open(os.path.join(textio.DATA, 'mentions.jsonl')):
        m = json.loads(line)
        if prim.get((m['corpus'], m['work'])) != m['witness']:
            continue
        if needs_judgement(m) and key_of(m) not in skip:
            need.append(m)
    return need


def attach_passages(need):
    """Add m['marked']: the text around the mention with the mention wrapped in ⟦ ⟧."""
    want = {(m['corpus'], m['work'], m['witness'], m['unit'], m['addr']) for m in need}
    text = {}
    for c, w, wit, unit, addr, t in textio.segments():
        if (c, w, wit, unit, addr) in want:
            text[(c, w, wit, unit, addr)] = t
    for m in need:
        t = text.get((m['corpus'], m['work'], m['witness'], m['unit'], m['addr']), '')
        lo, hi = max(0, m['start'] - WINDOW), min(len(t), m['end'] + WINDOW)
        m['marked'] = t[lo:m['start']] + '⟦' + t[m['start']:m['end']] + '⟧' + t[m['end']:hi]
    return need
