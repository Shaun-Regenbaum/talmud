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

So no relation may be read for its literal meaning. Each is a signal whose
weight has to be earned by how it behaves across the corpus.

## What counts as evidence

Only relations that survive that test may order two names:

| Relation | Weight | Why |
|---|---|---|
| X in the name of Y | strong | a chain of transmission runs one way in time |
| X son of Y | strong | a generation, and an identity fact about the name |
| X sat before Y | strong | learning runs one way |
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

- Relation coverage is partial. Counting the words between two names misses any
  relation whose verb comes first, and `איתיביה X לY` is that shape.
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
