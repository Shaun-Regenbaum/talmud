# How we should build the sage graph

A passage may name a woman through her husband, quote an earlier teaching, or give two versions of a conversation. We need to save all those claims before deciding which people and events they describe.

The proposed order is: **source text → mentions and claims → evidence packs → reviewed decisions → graph views**. An edge in the graph must lead back to its evidence and the reason for drawing it.

## The first passage pilot is built

The [pilot report](../pilot/report.html) shows 42 independently reviewed episodes:
30 difficult cases and 12 randomly chosen passage versions. They produced 602
candidate claims, 25 alternative groups and four evidence packs. Twenty-three
readings ask for more context. These counts describe the saved output, not
complete coverage or historical accuracy.

Twelve episodes have a missed check or major finding. The main problems are
missing details in longer legal discussions, an uncertain quoted speaker treated
as settled, and a person attached to the wrong occurrence of matching words.
Repeated names and pronouns are not yet exhaustively recorded.

The pilot pointed to these fixes for the next reader. The closer reading below adds to them, and [the last section](#what-happens-next) gives the current order of work.

1. Inventory every mention occurrence and resolve each or explicitly leave it open.
2. Give quoted statements their own speaker, modality and quotation boundary.
3. Check every legal alternative and condition so a long passage is not reduced
   to a generic action. Preserve unnamed people and groups without inventing counts.
4. Expand missing context. Keep first readings and save corrections as new revisions.
5. Freeze the revised recipe and run a larger blind source check. Then build
   identity packs across passages, add biographies and eventually infer dates.

The four pilot packs keep narrow textual decisions, reasons and alternatives.
They do not approve historical person merges. Each decision remains excluded
from the historical graph. Production reader recipes and cache keys are unchanged.

## What the closer reading of each passage found

After the pilot we went back and read 38 passages closely. We started with
the twelve the pilot got wrong, then your original examples, then more of the
difficult cases. For each one, a reader pulled the surrounding text, translations
and commentaries, and saved every source it used. A second reader then checked the
first reader's conclusions against those saved sources. The
[follow-up report](../followup-v1/report.html) shows every case, with switchable
diagrams for the hardest ones.

The 38 readings hold 572 proposed findings. All 2,231 of their quotations match
the saved source files. Second readers checked 37 of them. They asked for changes
on 28 and accepted the other 9 with narrower wording. None was accepted as it
stood. The reviews made 281 decisions. The most common was narrowing a claim
that went further than its source (85 times). Next came confirming a correction
the first reader had proposed (52), adding a claim the first reader missed (24),
and keeping two kinds of evidence apart, such as a translation and the text it
translates (21).

The run stopped when the account hit its usage limit on 23 September 2026.
Three more readers had fetched sources but saved no findings, so they are left
out. The review of Ketubot 65a:9 was also cut off, so that reading has no second
check yet. Eleven queued passages were never started.

What we learned:

1. **Most mistakes were things left out, not things made up.** Readers missed
   repeated names, dropped the conditions of a legal rule and skipped a first
   opinion. Counting every occurrence of a name mechanically would have caught
   many of these.
2. **When readers corrected themselves, they sometimes went too far.** Two
   proposed deleting a father named inside a name, like the "Hama" in "Rami bar
   Hama". One turned "had he not heard this?" into "they never met". The second
   readers caught all three.
3. **The English translation often says more than the Aramaic.** In the Davidson
   English on Sefaria, bold words translate the text. Plain words are the editor's
   explanation. In [Bava Batra 12b](https://www.sefaria.org/Bava_Batra.12b.6),
   "and this is what happened; first she married Rami bar Hama" is plain text. So
   is "her husband" in Ketubot 85a. In Gittin 49b, two of Mar Zutra's "mentions"
   exist only in the English. Three separate cases found this. The reader must
   keep the bold marks when it saves a source, and treat plain words as commentary.
4. **Sources from the same editor are one reading, not two votes.** The Davidson
   English and the Steinsaltz Hebrew come from one project. So do Guggenheimer's
   Hebrew and English.
5. **Printed text, manuscripts, corrections, translations and commentary are
   different kinds of evidence.** Readers often listed them together. A scholar's
   proposed correction never replaces the printed words.
6. **A later quotation can change a name, and so the father inside it.** The
   visitor at Rava's house in Pesachim 103a is "son of Yehuda" in the printed text,
   "berabbi Yehuda" in the Rif and "son of Rav Yehoshua" in the Rosh. Each form
   keeps its own parent, tied to its source.

## The rules we now propose

A reader who had not written any of the cases read the first eleven and proposed
nineteen rules. The full list, with the evidence and counterexamples for each, is
in the [ontology review](../followup-v1/synthesis/ontology-review.md). These are
the ones that change the most:

| Rule | Example |
|---|---|
| Keep the father named inside a name, even if he never acts | Mar Zutra son of Rav Nachman keeps Rav Nachman as his father (Gittin 50a) |
| Keep the printed and the corrected family link side by side | Hananya is Hoshaya's brother in print and his nephew in a correction (Yerushalmi Taanit) |
| Give women and household members their own entry | Rav Hisda's daughter; the wife and daughter in Yerushalmi Bava Kamma 9:7 |
| Keep speaker, addressee, target and content apart | The maidservant's ban targets a father. Only some versions say whom she spoke to (Moed Katan 17a) |
| Say whose voice it is | "What does X do with it?" is the discussion speaking for X, not X speaking (Nazir 43a) |
| Keep negations, unsaid words and "only" rules in the content | The text notes that Yirmiya did not ask "Has the Master separated?" That unsaid wording is evidence about the two men, not a speech link (Berakhot 27b) |
| Say how a teacher link is known | "In the name of" never becomes "student of" |
| Label each wording by kind of evidence | Printed, manuscript, later quotation, correction, translation, commentary, our own inference |
| List who holds a reading, and do not count shared-editor sources twice | Davidson English plus Steinsaltz Hebrew count once |
| A reading must not prove its own assumption | A correction made because of dates cannot then support those dates |
| Separate legal roles from people | The orphans' father in a lending rule is not Mar Zutra's father (Gittin 50a) |
| Count every occurrence first, then read each one | Repeated names were the most common miss |
| No invented confidence numbers | High, medium or low, with the reason |

Only two new relation types are proposed: `member_of_household`, and
`cites_statement` for one statement citing another as proof, objection or
precedent. Other unusual actions stay events that keep the source's own verb.

Some of these rules came from cases the ontology review had set aside for
testing. The [frozen test set](../heldout-v2/README.md) says how we keep the
test fair.

## What the new review found

The review read **30 additional cases across 82 primary text segments**. A separate check revisited six earlier cases. Three of the new cases received another independent reading. The quotes were checked against the saved source text; those checks do not prove every proposed interpretation.

The cases were chosen to expose different failures. They are a challenge set for the next reader, not a random sample or an estimate of accuracy.

| Passage | What it changes in the plan |
|---|---|
| [Bava Metzia 59b:10](https://www.sefaria.org/Bava_Metzia.59b.10) | Imma Shalom connects husband and brother. Keep the woman and both family claims |
| [Menachot 62a:12](https://www.sefaria.org/Menachot.62a.12) | Alternate versions reverse Hisda and Hamnuna's speaking roles |
| [Eruvin 53b:14–16](https://www.sefaria.org/Eruvin.53b.14) | A disputed phrase can mean a woman or a tractate |
| [Bava Batra 24a:14–24b:1](https://www.sefaria.org/Bava_Batra.24a.14) | A possible disagreement is raised and answered across the page break |
| [Chagigah 3a:4–5](https://www.sefaria.org/Chagigah.3a.4) | Alternative family paths describe the same pair of unnamed learners |
| [Taanit 23b:15–24a:2](https://www.sefaria.org/Taanit.23b.15) | Attendance changes from one teacher's circle to another; later speech helps identify the visitor |
| [Sanhedrin 101a:6](https://www.sefaria.org/Sanhedrin.101a.6) | Parenthesized negation needs an editorial reading; the translation must not silently decide it |
| [Berakhot 27b:3](https://www.sefaria.org/Berakhot.27b.3) | Disciple-colleague is a specific role; save it alongside the dialogue |

The [visual plan](relationship-ontology.html) includes all thirty cases. [The saved review](../data/checkpoint/ontology-review-data.json) includes full primary text segments, edition details, hashes and proposed claims.

## What changes in this plan

| Earlier proposal | Revised starting point |
|---|---|
| One label between two nearby names | Several claims from a whole episode, including people the name finder missed |
| A relation usually joins two people | A claim can concern a person, group, statement, event, place or object |
| An alternative swaps a speaker | An alternative may change the participants, their roles, the family relation, or the meaning of a phrase |
| Every source “or” means one event must be false | Keep the source's alternate reports. Decide separately whether they could both be historically true |
| A quote, teacher or in-law points to an older person | Record the exact relationship. Infer dates separately, with named assumptions |
| The same spelling helps decide identity | Keep each mention separate until its local role and other evidence support a match |
| One confidence value describes a link | Keep reading confidence, identity confidence and historical confidence separate |
| A saved graph edge is the final record | Save the pack and each decision revision. Rebuild the graph view when decisions change |

## Save the people and the words before joining them

Use the Hebrew or Aramaic snapshot as the primary text. Keep its edition, passage address, retrieval time, licence and hash. Preserve punctuation, brackets and editorial marks. A translation may settle something the Hebrew leaves open. Save that as the translator's reading.

Create a mention for each named person, relational description, group and pronoun. A mention points to words in one source version. It does not yet name a global historical person. Even its type can depend on the reading: a phrase may mean a woman in one interpretation and a tractate in another.

“Rav Hisda's daughter” therefore gets a person mention. The graph can display that description. Another passage's “Rav Hisda's daughter” is a possible match, not an automatic merge. A second daughter must remain possible. The same rule applies to “his wife,” “his father,” “the servant” and unnamed speakers.

A name can contain another person. In “Mar Zutra son of Rav Nachman,” preserve the complete name and the embedded father mention. Save the child-of claim too. Do not split “Rami bar Hama” into two unrelated sages.

Family words can also be forms of address. “My brother” must not automatically create a sibling claim. Keep literal kinship, affectionate address and uncertain usage distinct. Preserve a compound family path such as “child of his daughter.” Do not collapse it to generic family or invent a named relative to complete the path.

A pronoun can have several candidate referents. Keep the candidate links and their supporting context. If its antecedent is outside the saved segment, expand to the surrounding episode and record which passages were read. An unresolved pronoun must not create a confident person edge. Track a local participant within the episode so its names and pronouns can be joined without deciding its historical identity. These local matches are scoped to the reading branch. Joining them to a person elsewhere in the text is a separate decision.

## Use these records

| Record | What it stores |
|---|---|
| Source snapshot | Exact text, edition, address, hash and retrieval details |
| Mention | Exact words in that snapshot, with candidate types where the meaning is disputed |
| Local participant or referent | The names and pronouns that refer to one participant or thing within an episode and reading branch |
| Statement or event | The teaching, speech turn or depicted action, with its participants and roles |
| Claim | A typed statement supported by a source span, within a particular reading |
| Reading group | The alternatives and which statements change together |
| Identity hypothesis | Which mentions may refer to the same person, and why |
| Evidence pack | The material needed to decide a claim, identity or connected set of choices |
| Decision revision | Conclusion, reason, supporting and opposing evidence, open questions and review history |
| Graph projection | The edges currently shown, each linked to its decision and pack |

Statements and events can initially be local to one passage. Deciding that two passages report the same teaching or event is a later, sourced decision too.

## Start with these relation families

Family, Transmission, Teaching, Speech, Views, Scenes and Time are the accepted starting categories. Precise terms within each family can grow as we review more passages.

| Family | Starting terms | Required meaning |
|---|---|---|
| Family | `child_of`, `spouse_of`, `sibling_of`, `child_in_law_of` | The exact kinship stated. Keep “son,” “daughter,” “wife” or “sister” as source wording. Do not collapse every relative into `kin` |
| Transmission | `reports_in_name_of`, `heard_from`, `attributes_to` | What teaching is transmitted or attributed. `reports_in_name_of` does not mean direct hearing or a teacher relationship |
| Teaching roles | `student_of`, `teacher_of` as its inverse | A relationship actually supported by the wording, rather than inferred from every quotation or question |
| Speech | `addresses`, `asks`, `answers`, `objects_to` | Speaker, addressee if stated, speech content, and the earlier statement being answered or challenged |
| Views | `holds_view`, `rules_like`, `supports`, `opposes`, `explains` | A specific teaching, ruling or question. Agreement is limited to that issue |
| Scenes and actions | `participates_in`, `visits`, `sits_before`, `travels_with` | An event and the roles people play in it. A visitor to a house does not prove its owner was present |
| Explicit time | `before`, `after`, `during` | The events or dates being ordered. Avoid using `before` for both a place before a teacher and an earlier time |

Identity claims and reading flags live outside this list. “Same person,” “one name cut in two,” “no relation found” and “alternate reading” are decisions about the text and its interpretation.

Give each term an allowed subject and object type. An objection may target a ruling. A blessing may concern spices. Neither object should be forced into a person node. For dialogue, a speech event can record both the person addressed and the teaching challenged.

Keep a relationship subtype and time scope when stated. “Disciple-colleague” differs from an ordinary student. A person may attend one teacher before another, and a spouse may later be described as a widow. The date of the source snapshot and the date of our review are separate from the time of the relationship.

Save a symmetric relation once. Save a directed relation once and derive its inverse for display. “Son of” and “father of” do not supply two independent pieces of evidence. Use mention IDs and role names for direction, rather than `AB` or `BA` tied to word order.

Keep uncommon actions as an event with the exact source verb and supported roles. Mark the event type unclassified when needed. Review recurring unclassified actions before adding a new standard term. Do not invent a relation merely because two names are nearby.

## Keep the kind of claim separate from its topic

Each episode can be `halachic`, `aggadic`, `mixed` or `unknown`. Keep the reason and the words that support the tag. Do not label an entire daf from one paragraph.

Also record the form of the episode: a teaching chain, legal argument, ordinary narrated action, dream, parable, or another form that needs review. The topic and form answer different questions. A discussion of law can contain a hypothetical dialogue.

Each claim also needs:

- **Whose statement it is:** the narrator, a named speaker, or someone quoted inside that speaker's words.
- **Whether it is affirmed or denied:** a negative ruling must not become a positive `rules_like` link.
- **Whether it is asserted, asked, supposed or conditional:** “Would he agree?” does not state that he agreed.
- **What happens to the claim:** proposed, answered, rejected, withdrawn or replaced later in the discussion. An answered suggestion of disagreement must not survive as an accepted disagreement.
- **How it is supported:** explicit wording, resolved pronoun, commentary reading, or later inference.

The proposed genre tags may help judge whether a depicted meeting happened. Test that idea against independent chronological evidence. Until then, genre is a description of the passage, not a measured probability of historical truth.

## Alternatives can change a whole reading

Keep three different kinds of alternative:

1. **The text reports alternatives.** “Some say” may change the speaker, a dialogue's direction, a person's name, a family relation or a whole event.
2. **Witnesses differ.** Two editions or manuscripts may print different words. Preserve both snapshots and their relationship.
3. **Readers differ.** A translation or commentary may resolve punctuation, a pronoun or a chain differently. Keep that reading with its source.

Each alternative group needs a span and a scope: which claims belong to each branch, which are shared, and where the branches rejoin. If scope is unclear, keep that uncertainty. Do not attach the final answer to both conversations simply because it comes after them.

A source's alternate reports are not automatically mutually exclusive historical events. In [Arakhin 13b:4](https://www.sefaria.org/Arakhin.13b.4), Rav Huna could state a teaching and Rav Zavdi could also transmit it from him. The text gives two reported routes. The graph should retain both and mark their source relationship.

A competing parse may require exactly one choice within a particular reading. A different set of historical claims may be compatible. Record those constraints explicitly. Do not make every edge probability add to one. When an episode contains several alternative groups, record whether the choices depend on each other. Combining a visitor branch and an outcome branch does not create an additional textual witness.

## An evidence pack should answer one clear question

A pack may ask whether two mentions are the same person, whether a transmission link is supported, or how a difficult passage should be split. Include a small connected group of decisions when the choices depend on one another. An isolated edge review must not ignore the alternate scene or identity assignment that makes it possible.

Save these with the pack:

| Part | What the reader should see |
|---|---|
| Question and candidates | The proposed link or identity, the competing answers and `cannot tell` |
| Source evidence | Exact spans, full relevant context, editions and stable source IDs |
| Support and opposition | Which evidence helps or hurts each candidate, with a short reason |
| Source dependence | Translations, commentaries, copied passages and repeated editions that rely on the same underlying evidence |
| Alternatives | Branch IDs, scope, shared claims and unresolved pronouns |
| Search record | What was checked, what was unavailable and what has not been searched |
| Decision | Accepted, tentative, rejected or unresolved, with a concise explanation and the strongest objection |
| Dependencies | The other identity, date or reading decisions this conclusion assumes |
| Revision history | Pack hash, input hashes, method version, review time, authority and the decision it supersedes |

“Nothing found” means a completed search found nothing within its stated scope. It does not mean a source failed to load. “No relation extracted” is not evidence that two people had no relationship. A rejected reading stays in the history with the reason for rejection.

A commentary and the passage it explains should not count as independent votes. Repeated reports may also share an earlier source. Record known dependencies; leave independence unknown when it has not been checked.

Use separate values for confidence in the reading, the identity match and the historical claim. We can keep clearly labelled provisional scores before calibration, including several candidate readings. Store what each score means and how it was produced. Only call scores calibrated probabilities after testing them on reviewed examples. Preserve joint choices and `cannot tell`; do not multiply unrelated-looking scores as if independence were established.

## Dates come after the claim has been read correctly

A source cited by someone else supplies a teaching attributed to that source. It does not by itself give either person's birth or death date. It does not prove they met. A younger person can teach an older one, and an in-law relation does not establish which person is older.

A family link may support a generation constraint, but its precise implication depends on the relation and the identities. A father and child need not have overlapping lives. Keep literal kinship, inferred age order and a proposed meeting as different claims.

An impossible-looking chain can suggest a wrong identity, a wrong split, a variant reading or a literary scene. It does not automatically prove a shared name must be split into two people.

Build identity and chronology decisions together where necessary, with the dependencies recorded. Do not use a date inferred from an edge as independent proof of that same edge. Keep Babylonia and the Land of Israel distinct when comparing named generations. Add calendar dates only when their sources and uncertainties are known.

## Corrections to the earlier ten-case report

The Yerushalmi case needs two joint choices: chain breaks and person identities. [Guggenheimer's translation and footnote 256](https://www.sefaria.org/Jerusalem_Talmud_Berakhot.1.5.14?lang=bi) identify an early Rabbi Yirmeya. [Ohr LaYesharim](https://www.sefaria.org/Ohr_LaYesharim_on_Jerusalem_Talmud_Berakhot.1.5.14) identifies a later Rabbi Yirmeya and reconstructs several separate chains. The earlier plan's objection that Yohanan must precede Yirmeya was too strong. It depended on choosing the later identity first. Keep both sourced readings open.

[Arakhin 20b:8–10](https://www.sefaria.org/Arakhin.20b.8) has nested alternatives: the report form, then who asks whom, then a different baraita to which the discussion is attached. The exchange reappears at [21a:4](https://www.sefaria.org/Arakhin.21a.4), with a different printed name form. These are related reports; do not count them as independent evidence without checking their source relationship.

[Pesachim 37a:4](https://www.sefaria.org/Pesachim.37a.4) explicitly includes “my teacher” in each branch. Save those teaching claims as well as the questions and quotations. [Rashi](https://www.sefaria.org/Rashi_on_Pesachim.37a.4.1) explains the two teacher identities.

[Bava Batra 12b:3–6](https://www.sefaria.org/Bava_Batra.12b.3) frames the daughter story as an example about prophecy and children. Keep the family and scene claims, tag that framing, and distinguish the daughter's choice and Rava's future response from a completed marriage.

## Use the existing systems where they fit

Save the shared research tables in DuckLake on R2, using the existing Prophex lake tools. Keep source snapshots, earlier readings and proposed claims separate. Pin a lake version in each evidence pack so its inputs can be reopened. See the [storage instructions](../lake/README.md). The current import stores existing evidence; the pack and decision tables follow with the checked pilot.

The existing Talmud and Tanach core already has addressable texts, anchors, typed artifacts, producer versions and protection for human corrections. Use those for passage claims and their locations. Add domain-specific bodies for claims, reading groups, packs and decisions. The current generic link body is too small to hold all this on its own. The existing cache envelope also needs a separate revision history if it is to preserve every earlier decision.

Prophex's evidence packs provide the useful pattern: collect sources before reasoning, keep provenance beside the evidence, and make missing material visible. The Talmud version adds nested speech, source alternatives and uncertain person identities. Plan the review page around source text on one side and claims, variants and decisions beside it.

Keep the local vocabulary small and provide mappings to established work:

- [SNAP:DRGN](https://snapdrgn.net/cookbook.html) distinguishes ancient person records, attestations and proposed links between them.
- [W3C PROV-O](https://www.w3.org/TR/prov-o/) supplies terms for what a result was derived from and how it was produced.
- [CRMinf](https://cidoc-crm.org/crminf) represents premises, conclusions and the act of reaching a conclusion.

These are guides for compatible meanings. The first extraction pilot does not need an RDF database or a full implementation of any one standard. Do not claim formal conformance until the mappings are checked.

## Build and check it in this order

1. **Agree on the small contract.** Define mentions, claims, roles, reading groups and decisions. Keep the current pair table as an earlier result. It is useful for finding examples but cannot define everything the new reader is allowed to find.
2. **Make a checked passage set.** Include a random sample and a separate challenge set. Cover both Talmuds, common formulas, unnamed people, nested names, long stories, negation, variants, groups and passages where there is no relationship. The examples reviewed for this plan form a challenge set, not an accuracy estimate.
3. **Run a small passage reader.** Read enough surrounding text to resolve an episode. Save every supported claim, including claims involving people far apart in the text. Validate quote spans, role types, branch references and output completeness. Failures and unfinished passages must remain visible.
4. **Build the pack and decision flow.** Start with easy and difficult real examples. Reopening a decision should reveal the same source versions and assumptions. A changed source or identity decision should flag dependent conclusions for review.
5. **Review the pilot before the full reread.** Measure missed mentions, false mentions, claim precision and recall, direction, argument type, branch scope and false co-presence separately. Check unclassified actions and disagreements. Use a held-out set that was not used to tune the reader.
6. **Read the sources again at scale.** Use resumable runs with per-passage status, source hashes, bounded retries and checked outputs. Include passages with no old pair row. Store new results beside the earlier run rather than replacing it.
7. **Resolve people and add outside sources.** Build packs for identity candidates and linked decisions. Add biographies and dates as sourced claims. A biography may support a match or reveal a conflict; it is not automatic truth.
8. **Show the graph with its evidence.** A click opens the pack, source passage, alternatives and decision history. Allow a view of textual reports and a separate view of accepted historical links. State which view is being shown.

A tentative same-person link must not trigger an irreversible merge of all matching names. Keep the underlying mentions and earlier decisions so a later split is possible.

## What happens next

1. **You review the proposed rules.** The ones to look at first: keep fathers
   inside names, keep printed and corrected family links side by side, label each
   wording by kind of evidence, do not count shared-editor sources twice, and the
   two new relation types. Nothing is accepted until then.
2. **Write the new saved format and its checker** in a new folder. The frozen
   pilot stays as it is.
3. **Turn the researched cases into checks** that a new reader must pass.
4. **Read the twelve frozen test passages** with the new reader. They were drawn
   and saved on 23 September 2026, before anyone read them. Then have the results
   reviewed rule by rule.
5. **Only then build identity packs.** Start with Yirmiya bar Abba (Berakhot
   27b), Yosi bar Hanina or bar Zevida (Sanhedrin 59b) and Rav Hoshaya
   (Yerushalmi Taanit).
6. **Add biographies and dates last**, as sourced claims.

The full reread follows only after the new reader handles the difficult cases and
its mistakes on the test passages are understood.


## What the current table contains

The earlier pair table has 57,857 rows. Each row saves one label for two nearby detected names. These are saved labels, not verified person relationships.

| Label | Rows |
|---|---:|
| cites | 15,389 |
| disputes | 10,719 |
| same-man | 5,598 |
| none | 5,346 |
| explains | 4,466 |
| together | 3,868 |
| addresses | 3,143 |
| follows | 2,648 |
| asks | 1,525 |
| kin | 1,262 |
| juxtaposed | 1,187 |
| before | 976 |
| alternative | 838 |
| one-name | 413 |
| teacher | 280 |
| open | 199 |

There are 18,455 distinct joining patterns. The top 100 cover 28,276 rows (49%); the top 500 cover 34,792 (60%). The vocabulary needs a small common core plus a way to preserve unusual actions.

Four selected new cases had no saved pair row despite relevant source material: Menachot 29b:3, Berakhot 10a:2–4, Shabbat 156b:4–5 and Taanit 23b:8. That is why the next pilot must inspect passages outside the old pair table too. It is not an estimate of how often the old reader missed a relationship.
