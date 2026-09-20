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

from names import CONNECTORS, NEVER_PEELED, PREFIX, TITLE_ABBREV, TITLES, tokens

MIN_COUNT = 3          # a word seen once or twice cannot show a pattern
MIN_RATE = 0.5         # it must be in a name slot at least half the time
MIN_UNITS = 2          # ...and on at least two different pages, so one story
                       # repeating a phrase cannot mint a name by itself

# A second road in, for words that are names AND ordinary words. יוסף is mostly
# the Bible's Joseph, with no title, so its name-slot rate is low and the first
# rule throws out Rav Yosef. מנא is mostly "from where". What such words still
# do, when they ARE a sage's name, is ACT like a speaker right after a title:
# "רב יוסף אמר", "רבי מנא בעי", "רב יוסף בר חייא".
SPEAKER_NEXT = {'אמר', 'אומר', 'אמרי', 'סבר', 'בעי', 'תני', 'דרש', 'דריש', 'פתר', 'פתח', 'מתני',
                'בר', 'בן', 'בריה', 'ברבי', 'בשם', 'משום', 'משמיה'}
MIN_SPEAKER = 5        # times the title+word pair is followed by a speaker word
MIN_SPEAKER_UNITS = 3
# ...and the word must sit after a title a fair share of the time. Measured on
# the full text: names that are also words do so at least 23% of the time
# (שמעיה 0.23, יעקב 0.46, יוסף 0.49); ordinary words at most 4% (אתה 0.004,
# אחד 0.03, שהוא 0.04). "רבי, אתה אומר", Rabbi, you say, is why this is needed.
MIN_SPEAKER_RATE = 0.10

# a description that belongs to a name: רבי אלעזר המודעי, רבי יוסי הגלילי
MIN_DESC = 3
MIN_DESC_RATE = 0.5

NEVER = {              # verbs and particles that follow a bare name constantly
    'אמר', 'אומר', 'אמרי', 'אומרים', 'הוה', 'הוו', 'היה', 'היו', 'הוי', 'סבר', 'תני', 'מתני', 'בעי',
    'לא', 'הא', 'כי', 'מי', 'הוא', 'היא', 'אין', 'יש', 'על', 'אל', 'את', 'של', 'זה', 'כל', 'אף', 'אי',
    'נמי', 'לטעמיה', 'גופיה', 'עצמו', 'דאמר', 'ואמר', 'שאמר', 'מאי', 'אלא', 'הכי', 'לית', 'אית',
}


class Lexicon:
    def __init__(self, given=(), counts=None, descriptions=(), origins=(), father_words=()):
        self.given = set(given)
        self.counts = counts or {}
        self.descriptions = set(descriptions)
        self.origins = set(origins)
        self.father_words = set(father_words)

    def is_father_word(self, word):
        """A byname a father is known by: רבי נחוניה בן הקנה."""
        return word in self.father_words

    def is_origin(self, place):
        """Is this a place a sage is 'the man of'? רבי יוסי איש הוצל."""
        return place in self.origins

    def is_description(self, word):
        return word in self.descriptions

    def is_given(self, word):
        return word in self.given

    def is_unknown(self, word):
        """Seen too rarely to judge. Not a name, not ruled out either."""
        if word in NEVER or word in self.given or not word.isalpha():
            return False
        return self.counts.get(word, 0) < MIN_COUNT

    def save(self, path):
        with open(path, 'w') as f:
            json.dump({'given': sorted(self.given), 'descriptions': sorted(self.descriptions),
                       'origins': sorted(self.origins), 'fatherWords': sorted(self.father_words),
                       'counts': self.counts}, f, ensure_ascii=False)

    @classmethod
    def load(cls, path):
        with open(path) as f:
            d = json.load(f)
        return cls(d['given'], d.get('counts'), d.get('descriptions') or (), d.get('origins') or (),
                   d.get('fatherWords') or ())


def _is_title(tok):
    if tok in TITLES or tok in TITLE_ABBREV or tok in ('א"ר',):
        return True
    # Peel prefixes only onto titles long enough to trust. דבר, "a thing", is
    # not ד-ב glued to the short title ר: that reading made "דבר אחר", another
    # thing, look like a title followed by a name, four thousand times.
    closed = ((TITLES | TITLE_ABBREV) - NEVER_PEELED) | {'א"ר'}
    for n in (1, 2, 3):
        if len(tok) > n and all(c in PREFIX for c in tok[:n]) and tok[n:] in closed:
            return True
    return False


