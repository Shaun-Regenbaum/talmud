# Tanach component migration

Tanach's main controls now come from `packages/ui`. Text loading, verse navigation,
source matching and parsha calculations stay in Tanach.

| Screen or feature | Shared components | What stays in Tanach |
| --- | --- | --- |
| Reader header and chapter footer | ReaderHeader, Button, Select, PageNavigation, LangToggle, ToolbarMenu | Book names, chapter links and reader state |
| Reader choices | Pill, PillRow | Which study views are available |
| Parsha drawer | Drawer, StudyOverview, ReadingMap, SectionHeading, ChoiceCard, Button, SourceCard, StatusMessage | Portion ranges, aliyot, section layout, fetching and text navigation |
| Hebrew terms in English prose | InlineHint | Finding terms and keeping mixed Hebrew/English text in reading order |
| Commentary, Talmud and Midrash | Drawer, SourceCard, StatusMessage | Source text, references and the preference for original Hebrew/Aramaic |
| Geography | GeoMap, Drawer, StatusMessage | Chapter place data and verse highlighting |
| Inspector | Drawer, SectionHeading, StatusMessage, RunWaterfall, RunTreeDag | Chapter-run requests and selected producer |
| Alignment | Select, PageNavigation, Input, LangToggle, FilterChip, ChoiceCard, SectionHeading, StatusMessage, RunTreeDag | Verse columns, anchor calculation, filters and data requests |
| Usage | UsagePage, StatCard, FilterChip, DataTable, Meter, StatusMessage | Loading the usage ledger |
| Progress and paused generation | LoadProgress, AiStatusBanner | Which chapter requests are running |

## Deliberate exceptions

- Torah text columns and margin anchors remain local. They position scripture,
  rather than ordinary controls. The hidden Mikraot Gedolot layout is unchanged.
- Word selection and the translation popup remain local. Their position depends
  on the reader's selected words.
- The connection guide remains an English technical document with command blocks.
  It is not a study panel.
- Graph data and specialized labels remain in their adapters. Shared graphs still
  have some English inspection details; translating all of those is separate from
  changing Tanach's control labels.

## What to check before the Talmud pass

Open the reader, parsha drawer, commentary, alignment, inspector and usage page.
Check 320px and 390px phones as well as desktop. Switch to Hebrew. Select a
parsha section, follow a landmark, filter saved items, inspect one item and sort
the usage table. Close a drawer with Escape and confirm focus returns to its
opener. A failed data request must leave a usable page with an error message.

The gallery includes the shared study cards, counted filters, input, statistics,
inline explanation and message styles using the saved real parsha response.

## Preview and source explanations

After building Tanach, run `python3 scripts/preview-tanach.py` and open
`http://127.0.0.1:5211`. Geography checks the chapter inspector before reading a
saved result. Genesis 1 has no mapped places; Genesis 12 has seven. A missing
cached result remains unavailable in this preview. The parsha response comes
from the gallery's dated, real saved response.

The Talmud and Midrash panels now put a source-backed explanation before the
original passages: what question the source addresses and why it uses the verse.
The two new producers are `gemara-question` and `midrash-question`, each with its
own `v2` cache family. Existing recipes, summaries and keys are unchanged. They
read up to six linked passages, fetching longer text where available, and must
state when that text does not establish the connection. Empty results are rejected
before saving. These explanations need the updated backend and generation access;
the local preview labels them unavailable rather than supplying invented prose.

The explanations also read the Talmud reader’s existing pasuk cards through the
`TALMUD` service binding. For each linked Bavli daf, they request `/api/pesukim`
without `generate=1`. Only cards for the same verse, or an explicit range
containing it, are included. The input keeps the daf and verse reference beside
the saved context, why-here note, reading method, conclusion and summary.

The original passages outrank these generated notes. A missing card is recorded
as missing, not as evidence that the source has no connection. A failed service
request stops the explanation from being cached without its intended context.
The inspector records this input as `talmud-verse-context`.

Only `gemara-question` and `midrash-question` moved from v1 to v2, so their earlier
explanations are replaced on demand. Talmud’s pasuk cards and all older Tanach
producer recipes and caches are unchanged. The context-matching tests use a real
Berakhot 2a response saved on September 22, 2026, with its source URL.
