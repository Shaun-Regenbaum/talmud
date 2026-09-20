"""Find candidate name mentions. Candidates, not people.

Grammar, over whitespace tokens:

    NAME        := HEAD PATRONYMIC*
    HEAD        := TITLE GIVEN | STANDALONE | ABBREVIATION
    PATRONYMIC  := CONNECTOR+ [TITLE] GIVEN        (בר בר חנה repeats the connector)

Three decisions are deliberately NOT made here, because each one is a judgement
about who is meant, and those belong to later, checkable stages:

  * An abbreviation (ר"י, ריב"ל) is reported as it stands. ר"י can be five
    different rabbis; an edition that spells it out has already chosen one.
  * A bare רב / רבי / רבא / רבה is reported as a bare mention. רב also means
    "much", and only context can tell.
  * A TITLE followed by a word the lexicon has never seen as a given name is
    reported with certain=False, for the typing stage to settle.

What IS decided here is mechanical: whether the word after a title is a given
name at all. "רבא כשמעתיה" is Rava followed by an ordinary word, not a sage
called Rava Kishmateih, and the lexicon (lexicon.py) knows that from how the
word behaves across the whole corpus.
"""
import re

# Titles that take a given name. מר is excluded from prefix handling below.
TITLES = {'רבי', 'רב', 'רבן', 'מר', 'אבא'}
TITLE_ABBREV = {"ר'"}                      # ר' = Rabbi, written short
# Complete names with no title. רב and רבי alone are Rav and Rebbi.
STANDALONE = {
    'רב', 'רבי', 'רבא', 'רבה', 'רבינא', 'שמואל', 'עולא', 'אביי', 'לוי', 'זעירי',
    'רבין', 'אמימר', 'מרימר', 'רפרם', 'אילפא', 'הלל', 'שמאי', 'רבנאי', 'גניבא',
}
# Standalone names that also take a patronymic: רבה בר נחמני, רבא בר יוסף.
STANDALONE_WITH_PATRONYMIC = {'רבה', 'רבא', 'רבינא', 'עולא', 'לוי', 'רבין', 'שמואל', 'רפרם'}
# Names built on "son of" with no given name: בן עזאי, בר קפרא.
BEN_NAMES = {('בן', 'עזאי'), ('בן', 'זומא'), ('בן', 'ננס'), ('בן', 'בתירא'), ('בר', 'קפרא'),
             ('בר', 'פדא'), ('בן', 'פטורי'), ('בן', 'בג')}
CONNECTORS = {'בר', 'בן', 'ברבי', 'ברב', 'בריה'}
PREFIX = 'ודלכבמשה'                       # letters Hebrew glues to the next word

_PUNCT = '.,:;?!()[]{}<>-–—־׃/'
_ABBREV = re.compile(r'^(א?ר[א-ת]{0,3}"[א-ת]{1,2})$')     # ר"י ריב"ל רשב"ג אר"י
_AMAR_R = {'א"ר', "א'ר"}                                   # "said Rabbi ..."


def tokens(text):
    """(start, end, token) with edge punctuation removed, abbreviation marks kept.

    A quote mark INSIDE a token (ר"י) or a geresh ending the token ר' marks a
    short form and stays. A quote mark at the very edge of any other token is
    ordinary punctuation and goes.
    """
    out = []
    for m in re.finditer(r'\S+', text):
        raw, s = m.group(0), m.start()
        lead = len(raw) - len(raw.lstrip(_PUNCT + '"'))
        core = raw.strip(_PUNCT + '"')
        if core.endswith("'") and core not in TITLE_ABBREV and not any(
                core[k:] in TITLE_ABBREV for k in (1, 2) if len(core) > k and all(c in PREFIX for c in core[:k])):
            core = core.rstrip("'")
        if core:
            out.append((s + lead, s + lead + len(core), core))
    return out


def split_prefix(tok, closed):
    """Peel up to two prefix letters ONLY when what is left is in `closed`.

    Prefixes are peeled from closed-class tokens (titles, standalone names) and
    never from open vocabulary: peeling שו off שומר is how an unpaid guardian,
    שומר חנם, once became a rabbi called מר חנם. מר is never reached by peeling.
    """
    if tok in closed:
        return '', tok
    for n in (1, 2):
        if len(tok) > n and all(ch in PREFIX for ch in tok[:n]) and tok[n:] in closed and tok[n:] != 'מר':
            return tok[:n], tok[n:]
    return None, None


class Mention:
    __slots__ = ('start', 'end', 'surface', 'kind', 'title', 'given', 'fathers', 'certain', 'prefix', 'alt')

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))

    def __repr__(self):
        return f'<{self.kind} {self.surface!r}{"" if self.certain else " ?"}>'