def build(units):
    """Build a Lexicon from an iterable of (unit id, normalised text).

    Feed it ONE witness per work. Two editions of the same page repeat every
    word, so a word that follows a title once would be counted twice and pass
    for a recurring name. That is how "Rav Hamotzi" once got in.
    """
    units = [(u, [t for _, _, t in tokens(text)]) for u, text in units]
    total = collections.Counter()
    slot = collections.Counter()
    where = collections.defaultdict(set)
    speaker = collections.Counter()
    speaker_where = collections.defaultdict(set)
    for unit, toks in units:
        for i, w in enumerate(toks):
            if not w.isalpha():
                continue
            total[w] += 1
            prev = toks[i - 1] if i else ''
            if _is_title(prev) or prev in CONNECTORS:
                slot[w] += 1
                where[w].add(unit)
                nxt = toks[i + 1] if i + 1 < len(toks) else ''
                if _is_title(prev) and (nxt in SPEAKER_NEXT or (nxt[:1] == 'ו' and _is_title(nxt[1:]))):
                    speaker[w] += 1
                    speaker_where[w].add(unit)
    given = set()
    for w, c in total.items():
        if w in NEVER or w in CONNECTORS or w in TITLES or c < MIN_COUNT:
            continue
        by_rate = slot[w] / c >= MIN_RATE and len(where[w]) >= MIN_UNITS
        by_behaviour = (speaker[w] >= MIN_SPEAKER and len(speaker_where[w]) >= MIN_SPEAKER_UNITS
                        and slot[w] / c >= MIN_SPEAKER_RATE)
        if by_rate or by_behaviour:
            given.add(w)

    # Descriptions: a word beginning with ה that mostly turns up right after a
    # title-and-given-name pair. Learned the same way as names, so הגלילי and
    # המודעי are found without a hand-typed list, and הלכה is not.
    after_name = collections.Counter()
    fathers = collections.Counter(); fathers_where = collections.defaultdict(set)
    for unit, toks in units:
        for i in range(2, len(toks)):
            w = toks[i]
            if not w.isalpha() or len(w) < 3:
                continue
            if toks[i - 1] in given and _is_title(toks[i - 2]):
                after_name[w] += 1
            # a byname after "son of": רבי נחוניה בן הקנה
            # only after a TITLED name: "בן ארבעים", forty years old, follows plain names too
            if (toks[i - 1] in ('בן', 'בר') and toks[i - 2] in given and i >= 3 and _is_title(toks[i - 3])
                    and w not in given):
                fathers[w] += 1; fathers_where[w].add(unit)
    # Only words beginning with ה. Widening this to any word that mostly follows
    # a name was tried and let in junk, including בשם, "in the name of", which
    # then got glued onto names. The check sets caught it. A description with no
    # ה, such as קרתיגנא, "of Carthage", is a known miss.
    descriptions = {w for w, c in after_name.items()
                    if w[0] == 'ה' and len(w) > 3 and c >= MIN_DESC and c / total[w] >= MIN_DESC_RATE
                    and w not in NEVER and w not in given}
    # ...and mostly found there. "ארבעים", forty, follows "בן" after a titled
    # name a few times ("forty years old") but turns up everywhere else as well.
    father_words = {w for w, c in fathers.items()
                    if c >= 3 and len(fathers_where[w]) >= 2 and c / total[w] >= 0.25
                    and w not in NEVER and w not in TITLES and w not in CONNECTORS}

    # "איש X", the man of X, belongs to a name only when X is a place sages are
    # named for. איש is also just "a man": "רב יצחק בריה דרב אמי: איש מזריע..."
    # once swallowed two ordinary words. So the places are learned too: X must
    # follow a titled name, as "איש X", at least twice.
    origin = collections.Counter()
    ish_any = collections.Counter()
    for unit, toks in units:
        for i in range(len(toks) - 1):
            if toks[i] != 'איש':
                continue
            place = toks[i + 1]
            if place in ('כפר', 'בית', 'הר') and i + 2 < len(toks):
                place = f'{place} {toks[i + 2]}'
            ish_any[place] += 1
            if i >= 2 and toks[i - 1] in given and _is_title(toks[i - 2]):
                origin[place] += 1
    # "איש ואשתו", a man and his wife, follows a name now and then too. What
    # marks a real place of origin is that "איש X" is MOSTLY found after a name.
    origins = {pl for pl, c in origin.items() if c >= 2 and c / ish_any[pl] >= 0.5}
    return Lexicon(given, dict(total), descriptions, origins, father_words)
