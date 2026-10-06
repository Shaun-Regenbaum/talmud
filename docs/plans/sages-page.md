# Present sages through their connections and sources

The sages page starts with one autocomplete search in English or Hebrew. There
is no permanent directory or filter sidebar. Selecting a result opens a profile;
linked names lead to other profiles and browser Back returns to the previous one.

The biography and background sections are visible without opening disclosures.
Where in Shas keeps its chart. The text-based partner list keeps its passage links.
Teacher, student and family names are grouped by role rather than repeated as
separate table rows. External reference lists and maintenance tools are removed
from this reader page.

## Four views answer four different questions

| View | Question | Examples |
| --- | --- | --- |
| Relationships | Who were they to one another? | Teacher, student, parent, spouse, companion |
| Words and teachings | Whose words were passed on? | Quoted, heard directly, relayed a message |
| Views and debate | How do their views relate? | Disagreed, agreed, answered a difficulty |
| Events and actions | What does the passage say they did? | Visited, helped, travelled, sent food |

A passage can support more than one view. Teaching a particular rule is an
occasion of transmission. Being someone's teacher is a relationship. Neither
should be inferred automatically from the other.

A citation does not prove direct hearing. A disagreement does not prove a
meeting. Sending food does not prove the sender was present. Burial beside
someone does not prove they lived at the same time.

## What this version displays

The page reads existing biographies and the saved passage-partner files. It does
not change any extraction recipe. The completed passage readings are available
through Story passages; they are not added as historical identity edges.

Teacher, student and family records appear under From biographies, grouped by
role. These records do not yet have individual passage citations. Biography
events remain summaries rather than verified quotations.

Who he appears with uses the saved text study. Only sages with a saved record
get partners. Missing records are never filled from the biography tree. Each
partner opens a pair view with counts by kind and saved example references.
Counts can overlap, and the example references are not a complete passage list.
Bavli quotations are loaded from the exact Sefaria segment through the existing
source endpoint. Other texts retain source links without invented quotations.

The old arc diagram and its argument-network rows are removed from this page.
Inspection found an attribution from Rabbi Akiva to Abaye, so these person
assignments must not be presented as settled. The stored graph is unchanged.
Existing biographical influence and opposition summaries remain in background.

## How the new results should enter the page

Keep the extraction unchanged. Add reviewed display information alongside it:

- The original record identifier, label, quote and source address.
- The people mentioned, with their original passage-local identifiers.
- A resolved sage identifier only when the identification is supported.
- One or more of the four groups, when the statement belongs in a personal map.
- Whether the passage narrates an action, proposes it, denies it, describes an
  attempt, gives a hypothetical example, or leaves the status unresolved.
- For events with several people, each person's role in the same event.
- Any uncertainty about the reading or identification, attached to the claim.

“Narrated” means the passage says it happened. It is not independent historical
verification. A reported accusation is not proof of the accusation.

Do not silently attach a passage-local person to a sage because the names match.
Do not turn a hypothetical borrower and lender into historical people. Keep
comparisons, legal consequences, identity bookkeeping and theological
explanations beside their source text rather than forcing them into a personal
connection. Keep unresolved records available for review.

## What a new source row should show

The closed row says who did what, to whom. When the distinction matters, it also
says “proposed”, “attempted”, “denied” or “hypothetical”. Opening it shows the exact
quote and source link. A source link must support addresses outside the Bavli,
including the Yerushalmi, Midrash and Tosefta.

For Samson's request about a wife, the event keeps Samson as requester, his
father as addressee and the woman as the proposed bride. It must not turn the
request into a completed marriage or a conversation with the woman.

Before publication, check the 125 reviewed entries against these rules. Inspect
all entries that would create a new identity, claim an encounter, lose an event
participant or turn a proposal into an event. Preserve human corrections and
retain the original records so every grouping can be revised.

## Read the completed story batch

Story passages contains 5,975 distinct source references from 598 packs. Four
older passage readings are withheld because their quotes do not match the saved
source; their source text remains readable. The source and surrounding context
stay separate from the reading notes. Every displayed claim keeps its original
note, exact quotation, basis and context location. Open questions remain visible.

A profile links to a name search, not an identity match. No story reading silently
creates a teacher, family or encounter edge in the existing graph. The reading
batch is complete, but historical identity matching, relationship review and
coverage of the remaining source passages are not complete.

Rebuild with `python3 scripts/story-readings/build.py --input <saved-batch>`.
The input contains the frozen manifest, source packs, accepted answers and the
earlier test answers. The importer checks source hashes, answer receipts, exact
quotes, person references and duplicate source references. Published provenance
keeps the source and answer hashes for each pack. Original inputs remain intact.

## First check of Abaye and Rava

The pair route now shows 87 checked passages from the completed story readings.
The selection is deliberately narrow: the saved people list must contain both
exact labels אביי and רבא. It does not cover every spelling, every separate
appearance of either sage, or every passage in the earlier pair study.

59 passages support a connection between the pair. 18 do not establish one and
10 need further checking. These are passage counts, not unique historical events.
Parallel accounts remain separate passages. Groups overlap: 56 connect their
views, three report or carry words between them, and five narrate encounters.
None of these passages establishes a family or lasting teacher–student link.

Each decision in `static/sage-reviews/abaye-rava.json` stores the original passage
identifier, a hash of the complete saved reading, both passage-local person
identifiers, the exact source text, and the reason for its treatment. The source
text and original readings are unchanged. Tests reject changed source records,
missing decisions, duplicate decisions, and unsupported endpoints.

The earlier name studies group the regular Bavli Abaye–Rava pair together. The
new review checks their roles in each selected passage. It does not extend that
identification to a patronymic, a chronicle, an alternative name, or an unrelated
mention. The page preserves the text's attributions rather than claiming to
prove the events historically. Context-dependent attributions stay unresolved.

Both language views have summaries and reasons. Full source text is visible.
The reader can filter by group and inspect excluded and unresolved cases.
The original partner files remain unchanged; their older counts cover a
separate study and must not be added to these counts.

Next: check the held context and name variants, then review each sage's links
to other people with the same source and identity checks. No new reading batch
was required for this pair check.
