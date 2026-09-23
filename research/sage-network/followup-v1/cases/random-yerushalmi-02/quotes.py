"""Exact-quote helpers for the dossier builder.

Every evidence quote is taken from the saved bytes of a source file. Hebrew
quotes are located by their consonant skeleton and then returned as the exact
original slice, so vowel-mark ordering never produces a near-miss quote.
"""
import hashlib
import json
import re
import unicodedata

MARKS = re.compile('[֑-ׇ]')
TAGS = re.compile('<[^>]+>')


def skeleton_map(text):
    chars, index = [], []
    for i, ch in enumerate(text):
        if MARKS.match(ch):
            continue
        chars.append(ch)
        index.append(i)
    return ''.join(chars), index


def find_all(text, wanted):
    """Return [(start, end)] original offsets for every skeleton match."""
    skel, index = skeleton_map(text)
    target, _ = skeleton_map(wanted)
    out = []
    pos = skel.find(target)
    while pos != -1:
        start = index[pos]
        last = index[pos + len(target) - 1]
        end = last + 1
        while end < len(text) and MARKS.match(text[end]):
            end += 1
        out.append((start, end))
        pos = skel.find(target, pos + 1)
    return out


def strings_in(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for x in obj:
            yield from strings_in(x)
    elif isinstance(obj, dict):
        for x in obj.values():
            yield from strings_in(x)


def load_texts(path):
    raw = open(path, 'rb').read()
    if path.endswith('.json'):
        return [TAGS.sub('', s) for s in strings_in(json.loads(raw))]
    return [raw.decode('utf-8')]


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()
