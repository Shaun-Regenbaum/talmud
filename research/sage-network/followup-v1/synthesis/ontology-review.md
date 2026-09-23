# What the follow-up cases change in the ontology

Provisional. Nothing here approves a historical person merge, identity, date or
graph edge. Full references, hashes and the per-rule evidence lists are in
[ontology-review.json](ontology-review.json).

## What was read

- The ontology (`plan/relationship-ontology.md`), the pilot contract, schema,
  reader and reviewer instructions, and four pilot outputs.
- All eleven completed follow-up cases: challenge-09, challenge-11,
  challenge-30, original-08, random-bavli-02, random-bavli-03 and
  random-yerushalmi-01 to 05. For each: dossier, reading, separate review,
  earlier review and mechanical corrections.
- Thirteen saved source files, to check quotations that conclusions rest on.
  All thirteen checks matched (see `quote_spot_checks` in the JSON).

Every completion record matches its current files, and every separate review
names the current dossier hash. Six reviews appeared while this review was
running; all were read. random-bavli-05 and random-yerushalmi-06 were still in
progress and were not used.

**No manuscript was inspected directly in any of the eleven cases.** Every
manuscript reading below is reported by an editor or commentator.

## The main lessons

1. **Most errors were omissions, not inventions.** Missed repeated names, lost
   legal conditions, missing first opinions. Mechanical counting would have
   caught many of them (random-bavli-03 F01; random-yerushalmi-03 F1, F4;
   random-yerushalmi-04 F1, F14).
2. **The dossiers sometimes swung too far the other way.** Two proposed
   deleting parents named inside names (challenge-09, random-yerushalmi-02).
   One turned "had he not heard?" into "never met" (original-08). The separate
   reviews caught all three. I agree with the reviews.
3. **Evidence types were mixed together.** Printed text, reported manuscript
   readings, later quotations, emendations, translations and commentary were
   often listed as if they were the same kind of support.
4. **Dependent sources were at risk of being counted as votes.** Examples: the
   Davidson English with the Steinsaltz Hebrew, and Guggenheimer's Hebrew with
   his English. Guggenheimer's Ketubot English even reuses his Yevamot rendering
   (random-yerushalmi-05 F18).

## Nineteen rules

Each rule's full evidence and counterexamples are in the JSON.

