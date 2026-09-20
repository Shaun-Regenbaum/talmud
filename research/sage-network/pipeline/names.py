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
TITLE_ABBREV = {"ר'", 'ר'}                 # ר' = Rabbi, written short; some editions drop the mark
# Complete names with no title. רב and רבי alone are Rav and Rebbi.
STANDALONE = {
    'רב', 'רבי', 'רבא', 'רבה', 'רבינא', 'שמואל', 'עולא', 'אביי', 'לוי', 'זעירי',
    'רבין', 'אמימר', 'מרימר', 'רפרם', 'אילפא', 'הלל', 'שמאי', 'רבנאי', 'גניבא',
}
# Standalone names that also take a patronymic: רבה בר נחמני, רבא בר יוסף.
STANDALONE_WITH_PATRONYMIC = {'רבה', 'רבא', 'רבינא', 'עולא', 'לוי', 'רבין', 'שמואל', 'רפרם'}
# Standalone names that turn up as a father: רב ביבי בר אביי, רב אחא בריה דרבא.
# רב and רבי are handled where the father's title is read.
STANDALONE_FATHERS = STANDALONE - {'רב', 'רבי', 'הלל', 'שמאי'}
# Names built on "son of" with no given name: בן עזאי, בר קפרא.
BEN_NAMES = {('בן', 'עזאי'), ('בן', 'זומא'), ('בן', 'ננס'), ('בן', 'בתירא'), ('בר', 'קפרא'),
             ('בר', 'פדא'), ('בן', 'פטורי'), ('בן', 'בג'),
             # ריש לקיש has no title and no "son of". It was missed entirely, 1,162
             # times, and no random check set happened to contain him.
             ('ריש', 'לקיש')}
_BEN_FIRST = {a for a, _ in BEN_NAMES}
CONNECTORS = {'בר', 'בן', 'ברבי', 'ברב', 'בריה', 'בירבי', "ביר'", "בר'", 'בי'}
# בי is "son of Rabbi" only before a title (ר' ישמעאל בי ר' יוחנן). Otherwise it
# is "the house of", as in בי רב, the study hall.
CONNECTOR_NEEDS_TITLE = {'בי'}
CONNECTOR_CARRIES_TITLE = {'ברבי', 'בירבי', "ביר'", "בר'"}      # the title is inside the connector
PREFIX = 'ודלכבמשה'                       # letters Hebrew glues to the next word
# Too short to trust after peeling: שומר would give מר, and שכר would give ר.
NEVER_PEELED = {'מר', 'ר'}

_PUNCT = '.,:;?!()[]{}<>-–—־׃/'
_ABBREV = re.compile(r'^(א?ר[א-ת]{0,3}"[א-ת]{1,2})$')     # ר"י ריב"ל רשב"ג אר"י
_SON_OF_ABBREV = re.compile(r'^ב(ר"[א-ת]{1,2})$')            # בר"ש, בר"י
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
        if core.endswith("'") and core not in TITLE_ABBREV and core not in CONNECTORS and not any(
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
    if tok.startswith('אד') and tok[2:] in closed and tok[2:] not in NEVER_PEELED:
        return 'אד', tok[2:]                       # קשיא דרב אדרב: "on that of Rav"
    for n in (1, 2, 3):                           # לכדרב שישא: to-like-of-Rav, three deep
        if 'ה' in tok[:n]:
            # A personal name never takes "the". הרבה is "much", המרבה is "he who
            # adds", ההלל is the Hallel. The typing pass called all 1,540 sure
            # cases of הרבה a word; reading it as the sage Rabbah was always wrong.
            break
        if len(tok) > n and all(ch in PREFIX for ch in tok[:n]) and tok[n:] in closed and tok[n:] not in NEVER_PEELED:
            return tok[:n], tok[n:]
    return None, None


class Mention:
    __slots__ = ('start', 'end', 'surface', 'kind', 'title', 'given', 'fathers', 'certain', 'prefix', 'alt',
                 'description')

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))

    def __repr__(self):
        return f'<{self.kind} {self.surface!r}{"" if self.certain else " ?"}>'


# Words after which a bare given name is someone speaking or being quoted.
_SPEECH = {'אמר', 'בשם', 'משום', 'משמיה', 'תני', 'תנא', 'איתיביה', 'מתיב', 'דבי', 'אומר'}


def _speech_word(tok):
    """אמר, והאמר, דתני, כדתני, משמיה: the word, with or without glued letters."""
    if tok in _SPEECH:
        return True
    for n in (1, 2, 3):
        if len(tok) > n and all(ch in 'ודכה' for ch in tok[:n]) and tok[n:] in _SPEECH:
            return True
    return False


