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

## Sorting people from words: the cheap model does the bulk, and knows when to stop

About 55,000 mentions cannot be settled by rules. Bare רב is a sage and also
the word "much". יעקב with no title is the patriarch on one page and a sage on
the next. ר"ה is Rav Huna and also Rosh Hashanah. Each needs a judgement in its
own passage, so the judgement is made per mention, not per string.

Paying a flagship model for 55,000 judgements would cost a few hundred
dollars. So the work is split by what each model is good for, and the split is
measured. 210 mentions were drawn across the three kinds and typed three ways:

| | |
|---|---|
| The two flagship markers agree with each other | 205 of 210 (97.6%) |
| Jev gives the same kind as both markers | 184 of 205 (89.8%) |
| Jev agrees on the question that matters, sage or not | 195 of 205 (95.1%) |
| Cost of the two markers, for 210 | $1.47 |
| Cost of Jev, for the same 210 | half a cent |

The number that decides the design is not the 90%. Jev returns a confidence
with every answer, and the confidence is honest:

| Jev says it is | Share of mentions | Right |
|---|---|---|
| 0.9 or more sure | 69% | 99.3% |
| 0.7 to 0.9 | 19% | 76.9% |
| under 0.7 | 12% | 54.2% |

So Jev's answer is taken where it is at least 0.9 sure, and everything else
goes to a stronger reader. The cheap model does two thirds of the work at
flagship accuracy, and says which third it should not be trusted with.

Its misses have a pattern: the address "רבי", my teacher, said to someone, read
as the sage; and a Bible name read as the Bible figure when the passage means a
sage of that name.

### Who reads the hard third

The mentions Jev is under 0.9 sure of were given to a mid-priced model, Gemini
3.8 Flash, and scored against the same two flagship markers:

| On the hard third only | Same kind as both markers |
|---|---|
| Jev | 69.4% |
| Gemini 3.8 Flash | 96.8% |

| The whole pipeline, all mentions | Same kind | Sage or not |
|---|---|---|
| Jev alone | 89.5% | 95.1% |
| **Jev where 0.9 sure, otherwise Gemini Flash** | **98.4%** | **99.5%** |
| Gemini Flash alone | 98.9% | 99.5% |

Gemini Flash alone does as well, and would cost about $13 for all 55,000
mentions. The two tiers cost about $5: a little over $1 for Jev on everything
and about $4 for Gemini on the hard third. Jev is kept for a second reason
besides price. It returns a probability for every option, which is what the
study is ultimately after, and on the mentions it is sure of that spread is
trustworthy.

A third candidate, DeepSeek V4 Pro, was stopped partway: slow, and with its
thinking counted, about a third of the flagship price for no gain.

One caution belongs here. All five models are language models that have read
much of the same material. Their agreeing with each other is good evidence on a
reading task, and it is not the same as a person who has learned the page.


## Cost

About 1.6 cents a passage for both markers at list price. The full sets, about
800 items, come to roughly $13. The provider's batch endpoint halves that. The
marker script takes a hard dollar cap and stops when the provider's own
reported spend reaches it.