def find(text, lexicon):
    """Yield Mention objects for a normalised string.

    `lexicon` answers one question: is this word a given name? (lexicon.py)
    """
    toks = tokens(text)
    i, n = 0, len(toks)
    while i < n:
        s, e, tok = toks[i]
        head = None

        # "א"ר יוחנן": the verb and the short title are one token
        if tok in _AMAR_R or (len(tok) > 3 and tok[0] in PREFIX and tok[1:] in _AMAR_R):
            if i + 1 < n and lexicon.is_given(toks[i + 1][2]):
                # the title lives inside the verb token, so it is put back in
                # front of the name: "א"ר יוחנן" reports the name ר' יוחנן
                head = dict(start=toks[i + 1][0], j=i + 2, title="ר'", given=toks[i + 1][2],
                            kind='name', certain=True, prefix='', lead="ר'")
        if head is None:
            core = tok
            pfx = ''
            if core not in TITLE_ABBREV and not _ABBREV.match(core):
                p, c = split_prefix(tok, TITLES | STANDALONE | TITLE_ABBREV)
                if c:
                    pfx, core = p, c
            if _ABBREV.match(core) or (len(core) > 2 and core[0] in PREFIX and _ABBREV.match(core[1:])):
                ab = core if _ABBREV.match(core) else core[1:]
                head = dict(start=s, j=i + 1, title=None, given=None, kind='abbrev', certain=False,
                            prefix='' if _ABBREV.match(core) else core[0], surface=ab)
            elif core in TITLES or core in TITLE_ABBREV:
                nxt = toks[i + 1][2] if i + 1 < n else None
                if nxt and nxt not in CONNECTORS and lexicon.is_given(nxt):
                    head = dict(start=s, j=i + 2, title=core, given=nxt, kind='name', certain=True, prefix=pfx)
                elif nxt and nxt not in CONNECTORS and lexicon.is_unknown(nxt):
                    # A title before a word seen too rarely to judge. In a hand
                    # sample this was close to a coin flip between a rare sage
                    # and a title followed by an ordinary word, so it is
                    # reported as uncertain. `alt` says what it falls back to
                    # if the typing stage rejects it: רב alone is still Rav.
                    head = dict(start=s, j=i + 2, title=core, given=nxt, kind='name', certain=False,
                                prefix=pfx, alt='bare' if core in STANDALONE else None)
                elif core in STANDALONE:
                    head = dict(start=s, j=i + 1, title=None, given=core, kind='bare', certain=False, prefix=pfx)
            elif core in STANDALONE:
                head = dict(start=s, j=i + 1, title=None, given=core, kind='bare',
                            certain=core not in ('רב', 'רבי'), prefix=pfx)
            elif i + 1 < n and (tok, toks[i + 1][2]) in BEN_NAMES:
                head = dict(start=s, j=i + 2, title=None, given=f'{tok} {toks[i + 1][2]}', kind='name',
                            certain=True, prefix='')
        if head is None:
            i += 1
            continue

        j, fathers = head['j'], []
        takes_patronymic = head['kind'] == 'name' or head['given'] in STANDALONE_WITH_PATRONYMIC
        while takes_patronymic and j < n and toks[j][2] in CONNECTORS:
            k = j
            while k < n and toks[k][2] in CONNECTORS:          # בר בר חנה
                k += 1
            if k < n and toks[k][2] in ('ד',):
                k += 1
            ftitle, fgiven = None, None
            if k < n and toks[k][2] == 'אבא' and not (k + 1 < n and lexicon.is_given(toks[k + 1][2])):
                # "בר אבא": Abba is the father's NAME here, not a title waiting
                # for one. Reading it as a title swallowed the next word.
                fathers.append((None, 'אבא'))
                j = k + 1
                continue
            if k < n:
                t = toks[k][2]
                # בריה דרב אידי: the ד is glued to the father's title
                p, c = split_prefix(t, TITLES | TITLE_ABBREV)
                if c and k + 1 < n and lexicon.is_given(toks[k + 1][2]):
                    ftitle, fgiven, k = c, toks[k + 1][2], k + 2
                elif c and k + 1 < n and lexicon.is_unknown(toks[k + 1][2]):
                    # "בריה דרב עוירא" where the father's name is too rare to
                    # judge: cutting here would report "son of Rav himself"
                    ftitle, fgiven, k = c, toks[k + 1][2], k + 2
                    head['certain'] = False
                elif c in ('רבי', 'רב') and p is not None:
                    ftitle, fgiven, k = None, c, k + 1          # בריה דרב: son of Rav himself
                elif lexicon.is_given(t) or (t[0] in PREFIX and lexicon.is_given(t[1:]) and toks[j][2] == 'בריה'):
                    fgiven, k = (t if lexicon.is_given(t) else t[1:]), k + 1
            if fgiven is None:
                break
            fathers.append((ftitle, fgiven))
            j = k
        if fathers and head['kind'] == 'bare':
            head['kind'], head['certain'] = 'name', True
        end = toks[j - 1][1]
        first = next(x for x in range(n) if toks[x][0] >= head['start'])
        words = [toks[x][2] for x in range(first, j)]
        if head['prefix'] and words and words[0].startswith(head['prefix']):
            words[0] = words[0][len(head['prefix']):]
        # Davidson prints "רבן (שמעון בן) גמליאל"; the brackets are an editor's
        # mark, not part of the name
        if head.get('lead'):
            words.insert(0, head['lead'])
        surface = head.get('surface') or ' '.join(words)
        yield Mention(start=head['start'], end=end, surface=surface, kind=head['kind'], title=head['title'],
                      given=head['given'], fathers=fathers, certain=head['certain'], prefix=head['prefix'],
                      alt=head.get('alt'))
        i = j
