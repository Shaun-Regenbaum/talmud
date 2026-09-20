"""Which words are given names? Learned from the corpus, not listed by hand.

The test is behaviour, not frequency. "אמר" follows רב thousands of times
("Rav said"), so counting would crown it a name. What separates a given name
from an ordinary word is WHERE ELSE the word turns up:

    name-slot rate = (times the word sits right after a title or a "son of"
                      connector) / (all the times the word appears)

הונא sits after רב nearly every time it appears. אמר sits after a title in a
sliver of its appearances. כשמעתיה appears once in the whole corpus, so nothing
can be said about it and it is reported as unknown, never as a name.
"""
import collections, json

from names import CONNECTORS, PREFIX, TITLE_ABBREV, TITLES, tokens

MIN_COUNT = 3          # a word seen once or twice cannot show a pattern
MIN_RATE = 0.5         # it must be in a name slot at least half the time
MIN_UNITS = 2          # ...and on at least two different pages, so one story
                       # repeating a phrase cannot mint a name by itself
NEVER = {              # verbs and particles that follow a bare name constantly
    'אמר', 'אומר', 'אמרי', 'אומרים', 'הוה', 'הוו', 'סבר', 'תני', 'מתני', 'בעי', 'לא', 'הא',
    'כי', 'מי', 'הוא', 'היא', 'אין', 'יש', 'על', 'אל', 'את', 'של', 'זה', 'כל', 'אף', 'אי',
}


class Lexicon:
    def __init__(self, given=(), counts=None):
        self.given = set(given)
        self.counts = counts or {}

    def is_given(self, word):
        return word in self.given

    def is_unknown(self, word):
        """Seen too rarely to judge. Not a name, not ruled out either."""
        if word in NEVER or word in self.given or not word.isalpha():
            return False
        return self.counts.get(word, 0) < MIN_COUNT

    def save(self, path):
        with open(path, 'w') as f:
            json.dump({'given': sorted(self.given), 'counts': self.counts}, f, ensure_ascii=False)

    @classmethod
    def load(cls, path):
        with open(path) as f:
            d = json.load(f)
        return cls(d['given'], d.get('counts'))


def _is_title(tok):
    if tok in TITLES or tok in TITLE_ABBREV or tok in ('א"ר',):
        return True
    for n in (1, 2):
        if len(tok) > n and all(c in PREFIX for c in tok[:n]) and tok[n:] in (TITLES - {'מר'}) | TITLE_ABBREV | {'א"ר'}:
            return True
    return False


def build(units):
    """Build a Lexicon from an iterable of (unit id, normalised text).

    Feed it ONE witness per work. Two editions of the same page repeat every
    word, so a word that follows a title once would be counted twice and pass
    for a recurring name. That is how "Rav Hamotzi" once got in.
    """
    total = collections.Counter()
    slot = collections.Counter()
    where = collections.defaultdict(set)
    for unit, text in units:
        toks = [t for _, _, t in tokens(text)]
        for i, w in enumerate(toks):
            if not w.isalpha():
                continue
            total[w] += 1
            prev = toks[i - 1] if i else ''
            if _is_title(prev) or prev in CONNECTORS:
                slot[w] += 1
                where[w].add(unit)
    given = set()
    for w, c in total.items():
        if w in NEVER or w in CONNECTORS or w in TITLES or c < MIN_COUNT:
            continue
        if slot[w] / c >= MIN_RATE and len(where[w]) >= MIN_UNITS:
            given.add(w)
    return Lexicon(given, dict(total))
