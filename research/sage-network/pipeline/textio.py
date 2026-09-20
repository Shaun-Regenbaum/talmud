"""Read the fetched snapshot, and normalise Hebrew consistently everywhere.

Every later stage goes through here, so a change to normalisation cannot apply
to one stage and not another.
"""
import glob, json, os, re

DATA = os.environ.get('SAGE_NETWORK_DATA') or os.path.join(os.path.dirname(__file__), '..', 'data')
RAW = os.path.join(DATA, 'raw')

NIKUD = re.compile(r'[֑-ׇ]')          # vowels and cantillation
TAGS = re.compile(r'<[^>]+>')


def normalise(s):
    """Strip markup and vowels. KEEP the abbreviation marks.

    An earlier version deleted the geresh and gershayim. That turned the
    abbreviation א"ר into the word אר and ר"י into רי, so one whole edition's
    names became invisible. The marks are the only sign that a token is a short
    form, and opening a short form up is an editor's decision about who is
    meant, so they must survive to the name finder.
    """
    s = TAGS.sub(' ', s or '')
    s = NIKUD.sub('', s)
    s = s.replace('״', '"').replace('׳', "'")     # Hebrew marks -> ASCII
    s = s.replace('“', '"').replace('”', '"').replace('’', "'")
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
    """Yield (corpus, work, witness, unit, address, normalised text)."""
    for u in units(corpus, witness):
        addr = u.get('addresses') or []
        for i, s in enumerate(u.get('segments') or []):
            t = normalise(s)
            if t:
                yield u['corpus'], u['work'], u['witness'], u['unit'], (addr[i] if i < len(addr) else str(i)), t


def primary_witness(corpus=None):
    """One witness per work, chosen reproducibly (first in sort order)."""
    chosen = {}
    for u in units(corpus):
        key = (u['corpus'], u['work'])
        if key not in chosen or u['witness'] < chosen[key]:
            chosen[key] = u['witness']
    return chosen


def primary_witness_segments(corpus=None):
    """Segments from one witness per work, so no mention is counted twice."""
    chosen = primary_witness(corpus)
    for c, w, wit, unit, addr, t in segments(corpus):
        if chosen.get((c, w)) == wit:
            yield c, w, wit, unit, addr, t
