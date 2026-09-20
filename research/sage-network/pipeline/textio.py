"""Read the fetched snapshot, and normalise Hebrew consistently everywhere.

Every later stage goes through here, so a change to normalisation cannot apply
to one stage and not another.
"""
import json, os, re, glob

RAW = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw')

NIKUD = re.compile(r'[֑-ׇ]')          # vowels and cantillation
TAGS = re.compile(r'<[^>]+>')


def normalise(s):
    """Strip markup, vowels and the quote marks Hebrew uses for abbreviation.

    Abbreviation marks are removed rather than expanded: expanding them here
    would bake one reading of an ambiguous abbreviation into every later stage.
    """
    s = TAGS.sub('', s or '')
    s = NIKUD.sub('', s)
    for ch in ('"', '״', "'", '׳'):
        s = s.replace(ch, '')
    return re.sub(r'\s+', ' ', s).strip()


def units(corpus=None, witness=None):
    """Yield every fetched unit as a dict, optionally filtered."""
    pat = os.path.join(RAW, corpus or '*', '*', witness or '*', '*.json')
    for p in sorted(glob.glob(pat)):
        try:
            with open(p) as f:
                yield json.load(f)
        except Exception:
            continue


def segments(corpus=None, witness=None):
    """Yield (corpus, work, witness, unit, index, normalised text)."""
    for u in units(corpus, witness):
        for i, s in enumerate(u.get('segments') or []):
            t = normalise(s)
            if t:
                yield u['corpus'], u['work'], u['witness'], u['unit'], i, t


def primary_witness_segments(corpus=None):
    """One witness per work, so counting a mention twice is impossible.

    Which witness is primary is decided by whichever sorts first for that work,
    recorded so the choice is reproducible rather than incidental.
    """
    chosen = {}
    for u in units(corpus):
        key = (u['corpus'], u['work'])
        w = u['witness']
        if key not in chosen or w < chosen[key]:
            chosen[key] = w
    for u in units(corpus):
        if u['witness'] != chosen[(u['corpus'], u['work'])]:
            continue
        for i, s in enumerate(u.get('segments') or []):
            t = normalise(s)
            if t:
                yield u['corpus'], u['work'], u['witness'], u['unit'], i, t
