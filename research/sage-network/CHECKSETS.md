# Check sets, marked by two frontier models

Every claim of accuracy in this study is scored against a check set. The check
sets are marked by models, not by people, so the design has to earn the trust
that a human marker would be given for free.

## Who marks

Two flagship models from two different labs, each working alone:

- `openai/gpt-6-astra`
- `anthropic/claude-fable-5.1`

A name counts as the reference only when **both** report it. A name only one
reports is listed and left unscored, because nobody has settled it. A third
lab's model is brought in only for those, and what it cannot settle is
reported as contested. How often the two agree is the ceiling: the pipeline
cannot be shown to be more right than its two references are with each other.

## What keeps the markers honest

1. **They see the Hebrew and Aramaic only.** No translation, and nothing the
   pipeline produced, so they cannot be steered toward its answers.
2. **Every name must be an exact piece of the passage.** This is checked by
   machine. A label that quotes words not on the page is thrown out and
   counted. A model cannot invent a sage without being caught.
3. **They may say they are unsure.** A forced guess would hide exactly the
   cases the study is about.
4. **The sample is drawn from the text, not from the pipeline's output**, so a
   name the finder misses can be counted as a miss. It is seeded, so the same
   command draws the same passages.
5. **Scoring is by position on the page, not by string.** One edition prints
   "said Rabbi Tanchum" with the verb and title in a single short token, so
   the marker copies the name without its title while the finder puts the
   title back. Same mention, different string.
6. **Everything is published**: passages, each marker's labels, spend. Anyone
   can re-mark a sample and disagree in public.

## What this cannot give us

Reading tasks (is this a name, what joins these two) are what these models do
well, and the on-the-page check makes cheating visible. Identity tasks (which
Rabbi Elazar is this) are different: a model's answer carries the scholarship
it was trained on. That is a fair reference for "what a well-read scholar would
say", and it is independent of our pipeline, but it is not independent of the
biographical tradition. The paper has to say so.

Two references made by people already exist and cost nothing: an edition that
spells out a short form has recorded its editor's choice at that spot, and
Sefaria's passage-level person tags were placed by people. Both are opinions,
and both are used as further opinions, not as the answer.

## The first round: 28 passages (20 September 2026)

28 passages, four from each of the seven bodies of text.

| | |
|---|---|
| Sage names both markers reported | 39 |
| Names only one marker reported | 0 |
| Kinds they agreed on | 54 of 55 |
| Names thrown out as not on the page | 0 of 154 |
| Cost, both markers | $0.45, about 1.6 cents a passage |

Against that reference the finder found 36 of 39 names and reported nothing
the markers did not. It drew the edge of the name the same way in 26 of the 36.
The misses have clear kinds, and each is now a task:

- descriptions that are part of a name are dropped: רבי אלעזר המודעי, רבי יוסה הגלילי
- given names that are also common Bible names are rejected, because the
  lexicon judges a word by all its appearances: רב יוסף was read as bare רב
- names with no title are not seen: שמעון, חנינא בן אחי רבי יהושע
- a bare ר' is not seen

My own earlier check had called 40 of 40 sampled names real. That was true and
beside the point: it measured what the finder reported, and could not see what
it cut short or left out. That is what a check set is for.

## The second round, on passages the finder had never seen

The pilot's 28 passages were used to fix the finder, so its score on them
flatters it. 56 fresh passages were drawn with a different seed, excluding the
pilot, and marked the same way.

| | First sight | After fixes |
|---|---|---|
| Names found, of the 99 both markers gave | 97 | 98 |
| Found with the same edge | 89 | 95 |
| Reported, but neither marker gave it | 10 | 2 |

The markers agreed on 99 names and split on 2. Both splits were the same
thing: Fable added a mark the page does not print, writing ר' where the page
has a bare ר. The on-the-page check threw those two labels out. So the check
does catch a model quietly tidying the text, which is the failure it exists for.

What the fresh passages caught, each now a test:

- בית שמאי is a school, not Shammai speaking. This was 8 of the 10 false reports.
- ביר' and בי ר' are short forms of "son of Rabbi". Without them one long name
  was split into two people. בי רב, the study hall, is not a son.
- three prefix letters on one title: לכדרב שישא
- a father known by a byname rather than a given name: רבי נחוניה בן הקנה
- אבא as a man's own name: אבא בר ירמיה

One fix went wrong and the check sets caught that too. Widening "descriptions"
from words beginning with ה to any word that mostly follows a name let in junk,
including בשם, "in the name of", which was then glued onto names. It was
reverted the same hour.

Both sets are now development sets: the finder has been tuned against both.
The held-out sets are not drawn yet, and must not be looked at while building.

## Cost

About 1.6 cents a passage for both markers at list price. The full sets, about
800 items, come to roughly $13. The provider's batch endpoint halves that. The
marker script takes a hard dollar cap and stops when the provider's own
reported spend reaches it.
