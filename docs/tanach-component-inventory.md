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
