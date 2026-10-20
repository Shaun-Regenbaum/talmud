"""Source units for compact-source-v4 (design stage; not wired to any runner).

The model would name units by ID instead of retyping Hebrew and counting occurrences. Each source
is split into units that cover every character: words, marks (punctuation) and spaces. Joining the
unit texts in order gives back the source text exactly. The units go to the model as a separate
JSON list next to the hashed source; nothing is written into the text itself. A word range compiles
back to the exact quote, occurrence and offsets that compact-source-v2 already checks. There is no
fuzzy matching: a range names whole words of this exact source, or it is rejected.
"""
import hashlib
import json
import unicodedata

TOKENIZER = 'source-units-v1'
QUOTE_MARKS = frozenset('"\'׳״')


class UnitError(ValueError):
    def __init__(self, code, detail):
        self.code = code
        super().__init__(f'{code}: {detail}')


def _digest(value):
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return hashlib.sha256(text.encode()).hexdigest()


def _letter(ch):
    return unicodedata.category(ch)[0] in 'LN'


def _mark(ch):
    # combining marks, and invisible format characters such as the zero-width joiner that the
    # vowelled Mekhilta puts inside words (עֲו\u200dֹנָם), continue the word they sit in
    return unicodedata.category(ch)[0] == 'M' or unicodedata.category(ch) == 'Cf'


def _pieces(text, start, end):
    """Split one whitespace-free token into word and mark pieces, as (kind, start, end)."""
    out, i = [], start
    while i < end:
        if _letter(text[i]):
            j = i + 1
            while j < end:
                c = text[j]
                if _letter(c) or _mark(c):
                    j += 1
                elif c in QUOTE_MARKS:
                    k = j
                    while k < end and text[k] in QUOTE_MARKS:
                        k += 1
                    # quote marks between letters join an abbreviation (א"ר, ר''ע); after the last
                    # letter they mark one (ר', מתני׳, וכו') and stay with the word
                    j = k
                    if k == end or not _letter(text[k]):
                        break
                else:
                    break
            out.append(('word', i, j))
            i = j
        else:
            j = i + 1
            while j < end and not _letter(text[j]):
                j += 1
            out.append(('mark', i, j))
            i = j
    return out


def units(text):
    """Every character falls in exactly one unit, numbered 1, 2, ... in order. Kinds: word, mark, space."""
    out, i, n = [], 0, len(text)
    while i < n:
        j = i
        if text[i].isspace():
            while j < n and text[j].isspace():
                j += 1
            pieces = [('space', i, j)]
        else:
            while j < n and not text[j].isspace():
                j += 1
            pieces = _pieces(text, i, j)
        for kind, a, b in pieces:
            out.append({'id': len(out) + 1, 'kind': kind, 'start': a, 'end': b, 'text': text[a:b]})
        i = j
    return out


def words(text):
    return [u for u in units(text) if u['kind'] == 'word']


def unit_list(source):
    """What the model is shown for one source, beside its hashed text: [[unit_id, exact text], ...]."""
    return [[u['id'], u['text']] for u in units(source['text'])]


def binding(source):
    """What a compiled anchor is bound to: the tokenizer, the exact source text, and its unit table."""
    us = units(source['text'])
    return {'tokenizer': TOKENIZER, 'source_id': source['source_id'], 'source_sha256': source['sha256'], 'units': len(us),
            'table_sha256': _digest([[u['id'], u['kind'], u['start'], u['end']] for u in us])}


def occurrence_of(text, quote, start):
    """1-based rank of this start among literal matches, counted exactly as compact-source-v2 does."""
    starts, pos = [], 0
    while True:
        pos = text.find(quote, pos)
        if pos < 0:
            break
        starts.append(pos)
        pos += 1
    return starts.index(start) + 1


def compile_anchor(source, anchor, table=None):
    """{'source_id', 'first', 'last'} (unit IDs) -> exact quote, occurrence and offsets."""
    if anchor.get('source_id') != source['source_id']:
        raise UnitError('unit_source', f"anchor names {anchor.get('source_id')!r}, not {source['source_id']!r}")
    first, last = anchor.get('first'), anchor.get('last')
    if type(first) is not int or type(last) is not int:
        raise UnitError('unit_range', 'first and last must be integers')
    us = table if table is not None else units(source['text'])
    if not 1 <= first <= last <= len(us):
        raise UnitError('unit_range', f'{first}..{last} outside 1..{len(us)} or reversed')
    if us[first - 1]['kind'] != 'word' or us[last - 1]['kind'] != 'word':
        raise UnitError('unit_kind', f'{first}..{last} must start and end on a word, not a space or mark')
    start, end = us[first - 1]['start'], us[last - 1]['end']
    quote = source['text'][start:end]
    return {'source_id': source['source_id'], 'quote': quote, 'occurrence': occurrence_of(source['text'], quote, start),
            'start': start, 'end': end, 'first': first, 'last': last}


def compile_answer(job, answer, expected_bindings=None):
    """Turn every unit anchor of a v4-shaped answer into the v2 quote form. The answer is not
    otherwise changed; the strict v2 checks are run on the result by the caller."""
    sources = {s['source_id']: s for s in job['sources']}
    tables = {sid: units(s['text']) for sid, s in sources.items()}
    bindings = {sid: binding(s) for sid, s in sources.items()}
    if expected_bindings is not None and expected_bindings != bindings:
        raise UnitError('unit_binding', 'unit tables differ from the ones the request was built with')
    compiled, mapping = json.loads(json.dumps(answer)), []

    def convert(a, path):
        if not isinstance(a, dict) or set(a) != {'source_id', 'first', 'last'}:
            raise UnitError('unit_anchor', f'{path} must have exactly source_id, first, last')
        if a['source_id'] not in sources:
            raise UnitError('unit_source', f'{path} names an unknown source')
        c = compile_anchor(sources[a['source_id']], a, tables[a['source_id']])
        mapping.append(dict(path=path, **c))
        return {'source_id': c['source_id'], 'quote': c['quote'], 'occurrence': c['occurrence']}

    for p in compiled.get('people', []):
        p['mentions'] = [convert(a, f"people/{p.get('id')}/mentions/{k}") for k, a in enumerate(p.get('mentions') or [])]
    for r in compiled.get('relationships', []):
        r['evidence'] = [convert(a, f"relationships/{r.get('id')}/evidence/{k}") for k, a in enumerate(r.get('evidence') or [])]
    return compiled, {'tokenizer': TOKENIZER, 'bindings': bindings, 'anchors': mapping}


def to_units(source, quote, occurrence):
    """Express an existing exact v2 anchor as a word range, or say why it cannot be one.
    Used only to measure old answers; never to repair one."""
    text, starts, pos = source['text'], [], 0
    while True:
        pos = text.find(quote, pos)
        if pos < 0:
            break
        starts.append(pos)
        pos += 1
    if not 1 <= occurrence <= len(starts):
        return None, 'quote not at that occurrence'
    a, b = starts[occurrence - 1], starts[occurrence - 1] + len(quote)
    ws = words(text)
    first = next((w for w in ws if w['start'] == a), None)
    last = next((w for w in ws if w['end'] == b), None)
    if first and last and first['id'] <= last['id']:
        return {'source_id': source['source_id'], 'first': first['id'], 'last': last['id']}, None
    inside = [w for w in ws if w['start'] < b and a < w['end']]
    if inside and inside[0]['start'] <= a and b <= inside[-1]['end']:
        return {'source_id': source['source_id'], 'first': inside[0]['id'], 'last': inside[-1]['id'], 'widened': True}, 'part of a word'
    return None, 'covers marks only'
