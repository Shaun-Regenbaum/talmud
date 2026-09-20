"""Find candidate name mentions. Candidates, not people.

Deliberately conservative in two ways, both learned from getting it wrong:

  - No clitic stripping. Hebrew glues single letters to the front of words,
    and stripping them turns ordinary words into fake sages: שומר חנם, an
    unpaid guardian, became a rabbi called מר חנם.
  - מר is not treated as a title on its own for the same reason.

What survives here is a string that LOOKS like a name. Deciding whether it is
a person at all is a separate, later step.
"""
import re

TITLE = r'(?:רבי|רבן|רבינא|רבה|רבא|רב|אבא)'
# names the corpus uses with no title; without these the single largest
# relation in the Bavli (Rav Yehuda passing on Shmuel) is invisible
BARE = r'(?:שמואל|עולא|אביי|רבא|לוי|זעירי|רבין|אמימר|מרימר)'
WORD = r'[א-ת]{2,}'
CONNECTOR = r'(?:בריה\s+ד|ברבי|בר|בן)'
PATRONYMIC = rf'{CONNECTOR}\s*(?:{TITLE}\s+)?{WORD}'
NAME = rf'(?:{TITLE}\s+{WORD}(?:\s+{PATRONYMIC})?|{BARE})'
RX = re.compile(rf'(?<![א-ת]){NAME}')

# words that follow a title in ordinary prose, not as somebody's name
STOPWORDS = {
    'חנם', 'שכר', 'ביום', 'בשבת', 'אני', 'אף', 'לא', 'הא', 'כי', 'מי',
    'הוא', 'היא', 'אמר', 'אומר', 'אמרו', 'אחד', 'כל', 'זה', 'אין', 'יש',
}


def plausible(name):
    parts = name.split()
    return not (len(parts) >= 2 and parts[1] in STOPWORDS)


def find(text):
    """Yield (start offset, name) for each candidate in a normalised string."""
    for m in RX.finditer(text):
        n = m.group(0).strip()
        if plausible(n):
            yield m.start(), n
