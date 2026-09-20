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


def pairs(text, lexicon):
    """Yield (first mention, second mention, signature dict) for adjacent names."""
    toks = names.tokens(text)
    ms = list(names.find(text, lexicon))
    starts = [t[0] for t in toks]

    def tok_index(pos):
        return next((i for i, s in enumerate(starts) if s >= pos), len(toks))

    for a, b in zip(ms, ms[1:]):
        ia_start, ia_end = tok_index(a.start), tok_index(a.end)
        ib_start = tok_index(b.start - len(b.prefix or ''))
        between = [t[2] for t in toks[ia_end:ib_start]]
        if len(between) > MAX_BETWEEN:
            continue
        before = [t[2] for t in toks[max(0, ia_start - BEFORE):ia_start]]
        # a name before the first name is somebody else, not a relation word
        yield a, b, {'before': before, 'between': between, 'prefix': b.prefix or ''}


def signature(sig):
    """A compact, countable key for one joining pattern."""
    return f"{' '.join(sig['before'][-1:])} [A] {' '.join(sig['between'])} {sig['prefix']}[B]".strip()
