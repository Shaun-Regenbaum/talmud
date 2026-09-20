# Method, and what is wrong with it

## The question

Given the mentions of names in the rabbinic corpus, how many distinct people
generated them, and for which mentions can we tell who is meant?

A person is not observable. Only names are. The map between them runs both
ways: one name covers several men (homonyms), and one man wears several names
(spellings, titles, short and full forms). So this is an entity-resolution
problem, and the honest output is a probability per candidate, plus an explicit
"cannot be told from the text" for the mentions that carry no evidence.

## The rule we keep having to relearn

The Talmud is an edited literary work. No phrase in it is a fact about
history. Three examples that cost us real errors:

- **"X said to Y"** does not establish that X and Y met. The redactor stages
  conversations between people separated by centuries.
- **"and some say"** (`ואיתימא`) is a comment on where a *teaching* comes from,
  not a statement that two men are confusable. It says the teaching could
  plausibly belong to either.
- **"X turned up at Y's house"** is a story, and the Talmud tells stories that
  could not have happened. It is worth collecting and it is not proof.

- **Two editions printing different names at one spot** does not show that the
  two spellings are one name. Editors opened up abbreviations and corrected
  names, and they often differ precisely because they disagreed about who was
  meant. A variant marks a spot where the identity was open. It is a flag to
  collect, and a ready-made hard test, not a merge.

So no relation may be read for its literal meaning, and no edition may be read
as a neutral witness. Each is a signal whose weight has to be earned by how it
behaves across the corpus.

## What counts as evidence

Only relations that survive that test may order two names:

| Relation | Weight | Why |
|---|---|---|
| X in the name of Y | strong | a chain of transmission runs one way in time |
| X son of Y | strong | a generation, and an identity fact about the name |
| X sat before Y | strong | learning runs one way |
| "X says" against "said X" | strong, per mention | early teachers are introduced with the participle after the name, later sages with the verb first. Measured on 176 names with one entry and a recorded era: 94% agreement, and never a later sage read as early. All 11 misses are a name shared by an early and a late man, so the signal sorts the single mentions of a shared name |
| the tradition splits between X and Y | medium | both were plausible authors, so they are near in role and time |
| X and Y in one story | medium | collectable, not proof |
| X objects to Y | medium | X is at or after Y |
| X rules like Y | weak | doctrinal, not chronological |
| X says to Y | weak | staged dialogue |
| same sentence, nothing stated | none | company, for clustering only |

## Two rules that do most of the work

**Appearing together means being different people.** Two names in one sentence
are, almost always, two men. Tested on four pairs known to be one man under two
spellings and four pairs known to be two men: the same-man pairs co-occur 0.0%
of the time, the different-man pairs 11% to 32%. Rabbi Zeira and its fuller
spelling never once share a segment across 601 mentions. This is free and it is
the strongest merge test available.

**A name that cannot hold one position covers more than one man.** Order the
names by the strong relations. If one name's evidence forces it into two places
at once, that name is not one person. Run blind, this surfaced exactly the
names a student would name as the hard ones.

## Where this cannot work

Measured over the Bavli: 58% of mentions share a segment with another name,
36% sit alone but with a relation word present, and 7% sit alone with nothing.
That last group cannot be resolved from the text by any method. Separately,
about 1,450 names appear exactly once, and a single observation cannot be
clustered. For both groups the only routes are an outside record or an honest
"unknown".

## Known faults

- **Tests exist now, and were late.** Every fault below was first found by
  reading output. A hand audit of 40 extracted relations found 5 wrong, 4 of
  them from one repair that cut any name whose given name begins with a prefix
  letter, so Rabbi Meir became "Rabbi". Each fault is now a test in `tests/`,
  run in CI.
- **Finding names, scored against two frontier models.** On 56 passages the
  finder had never seen, it found 98 of the 99 names both markers gave, drew
  the edge the same way on 95, and reported 2 that neither gave. Whether a word
  is a given name is learned two ways: it mostly sits right after a title, or,
  for names that are also ordinary words (יוסף, מנא), the title-and-word pair
  acts as a speaker. Descriptions (הגלילי), places of origin (איש הוצל) and
  father bynames (בן הקנה) are learned the same way, not listed.
- **A random sample cannot find a rare, systematic hole.** The check above said
  98 of 99, and the finder had never once found ריש לקיש, an anchor named 1,155
  times: the sampled passages happened not to contain him. `18_anchor_recall.py`
  now counts 36 fixed-string names in the raw text against what the finder
  reports, with no model and no sample, and runs after every finder change.
- **Still missed:** a name with no title and no father (חילפיי), a description
  with no ה (קרתיגנא), a rare spelling of a given name (ר' יבא).
- **One man still cut in two.** The stronger reader flags a pair as "one name"
  when the finder has split a man. From its first 2,280 pairs: "the Great" after
  a name (רבי חייא רבה is R. Hiyya the Great, not R. Hiyya and Rabbah); `ב"ר` as
  "son of Rabbi" (ר' אלעזר ב"ר שמעון); a father written as a short form (רבה בר
  ר"נ); a short form followed by בר"ש; a description between the name and the
  father (ר' יהודה הלוי בר' שלום, ר' בא חסידא בר ר' זעירא); a given name that is
  also a Bible name after a title (רב דניאל בר קטינא); and אבוה דשמואל,
  "Shmuel's father", which is a man's standing name. None is fixed yet.
- **Groups are not found at all.** רבנן (6,278 times), חכמים אומרים (1,383),
  אחרים, תנא קמא. They matter for disputes of the form "A ורבנן".
- **Short forms are reported, not opened up.** ר"י can be five rabbis. An
  edition that spells it out has chosen one. The finder reports the short form
  and leaves the choice to a later, checkable stage.
- Bare רב is also the ordinary word for "much". Each bare mention is flagged.
- **What stands between two names is judged pair by pair, in its passage**, not
  by pattern: the same words mean different things in different passages. The
  cheap model is trusted only where it is 0.9 sure (28% of pairs, 32 of 32 on a
  held-out set). It never answers "nothing links them" and is weak on "explains"
  and "the same man twice". The rest is read by a stronger reader in batches that
  each carry hidden test pairs (117 of 120 right so far). `CHECKSETS.md` has it.
- **Direction.** The kinds are worded "A does something to B", but among the
  pairs the stronger reader has read, the second man acts on the first in almost
  one in five. The reader records a direction. The cheap model was never asked;
  on the held-out set every reversed pair was one it was unsure of, so its
  confident answers can be read as A acting on B.
- The vocabulary has a long tail. Roughly 10,000 distinct phrases join two
  names; the few hundred commonest cover about half the instances.
- Name detection produces junk. Hebrew prefix letters glued to ordinary words
  can be mistaken for a title: "unpaid guardian" and "paid guardian" were once
  read as two sages. A filter step has to classify each candidate as a person
  or not.
- The Land of Israel and Babylonia ran in parallel. Treating the eras as one
  number line will manufacture contradictions that are artefacts.
- The order produced is relative, not absolute. Naming a generation needs
  anchoring, which is not done here.