| # | Rule | Main evidence | Counterexample or limit |
|---|---|---|---|
| R01 | **Keep the parent named inside a name.** Every "bar/ben X" gives a local parent and a `child_of` claim with basis `name_internal`, even if the parent never acts. Scope it to the branch with that name form. Never merge two parents by name. | challenge-09 review [0]; random-yerushalmi-02 review [2]; original-08 F13; random-yerushalmi-04 F12 | Bar Qappara (original-08 F13) may be a fixed name. That calls for an extra branch, not deletion |
| R02 | **Keep printed and corrected kinship side by side.** Build paths with unnamed links (child of an unnamed father who is Hoshaya's brother). Show "nephew" as a derived label. A conflict between branches depends on an identity choice, so store it as conditional. | random-yerushalmi-01 F3, F5, F6 and review [0]-[1]; checked quotes in Taanit, Megillah and Shabbat | Brothers who divide an estate are legal roles (random-yerushalmi-04 F14) |
| R03 | **Give women and household members their own entity.** Add `member_of_household`. Naming a household does not put its head in the scene. Say who supplies a family link: text, commentary, translator or Bible. | challenge-30 F11 and earlier review; random-yerushalmi-02 f19; challenge-09 F13 | The similar maidservant in the Yerushalmi is not merged, and not declared unrelated either (challenge-30 review [2]) |
| R04 | **Keep speaker, addressee, target and content apart.** Only fill addressee when the text marks it. | challenge-30 F1-F3 (base "אמרה", variant "אמרה ליה"); random-yerushalmi-04 F7; random-bavli-03 F12 | A third-person ban formula can still be said face to face (challenge-30 F3) |
| R05 | **Type the voice.** Anonymous discussion, unattributed first opinion, named speaker, nested quote, later author. "The one who says X" points to a position's owner. "What does X do with it?" is the discussion speaking for X. | random-bavli-02 F1-F2; random-yerushalmi-03 F7; random-bavli-03 F03; challenge-09 F2-F4 | Context can still supply an unnamed object (challenge-11 f3) |
| R06 | **Keep negation, unsaid words, "only" rules and rhetoric in the content.** Unsaid words are evidence, not an utterance. "Had he not heard?" makes no contact edge either way. | challenge-11 f1 and review [0]; original-08 review [0]; random-yerushalmi-05 F1, F16-F17; random-yerushalmi-04 F15 | original-08's own "explicit non-contact" lesson (rejected) |
| R07 | **Say how a teacher link is known.** It can be self-described, argued in the text, or come from a later author. "In the name of" never becomes `student_of`. | random-yerushalmi-05 F6-F8 (checked: teacher word in one Ketubot version only); challenge-11 f2, f4, f11; original-08 F14 | The teacher word may have been added by analogy (random-yerushalmi-05 F8) |
| R08 | **Store direction once and derive inverses.** "Y heard from X" and "X told Y" are one observation. | random-yerushalmi-05 review [1] (fixes the direction in F6); random-yerushalmi-03 F14 | One teaching named three times is one edge (random-bavli-03 F04) |
| R09 | **Label every wording by evidence type.** Printed; manuscript reported by someone; corrector; later quotation; emendation with grounds; translation; commentary; lexicon; our own inference. Never overwrite the printed text. | challenge-09 F5-F6, F14; original-08 F6; challenge-11 f6-f7; challenge-30 F2, F6; random-bavli-02 F8; random-yerushalmi-04 F11, F13 | challenge-09 F8 is the dossier's own guess, so it is labelled as project inference |
| R10 | **List who holds a reading. Do not count dependent sources as votes.** Record dependence as known, suspected or unknown. | challenge-09 review [2]; challenge-11 f14; random-yerushalmi-05 F18; random-yerushalmi-01 F11 | random-yerushalmi-04 says all editions "derive from Venice". Other cases show Leiden and Rome reports, so mark this "suspected" |
| R11 | **Link parallel tellings, but do not import their people.** A parallel can support a wording. It cannot fill a speaker or add a participant. | random-yerushalmi-01 F5 (the Megillah scene has the same wording but a different speaker and passer-by); random-yerushalmi-03 review [3]; random-bavli-03 review [3] | The extra Shmuel line in Yevamot is a variant of one ruling (random-yerushalmi-05 F5) |
| R12 | **Source alternatives are not historical exclusivity.** Keep five branch kinds: reported alternative, witness variant, emendation, interpretation, segmentation. Allow nesting and requires/excludes links. | challenge-09 review [1]; random-bavli-03 A3; original-08 F4-F5, F8; random-yerushalmi-01 F11 | Some exclusions are real, but only under an identity choice (random-yerushalmi-01 review [1]) |
| R13 | **A reading must not prove its own assumption.** An emendation made on chronological grounds cannot support that chronology. | random-yerushalmi-04 F11 (Mana to Ami); original-08 review [1] | The nephew correction rests on parallels and a lexicon, not chronology |
| R14 | **Separate legal roles from people, and keep the whole rule.** Add `legal_role`. Rules keep condition, outcome, count and scope. Check each anchor against the word that governs it. | random-yerushalmi-02 f01 (wrong occurrence joined a category to a story person); random-yerushalmi-04 F14-F15; random-yerushalmi-03 F4 | A story person may fill a legal role, but only as attributed interpretation (random-yerushalmi-02 f08) |
| R15 | **Tag what a story does in a legal argument.** Precedent, proof, illustration, precedent inside someone's view, or personal practice. Legal force belongs to the voice that states it. | challenge-30 F4, F8-F9; challenge-11 f2; random-yerushalmi-02 f05; random-yerushalmi-03 F11 | One "mixed" tag for challenge-30 hides which part carries the force |
| R16 | **Keep time claims with their voice and kind.** Habitual, remembered, duration, order, undated, or time anchor. Generation labels go to identity packs. No calendar dates. | random-yerushalmi-05 F6; random-yerushalmi-01 PC9, F15, F17; challenge-30 F4; challenge-11 f9 | Whether a cited exchange is the nearby visit is itself a sourced link (challenge-11 f9) |
| R17 | **Count every occurrence mechanically, then read it.** Say whether counts are exact or skeleton-based. One mention per occurrence. Expand abbreviations only with a reason. | random-bavli-03 F01 and review [1]; random-yerushalmi-02 mechanical corrections; random-bavli-02 F11 | Two records for one occurrence (random-yerushalmi-04 earlier review) |
| R18 | **Confidence without invented numbers.** Use high/medium/low with basis, holders and dependency. Old pair scores are legacy only. | original-08: a 0.93 "cites" row rested on a word a commentator supplied; random-yerushalmi-01 lessons on hedges | Commentary agreement may be "high", but its basis must say commentary |
| R19 | **Build an evidence pack before any identity decision.** "Cannot tell" is a valid answer. A line in the Talmud saying "it was not X but Y" is a source claim, not a decision. | challenge-11 review [3]; challenge-09 F7 (Yevamot 45b); original-08 F4-F7; random-yerushalmi-05 review [3]; random-yerushalmi-02 f09, f22 | The sugya itself treats two Rebbi baraitot as one person's; that stays local (random-bavli-02 F4) |

## Concrete changes

Contract (new version, not the frozen pilot):

- **Entity kinds:** add `legal_role` and `household`.
- **Voice kind:** anonymous discussion, unattributed opinion, named speaker,
  nested quote, later author.
- **Basis:** explicit, name_internal, local_coreference, argued_in_text,
  self_described, commentary, translation, project_inference.
- **Speech roles:** speaker, addressee (may be empty), audience, target, content.
- **Statements:** condition, outcome, count, scope (only / except), mood (plain,
  question, rhetorical), function. Each may vary by branch.
- **Only two new predicates:** `member_of_household` and `cites_statement`
  (statement to statement, with a role such as proof, objection or precedent).
  Other uncommon actions stay events with the source verb.
- **Branches:** each branch records its evidence type, holders, grounds, parent
  branch, and requires/excludes links. Historical compatibility is a separate
  field and defaults to unknown.
- **Sources:** editorial project, what it derives from, and dependency status.
- **Constraints:** "exactly one within this reading", or "incompatible if this
  identity holds". A constraint never deletes a branch.
- **Cross-passage records:** parallel tellings, and identity statements made
  inside the text.
- **Time kinds:** as in R16.

Validator: occurrence counts; parent present for every patronymic; no inverse
duplicates; evidence type and holders on every branch; grounds on every
emendation; no numeric confidence; a parent's branch matches its name's branch.

Reader: two passes. Pass A reads the base text and wider context. Pass B adds
translations, commentaries and parallels as typed branches for flagged items
only. Pass B never overwrites Pass A. Grow the context automatically when the
text points back ("what is it?", a position label, an unresolved pronoun).

Graph view: the default view may hide parents who do not act, legal roles and
later voices, but the data keeps them. Derived labels such as "nephew" show
their path and the branch they depend on.

## Where I disagree with earlier proposals

- **Dropping parents inside names** (challenge-09, random-yerushalmi-02
  dossiers). I disagree, as the reviews do.
- **The printed "brother" marked rejected** (random-yerushalmi-01 F6). It is a
  printed branch. I also disagree mildly with that review's "prefer nephew". A
  preference is a decision revision, not a property of the data.
- **"Explicit non-contact"** (original-08). I disagree, as the review does.
- **"No evidence about either person" for parallel tellings** (challenge-30,
  random-bavli-03, random-yerushalmi-02). The claim is too strong. Keep a link
  for later packs.
- **Heard-from direction** (random-yerushalmi-05 F6). Wrong direction; the
  review is right.
- **"All editions derive from Venice"** (random-yerushalmi-04). Its review did
  not address this. It is not shown by the saved cases. Mark the dependence
  suspected.
- **New one-off predicates** (recites_before, instructs_to_recite,
  cites_precedent, illustrated_by, answered_by, harmonises, and several
  story verbs). Too many terms for too few cases. Use events, plus one
  `cites_statement`.
- **The pilot's `basis: explicit` for patronymic parents.** Change it to
  `name_internal`, and scope the parent to its branch.
- **An earlier review's pass is not final.** random-yerushalmi-01's attribution
  check passed first and was reversed after wider reading (F19).

## Still open

- Manuscripts were not inspected. The base texts of the Guggenheimer Hebrew,
  the Venice print and the Mechon-Mamre text, and how they depend on each
  other, were not checked.
- What evidence allows a patronymic to be read as a fixed name.
- When a parallel may support "same event", not just "same wording".
- `member_of_household` rests on two cases.
- How far automatic context growth should go.
- The eleven cases are now tuning material. Only held-out cases can test these
  rules.

## Next extraction pilot (real cases only)

**Regression set (tuning):** the eleven researched cases. Write expected checks
from their dossiers and reviews. A new recipe must pass them. Passing shows only
that the recipe can represent these cases.

**Held-out named cases:** original-01, original-02, original-03, original-05,
original-06, original-07, original-09, challenge-01, challenge-05, challenge-08,
challenge-20, challenge-25, challenge-27, challenge-28, random-bavli-01,
random-bavli-04 and random-bavli-06. The JSON lists which rules each one tests.

**Held-out fresh random draw:** six Bavli and six Yerushalmi passage versions
from lake snapshot 2, drawn by the seeded SHA256 method in `pilot/README.md`.
Exclude all 42 pilot passages and all queue cases. Record the seed and the
exclusions before reading. This is needed because the Yerushalmi random cases
are now tuning cases.

Report failures rule by rule, with case IDs and source words. Make no accuracy
claim from these small sets.

## Next steps, in order

1. Have a person review these proposals, especially R01, R02, R09, R10 and the
   two new predicates.
2. Write contract v2 and its validator in a new directory.
3. Turn the eleven cases into regression checks.
4. Record the fresh random draw before reading anything.
5. Run Pass A, then Pass B, on the held-out set.
6. Have the results reviewed separately, rule by rule.
7. Only then open identity packs. Start with Yirmiya bar Abba (challenge-11),
   Yosi bar Hanina or bar Zevida (challenge-09), and Rav Hoshaya
   (random-yerushalmi-01).
8. Add biographies and dates last, as sourced claims.