def _untitled(tok, lexicon):
    """The given name in a token with no title: חזקיה, or דחזקיה after משמיה. Else ''."""
    if lexicon.is_given(tok):
        return tok
    if len(tok) > 3 and tok[0] in 'דול' and lexicon.is_given(tok[1:]):
        return tok[1:]
    return ''


def _glued_mar(tok):
    """דמר, כמר, ולמר. מר is never peeled in general (שומר is a guardian), so this
    is only consulted when "son of" follows."""
    return len(tok) in (3, 4) and tok.endswith('מר') and all(ch in PREFIX for ch in tok[:-2])


def _given_after_title(lexicon, word):
    """אבא is a title before a name (אבא שאול) and a given name after one (רבי אבא)."""
    return word == 'אבא' or lexicon.is_given(word)


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
            elif core == 'אבא' and i + 1 < n and toks[i + 1][2] in ('בר', 'בן', 'בריה'):
                # "אבא בר ירמיה": here Abba is the man's own name
                head = dict(start=s, j=i + 1, title=None, given='אבא', kind='name', certain=True,
                            prefix=pfx, needs_father=True)
            elif (core == 'מר' or _glued_mar(tok)) and i + 1 < n and toks[i + 1][2] in ('בר', 'בריה'):
                if core != 'מר':
                    pfx, core = tok[:-2], 'מר'             # דמר בר רב אשי. Safe only because "son of" follows
                # מר בר רב אשי, מר בריה דרבינא: known only as "Mar, son of". Kept
                # only if a father is found below. An anchor, and it was never found.
                head = dict(start=s, j=i + 1, title=None, given='מר', kind='name', certain=True,
                            prefix=pfx, needs_father=True)
            elif core in TITLES or core in TITLE_ABBREV:
                nxt = toks[i + 1][2] if i + 1 < n else None
                stands_alone = core in STANDALONE or core == "ר'"             # ר' alone is Rebbi, written short
                if core == 'ר' and not (nxt and lexicon.is_given(nxt)):
                    i += 1                                  # a lone letter ר is nothing unless a known name follows
                    continue
                if nxt and nxt not in CONNECTORS and _given_after_title(lexicon, nxt) and (core != 'אבא' or nxt != 'אבא'):
                    # רבי אבא: אבא is a title before a name (אבא שאול) but a given
                    # name after one. Missing this reported "רבי אבא בר כהנא" as
                    # Rebbi followed by a second man called Abba bar Kahana.
                    head = dict(start=s, j=i + 2, title=core, given=nxt, kind='name', certain=True, prefix=pfx)
                elif nxt and nxt not in CONNECTORS and lexicon.is_unknown(nxt):
                    # A title before a word seen too rarely to judge. In a hand
                    # sample this was close to a coin flip between a rare sage
                    # and a title followed by an ordinary word, so it is
                    # reported as uncertain. `alt` says what it falls back to
                    # if the typing stage rejects it: רב alone is still Rav.
                    head = dict(start=s, j=i + 2, title=core, given=nxt, kind='name', certain=False,
                                prefix=pfx, alt='bare' if stands_alone else None)
                elif stands_alone:
                    head = dict(start=s, j=i + 1, title=None, given=core, kind='bare', certain=False, prefix=pfx)
            elif core in STANDALONE:
                prev = toks[i - 1][2] if i else ''
                if core in ('שמאי', 'הלל') and (prev == 'בית' or prev[1:] == 'בית' or prev[2:] == 'בית'):
                    # בית שמאי is a school, not Shammai speaking
                    head = dict(start=toks[i - 1][0] + (len(prev) - 3), j=i + 1, title=None, given=core,
                                kind='group', certain=True, prefix='', surface=f'בית {core}')
                else:
                    head = dict(start=s, j=i + 1, title=None, given=core, kind='bare',
                                certain=core not in ('רב', 'רבי'), prefix=pfx)
            elif lexicon.is_given(tok) and i + 1 < n and toks[i + 1][2] in CONNECTORS:
                # no title at all: תנחום בר חנילאי, שמעון בן שטח. Kept only if a
                # father is actually found below.
                head = dict(start=s, j=i + 1, title=None, given=tok, kind='name', certain=True,
                            prefix='', needs_father=True)
            elif _untitled(tok, lexicon) and ((i + 1 < n and toks[i + 1][2] in ('אומר', 'אמר') and lexicon.is_given(tok))
                                              or (i and _speech_word(toks[i - 1][2]))):
                # A known given name with no title, speaking or spoken for: בשם
                # חזקיה, תני חזקיה, משמיה דחזקיה. It may be a sage or a figure
                # from the Bible (חזקיה is also the king); the typing stage decides.
                g = _untitled(tok, lexicon)
                head = dict(start=s, j=i + 1, title=None, given=g, kind='name', certain=False,
                            prefix=tok[:len(tok) - len(g)])
            elif i + 1 < n and (split_prefix(tok, _BEN_FIRST)[1], toks[i + 1][2]) in BEN_NAMES:
                # the second word must match too, so peeling is safe: לבן עזאי is
                # "to Ben Azzai", while לבן alone is "white" and is never reached
                bp, bc = split_prefix(tok, _BEN_FIRST)
                head = dict(start=s, j=i + 2, title=None, given=f'{bc} {toks[i + 1][2]}', kind='name',
                            certain=True, prefix=bp)
        if head is None:
            i += 1
            continue

        j, fathers = head['j'], []
        # ר"ש בן יוחי: a short form takes a father too. It stays a short form,
        # because ר"ש still has to be spelled out, but the father is the best
        # clue there is to which name it stands for.
        takes_patronymic = (head['kind'] in ('name', 'abbrev')
                            or (head['kind'] == 'bare' and head['given'] in STANDALONE_WITH_PATRONYMIC))
        if takes_patronymic and head['kind'] == 'name' and j < n and _SON_OF_ABBREV.match(toks[j][2]):
            # ר' אלעזר בר"ש: "son of R. Shimon", the connector glued to a short form
            fathers.append((None, toks[j][2][1:]))
            j += 1
        while takes_patronymic and j < n and toks[j][2] in CONNECTORS:
            k = j
            if toks[j][2] in CONNECTOR_NEEDS_TITLE and not (
                    j + 2 < n and split_prefix(toks[j + 1][2], TITLES | TITLE_ABBREV)[1]
                    and _given_after_title(lexicon, toks[j + 2][2])):
                break                                       # בי רב is the study hall
            while k < n and toks[k][2] in CONNECTORS:          # בר בר חנה
                k += 1
            if k < n and toks[k][2] in ('ד',):
                k += 1
            if k < n and toks[k][2] in ('אחי', 'אחות', 'אחותו'):          # בן אחי רבי יהושע: nephew of
                k += 1
                if k < n and toks[k][2] == 'של':
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
                if c and k + 1 < n and _given_after_title(lexicon, toks[k + 1][2]) and (c != 'אבא' or toks[k + 1][2] != 'אבא'):
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
                elif lexicon.is_father_word(t):               # בן הקנה, בן בג בג: a byname, not a given name
                    fgiven, k = t, k + 1
                elif split_prefix(t, STANDALONE_FATHERS)[1] and (t in STANDALONE_FATHERS or t[0] == 'ד'):
                    # חנן בר רבא, ביבי בר אביי, בריה דרבינא: the father is a man
                    # known by one name. Only a ד may be glued to it here.
                    fgiven, k = split_prefix(t, STANDALONE_FATHERS)[1], k + 1
            if fgiven is None:
                break
            fathers.append((ftitle, fgiven))
            j = k
        if head.get('needs_father') and not fathers:
            i += 1
            continue
        if fathers and head['kind'] == 'bare':
            head['kind'], head['certain'] = 'name', True
        description = None
        if head['kind'] == 'name' and j < n:
            t = toks[j][2]
            if lexicon.is_description(t):                 # רבי אלעזר המודעי
                description, j = t, j + 1
            elif t == 'איש' and j + 1 < n:                # רבי יוסי איש הוצל, איש כפר חנניה
                k = j + 2
                if toks[j + 1][2] in ('כפר', 'בית', 'הר') and k < n:
                    k += 1
                place = ' '.join(x[2] for x in toks[j + 1:k])
                if lexicon.is_origin(place):              # איש is also just "a man"
                    description, j = f'איש {place}', k
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
        if head['kind'] == 'abbrev' and fathers:
            surface = ' '.join([surface] + words[1:])
        # the span is the name itself: the prefix letter glued to it is not part of it
        start = head['start'] + len(head['prefix'] or '') if not head.get('lead') else head['start']
        yield Mention(start=start, end=end, surface=surface, kind=head['kind'], title=head['title'],
                      given=head['given'], fathers=fathers, certain=head['certain'], prefix=head['prefix'],
                      alt=head.get('alt'), description=description)
        i = j
