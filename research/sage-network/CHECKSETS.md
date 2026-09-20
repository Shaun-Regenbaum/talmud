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


## The full typing run, and the hole the check sets could not see

Both passes were run over the whole text on 20 September 2026: 52,423 mentions
needing a judgement, one edition per work.

| | Mentions | Share |
|---|---|---|
| Cheap model, sure (0.9 and above) | 40,222 | 76.7% |
| Asked again of Gemini Flash | 11,957 | 22.8% |
| No second answer yet | 244 | 0.5% |

It cost $1.22 for the cheap model on everything and $3.34 for Gemini Flash on the
rest. The cheap model was sure of 77% of the text, more than the 69% in the check
set, because the check set over-samples hard cases on purpose.

The second model overturned the first 3,417 times, mostly "sage" to "ordinary
word". Forty of those were drawn at random and read by hand. Thirty-nine were
right: a student saying רבי, "my teacher", to someone; רבה as "gave much"; כרבי
as "they plough". The one miss was an honorific, ר' תנחומא בי ר', called a sage.

What the typing settled that the finder could not: הרבה was reported as the sage
Rabbah 1,940 times, and all 1,540 cases the cheap model was sure of were the word
"much". A personal name never takes "the", so the finder no longer peels a ה off
a name. מרבה stays, because after "asked of" (בעא מיניה אביי מרבה) it is the man.

### A random sample cannot find a rare, systematic hole

The name check sets said the finder found 98 of 99 names. It had never once found
ריש לקיש, who is one of the fourteen anchors and is named 1,155 times. The 84
sampled passages happened not to contain him. The same was true of מר בר רב אשי,
another anchor: none of 91.

So there is now a second check, which needs no model and no sample
(`18_anchor_recall.py`). For 36 names that are one fixed string, it counts the
string in the raw text and the mentions the finder reported. Before the fix five
of the 36 were holes. After it, every name is found at least 99% of the time,
bar חזקיה, where the text count is a false ceiling because half the hits are the
king of Judah. This check runs after every change to the finder.

Reading the commonest joining patterns by hand found more of the same family:
ר"ש בן יוחי cut into two people, רבי אבא read as Rebbi plus a stray word (839
mentions), a father known by one name (בריה דרבא) dropped, בר"ש not read as "son
of R. Shimon", and a bare name only accepted after אמר, which missed בשם חזקיה and
תני חזקיה. Each has a test.

## What stands between two names

### Judging the pattern was the wrong unit

The first attempt labelled joining patterns, since 156 of them cover half of all
pairs. Two markers labelled the 150 commonest. They agreed on only 77% (91%
weighted by pairs). Where they split, the pattern was the problem. ד[A] אמר [B] is
"of R. Elazar, for R. Elazar said" in one passage, the same man twice, and "of Rav
Yehuda, who said in Rav's name" in the next, a citation. Only the names and the
words that follow settle it. So the unit is now one pair in its passage.

### The pair check set: 120 pairs (development)

Drawn from the text with a fixed seed: 40 from the 50 commonest patterns, 40 from
the rest of the top 2,000, and 40 from the long tail outside it. The tail joins
three pairs in ten, and no pattern list reaches it.

The second marker changed. Fable marked the patterns but its provider
refused the pair request outright, citing terms against duplicating model outputs.
That is their decision to make, so the request was not reworded. Gemini 3.1 Pro
took its place. It shares a lab with Gemini Flash, one of the models being scored,
which may flatter Flash a little. Reading the disagreements by hand, Astra was
right or defensible in about 22 of 31 and Gemini Pro in about 8, so the second
marker is the weaker of the two.

The first round (kept under `checkset/superseded/`) found three faults in the
kinds themselves, not in the models:

- **Kinds overlap.** מתני ליה רבי לרבן שמעון בריה is both "speaks to" and "his
  son". The rule is now that the label saying who the men are wins.
- **Two kinds were missing.** ר"ע רבו של אביו states a teacher outright, and there
  was no box for it. And the Yerushalmi's bare lists (ר' יונה ר' בא ר' חייה בשם
  ר' יוחנן) may be a chain of tradents or a plain list. Scholars split on it, so
  the label is "side by side, the wording does not say".
- **"Does not hold like" is a dispute**, not a following.

| | Round one | After the kinds were fixed |
|---|---|---|
| The two markers agree on the kind | 74% | 82% |
| They agree on what the kind is used for | 78% | 85% |
| Cheap model, against pairs the markers agree on | 84% | 82% |
| Gemini Flash, same | 96% | 91% |
| Cheap model where its confidence is 0.7 or more | 57 of 58 | 52 of 53 |
| Cheap model below 0.7 | 18 of 31 | 28 of 45 |

Two things follow. The cheap model's confidence is again honest, so the same two
tiers apply: keep its answer at 0.7 and above, ask Gemini Flash below. And about
one pair in six is a place where two frontier models read the passage differently.
For those the output has to stay a spread of odds, not a forced label. The cheap
model returns odds over every kind, and the full run keeps them.

**These are development numbers.** The kinds were tuned on these same 120 pairs. A
fresh draw, marked once and never looked at while changing anything, is still owed.


## The held-out pair set: 150 pairs, marked once

Drawn with a new seed, excluding every development pair. Marked by Astra through
the API and by Fable reading all 150 in one sitting, shuffled, with no stratum
shown and no other answer seen. Nothing was tuned on it.

| | Development (120) | Held out (150) |
|---|---|---|
| The two markers agree on the kind | 82% | **91%** |
| Cheap model against pairs the markers agree on | 82% | **68%** |
| Cheap model at 0.9 confidence and above | 35 of 35 | 32 of 32 |
| Cheap model from 0.7 to 0.9 | 17 of 18 | 27 of 34 |
| Cheap model below 0.7 | 28 of 45 | 34 of 71 |

The development numbers flattered the cheap model, as warned. The line above
which its answer can stand is 0.9, not 0.7. Across the whole text that is 28% of
pairs.

Its mistakes cluster. By true kind it gets: citations 34 of 36, "speaks to" 9 of
9, disputes 25 of 30, but "nothing links them" **0 of 17**, "same man twice" 9 of
18, and "explains" 5 of 13. It always finds a link. A yes/no question ("does the
wording tie A to B at all?") was tried on the development set and was right only
half the time it said no, so it was dropped.

One free rule does work. When both names are the same string, the pair was the
same man 14 times in 15 (the exception is an amora and a tanna who share a name).
That settles 4,924 pairs, 9% of the text.

In all 13 marker disagreements Astra said "nothing links them" where Fable saw a
link, usually one stated a clause later. Astra is the stricter reader.

### Direction is missing from the kinds

Marking by hand showed it. In דברי ר' יוסי ... א"ר יונה לא טמא ר' יוסי אלא... the
second man explains the first. Every kind is worded "A does something to B", so a
reader who picks "explains" has said the opposite of what the page says, and the
order inferred from it flips. The held-out marks record a direction (AB or BA),
and the stronger reader is asked for it. The cheap model's full run does not have
it yet.

### What is left is read by a stronger reader, checked batch by batch

36,571 pairs are neither the same string nor 0.9 sure. The weekly cap on the API
key could not pay for them, so they are read in batches of 400 by Fable in working
sessions. Each batch hides 20 held-out pairs. A batch is merged only if its reader
matches the markers on at least 80% of them (`21_reader_merge.py`), so every
merged batch carries its own measured score.


## Cost

About 1.6 cents a passage for both markers at list price. The full sets, about
800 items, come to roughly $13. The provider's batch endpoint halves that. The
marker script takes a hard dollar cap and stops when the provider's own
reported spend reaches it.
