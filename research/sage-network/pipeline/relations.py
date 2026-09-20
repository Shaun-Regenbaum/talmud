"""What joins two names: the words before, between and after the pair.

An earlier version looked only BETWEEN two names. That cannot see a relation
whose verb comes first, and many do: איתיביה רב נחמן לרב הונא, "Rav Nachman
objected to Rav Huna", puts the verb before both names and marks the second
with the prefix ל. So a pair is described by three things:

    before   up to two tokens ahead of the first name
    between  the tokens between the names (capped)
    prefix   the letter glued to the second name: ל to, ד of, כ like, מ from

Nothing here says what a pattern MEANS. It is counted, and the labelling of
patterns into relations is a separate, checked step.
"""
import names

MAX_BETWEEN = 5        # tokens; further apart than this, no relation is claimed
BEFORE = 2

# The same verb is printed many ways: אמר, ואמר, דאמר, והאמר, and the short forms
# א"ר (said Rabbi) and א"ל (said to him). Folding them together is safe: it does
# not decide what the relation IS, only that these are one wording of it.
_FOLD = {'א"ר': 'אמר', "א'ר": 'אמר', 'א"ל': 'אמר ליה', 'אמ"ל': 'אמר ליה', 'אמר לו': 'אמר ליה'}
_VERB_PREFIX = ('וה', 'ו', 'ד', 'ה', 'כד', 'ש')
_VERBS = {'אמר', 'אומר', 'אמרי', 'תני', 'בעי', 'בעא', 'מתיב', 'איתיביה', 'מתקיף', 'שלח', 'אתא', 'סבר', 'דרש', 'פתר'}
# words before the first name that can state a relation; anything else before
# it is ordinary context and is dropped
REL_BEFORE = _VERBS | {'ליה', 'אמר ליה', 'דברי', 'בשם', 'משום', 'משמיה', 'מיניה', 'קמיה', 'קומי', 'לקמיה', 'כדברי'}


def fold(tok):
    tok = _FOLD.get(tok, tok)
    for p in _VERB_PREFIX:
        if tok.startswith(p) and tok[len(p):] in _VERBS | {'אמר ליה'}:
            return tok[len(p):]
        if tok.startswith(p) and _FOLD.get(tok[len(p):]):
            return _FOLD[tok[len(p):]]
    return tok


def pairs(text, lexicon, keep=None):
    """Yield (first mention, second mention, signature dict) for adjacent names.

    `keep` says whether a mention counts as a name at all. A mention it rejects
    (הרבה typed as the word "much") is treated as ordinary text between names.
    """
    toks = names.tokens(text)
    ms = [m for m in names.find(text, lexicon) if keep is None or keep(m)]
    starts = [t[0] for t in toks]

    def tok_index(pos):
        return next((i for i, s in enumerate(starts) if s >= pos), len(toks))

    prev_end = 0
    for a, b in zip(ms, ms[1:]):
        ia_start, ia_end = tok_index(a.start - len(a.prefix or '')), tok_index(a.end)
        ib_start = tok_index(b.start - len(b.prefix or ''))
        between = [fold(t[2]) for t in toks[ia_end:ib_start]]
        if len(between) > MAX_BETWEEN:
            prev_end = a.end
            continue
        # only words AFTER the previous name: "רבי אחא רבי תנחום בשם רבי יוחנן"
        # must not report אחא, the tail of the previous name, as a relation word
        first = max(tok_index(prev_end), ia_start - BEFORE)
        raw_before = [fold(t[2]) for t in toks[first:ia_start]]
        before = [w for w in raw_before if w in REL_BEFORE]
        prev_end = a.end
        yield a, b, {'before': before, 'between': between, 'prefix': b.prefix or '',
                     'prefixA': a.prefix or ''}


def signature(sig):
    """A compact, countable key for one joining pattern."""
    before = ' '.join(sig['before'][-1:])
    return f"{before} {sig.get('prefixA', '')}[A] {' '.join(sig['between'])} {sig['prefix']}[B]".strip()
