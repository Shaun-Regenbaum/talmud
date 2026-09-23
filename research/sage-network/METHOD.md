# How source claims become graph decisions

The [current plan](plan/relationship-ontology.md) and [visual review](plan/relationship-ontology.html) replace the early rules that turned nearby-name labels into person chronology. The old scripts and saved labels remain available so the earlier run can be reproduced. They are not the contract for the next reader.

## What we are trying to establish

Which mentions refer to the same historical person? What family, teaching, conversation and story relationships does each passage report? Which of those reports support a historical graph after other evidence is considered?

A mention is observable text. A historical identity is a decision supported by evidence. Keep the exact source, local participant, reading alternatives and proposed person separate.

## Read the claim before judging the history

A passage can explicitly state a family relation, depict a meeting or transmit a teaching. Record that statement faithfully. Keep its speaker, quotation level, polarity, modality and later treatment in the discussion.

Historical acceptance is a separate decision. A reported conversation is evidence to weigh, even when we cannot establish that it occurred. Neither discarding stories nor accepting all of them as literal history is an adequate method.

Named translations and commentaries are useful evidence about how to read a passage. Preserve their additions and different identity choices. The source Hebrew remains available beside them.

## Relations do not all imply the same kind of time

| Wording or relation | What to save | What it does not establish by itself |
|---|---|---|
| X reports in Y's name | The attributed teaching and transmission claim | Direct hearing, a meeting, teacher status, birth or death order |
| X is a child of Y | The stated family role and exact relational words | A shared lifetime or a resolved historical identity |
| X is a student, nephew or in-law of Y | The specific role, subtype and time scope when stated | Which person was born first |
| X sits before Y | The scene and roles supported by its wording | An age order or a real historical lesson |
| X asks or objects | Speaker, addressee and target statement | A lasting disagreement or co-presence with the author of a quoted view |
| Some say X, others Y | The source's alternate reports and their scope | Same person, contemporaneity or historical exclusivity |
| X and Y occur together | Separate mentions and possible local reference links | A hard rule that they must be different historical people |
| Two witnesses differ at one location | Aligned variant readings and their source versions | Automatic identity equivalence |

An explicit time claim must name the thing it orders: birth, death, teaching, meeting, composition or attestation. A date inferred using an edge cannot count as independent support for that edge.

## Identity contradictions have several possible causes

If a proposed person cannot fit the evidence, inspect the source spans, mention boundaries, direction, pronouns, alternate branches, quotation scope and assumed dates. A shared name may refer to several people. It may also have been extracted or read incorrectly.

Co-occurrence and verb position can be useful features. Early observations on a few names are not universal rules. Check them on held-out mentions, accounting for repeated people, editions, quotation levels and genres, before assigning calibrated weights.

A mention that stands alone is unresolved by the current pair method. That is not proof it can never be resolved. Another passage, a title, place, pronoun, variant or outside source may later help.

## Evidence packs keep decisions inspectable

Each pack asks a clear question about a claim, identity or connected set of choices. It keeps support, opposition, source dependencies, search gaps and a written reason. Decisions are versioned and may remain tentative or unknown.

Separate provisional reading scores from identity and historical confidence. Keep compatible claims together and preserve source alternatives. A translator's explanation and the passage it explains do not create two independent witnesses.

Human corrections outrank generated output. New source readings and graph decisions must not overwrite those corrections.

## Earlier checks and known faults

The notes below record findings from the earlier name and pair readers. Their small checks and reported performance are historical observations, not validation of the revised passage-level contract. The new challenge review is also selected for failures; it is not an error-rate estimate.



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
  on the held-out set every reversed pair was one it was unsure of, but this does not validate a universal direction rule. The next reader must
  record argument roles explicitly even for confident classifications.
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
