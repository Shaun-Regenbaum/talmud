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


NOT_A_RABBINIC_NAME = {'word', 'term', 'divine', 'biblical'}
PAIR_WINDOW = 70


def rejected_keys():
    """Keys of mentions the typing passes called a word, a term, a name of God or a Bible figure."""
    out, path = set(), os.path.join(textio.DATA, 'typed.jsonl')
    if os.path.exists(path):
        for line in open(path):
            r = json.loads(line)
            if r['kind'] in NOT_A_RABBINIC_NAME:
                out.add(r['key'])
    return out


def pairs(lexicon):
    """Every pair of neighbouring names, one edition per work, as a dict ready to show a model.

    'marked' is the passage with A in ⟦ ⟧ and B in ⟪ ⟫.
    """
    import relations
    rejected = rejected_keys()
    for c, w, wit, unit, addr, t in textio.primary_witness_segments():
        keep = lambda m: f'{c}|{w}|{unit}|{addr}|{m.start}' not in rejected      # noqa: E731
        for a, b, sig in relations.pairs(t, lexicon, keep):
            lo, hi = max(0, a.start - PAIR_WINDOW), min(len(t), b.end + PAIR_WINDOW)
            marked = (t[lo:a.start] + '⟦' + t[a.start:a.end] + '⟧' + t[a.end:b.start]
                      + '⟪' + t[b.start:b.end] + '⟫' + t[b.end:hi])
            yield {'key': f'{c}|{w}|{unit}|{addr}|{a.start}|{b.start}', 'corpus': c, 'work': w, 'ref': f'{w} {unit}:{addr}',
                   'a': a.surface, 'b': b.surface, 'aKind': a.kind, 'bKind': b.kind,
                   'pattern': relations.signature(sig), 'marked': marked}
