# @corpus/ui

Both readers use this package for their colors, controls and shared panels. Apps own text, navigation and data loading. The shared components own layout and appearance.

## Use the same theme

Import `tokens.css`, then `themes/talmud.css` or `themes/tanach.css`, then `components.css`. Both apps use the same paper background, maroon accent, borders and control sizes. The corpus theme chooses only the Hebrew reading font. English reading text uses Spectral in both apps.

Use `--bg`, `--fg`, `--muted`, `--line`, `--surface`, `--surface-sunk`, `--accent` and `--accent-strong`. Do not add app-specific values for these tokens. Change `tokens.css` to change both apps. Diagram colors that distinguish categories remain separate from the selection color.

## Reuse these components

| Component | Use |
| --- | --- |
| `ReaderHeader` | Reader title, book picker, page controls, current reading and utilities. Wraps on phones. Accepts `collapsed` for Talmud's existing phone controls. |
| `Select` | Native select with shared sizing and focus styles. Pass its accessible label and options from the app. |
| `PageNavigation` | Previous/next buttons around a page number and optional side control. Apps supply translated labels, disabled states and callbacks. |
| `Button` | Native button attributes, `primary`/`secondary` variants and optional `active` pressed state. |
| `ToolbarMenu` | Secondary links or controls. Native disclosure with Tab navigation, outside-click dismissal and Escape focus return. |
| `LangToggle` | English/Hebrew selection with pressed states. |
| `Pill`, `PillRow` | Reader topic choices. |
| `Drawer`, `BottomSheet`, `Prose` | Side panel on desktop, bottom sheet on phones, and bilingual reading text. |
| `Charts`, `DataTable` | Line charts, chart cards, sortable tables, ranked bars, meters and rate chips. Used by Talmud usage. |
| `ReaderIcon` | Distinct category colors with consistent rounded outline icons, separate from annotation placement. |
| `GraphView`, `GraphEdge`, `GraphConnectionDetails` | Compact argument maps, full-screen passage maps, curved connectors and connection inspection. |
| `Graph` | Card styles and basic SVG cards and paths for specialized diagrams. |
| `Study` | Source cards, selectable rows, counted filters, section headings, inputs, summary cards and status messages. Used throughout Tanach. |
| `InlineHint` | Inline explanations for pointer, keyboard and touch. |
| `StudyOverview`, `ReadingMap` | Reference/title/prose and the parsha verse ribbon, aliyah markers and legend. Tanach supplies its layout and study data. |
| `highlightOverlay` | Continuous-block text highlights: one band per line, joined into a block with no page showing between lines. Options for multi-column text and paragraph breaks. Both readers paint highlights with it. |
| `reveal` | `revealInPanel` centers a target in its side panel, drawer or bottom sheet and pulses it once. It follows text that is still loading for two seconds, and stops when the reader scrolls. Motion-sensitive readers get a still tint instead. |
| `hoverIntent` | Hover that does not flicker between neighbouring items. Used by `GraphView` and `ReadingMap`. |
| `AiStatusBanner`, `LoadProgress` | Shared status and loading messages. |
| `InspectorRow`, `RunTree*`, `UsagePage` | Cache inspection, dependency diagrams and usage tables. |
| `GeoMap`, `WorldBubbleMap` | Shared maps. |

Import components by path, for example `@corpus/ui/ReaderHeader`. The package ships Solid source. Both apps exclude it from dependency pre-bundling so the JSX transform runs on it.

For navigation links, use an anchor with `class="ui-button"`. Do not make a button imitate a link. App labels belong in the app's English/Hebrew `t()` catalog. `Button` sets `aria-pressed` only when `active` is supplied.

## Where it is used

- Both main readers use the same header, select, navigation, buttons, secondary menu and language switch.
- Talmud's other pages use the same language control. Alignment, coverage and the tutorial use the shared control classes.
- Tanach's chapter footer uses the same button as the header. Its existing topic pills, drawers, progress and inspector already use the package.
- Graph selection, tutorial highlights and mobile controls now read the shared accent token.

The printed daf, Torah columns, annotation placement and corpus-specific panels keep their own layouts. Talmud's large study sidebar and the two usage pages still have different structures. These are not interchangeable components. This package currently supplies one light theme; a complete dark theme needs a separate review of reading surfaces and diagrams.

## Open the component gallery

Run `pnpm gallery` from the workspace root, then open `http://127.0.0.1:5210/`.
The page renders the actual shared components. Choose Phone for a live, scrollable
preview at 320, 390 or 430 pixels. Its own viewport runs the real mobile styles.
Try the buttons, section picker,
menu, drawer and language switch. The header controls navigate the gallery itself.
Color swatches read the theme variables directly. Charts, tables and maps read live
traffic totals. The dependency graph reads the recorded Berakhot 2a Tidbit tree.
These are read-only requests through two allowlisted Vite proxies to talmud.dev.
No backend or generation service is started. If the network fails, the gallery
shows an unavailable message and retry button. Static builds have no proxy and
show that state for these examples. No usage records are bundled in the build.

The parsha example is a real Tanach response saved on September 22, 2026, with
its source URL and capture date in `src/gallery/content/parsha.json`. It is a
component example, not a claim about the current weekly portion. Selecting a
section shows its recorded summary. Landmark buttons open the verse on Sefaria.
The gallery does not call the parsha generation endpoint.

The argument-map example uses the saved Berakhot 2a response from the existing
passage fixture, with its source recorded in `src/gallery/content/berakhot-argument.json`.
It renders `GraphView` directly. Try section expansion, line selection, endpoint
links, the full-screen map, both layouts and the English/Hebrew controls. This
example also works in the static gallery build and makes no generation request.

The regional maps use Talmud's existing place list and omit locations marked
uncertain. Israel and Babylonia have separate close views. The world traffic map
is separated from these study maps.

The gallery also lists what is still app-specific: study diagrams, alignment
source cards and filters, usage summary cards, date ranges, stacked bars, coverage,
and the full set of loading and error states. The printed daf is out of scope.

The page lives in `src/gallery/Gallery.tsx`. `pnpm gallery:build` creates a static
build in `packages/ui/dist/gallery`. The gallery reuses the existing Vite tools
from the Tanach package and adds no dependencies.

## Check a change

Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`. Shared control behavior is covered in `packages/talmud/tests/shared-reader-controls.test.tsx`.

In both readers, check desktop and phone widths, English and Hebrew, long book names, page navigation, the language switch, menu keyboard use and visible focus. Look at the screenshots. Keep production generation calls blocked during a UI-only preview; use real text or the app's actual unavailable state.

Tanach adoption and deliberate exceptions are listed in [the component inventory](../../docs/tanach-component-inventory.md).

### Daily comparisons and compact summaries

`@corpus/ui/DailyComparison` shows grouped bars by date, with exact values below each day. All series must use the same unit and share one scale. Missing, invalid, and negative values display as a dash; zero remains zero. Callers supply translated labels and number/date formatting. Dates follow the supplied row order. Narrow screens scroll horizontally by touch or keyboard.

`@corpus/ui/MetricSummary` gives a total, supporting counts, and short notes a consistent layout. `DetailSection` adds a native expandable section with separate title and description. It accepts `open` and `onToggle` for saved state. Callers that load content only when opened should wrap the children in a conditional.

Both examples appear under “Daily comparisons & summaries” in the gallery. They read live usage and billing data through the gallery’s read-only proxy.

## Build maps with GraphView

`@corpus/ui/GraphView` takes `groups`, `edges`, translated `labels`, and selection callbacks. It imports its own CSS and uses the app's theme tokens. It fetches no data and creates no claims or connections.

- A group has a unique `id`, `label`, optional `children`, and controlled `expanded` state. The compact map preserves their supplied order. Statement rows are 30 px tall, section headers 40 px, with 4 px between statements.
- Nodes can carry `role`, `badge`, `badgeColor`, `color`, `selected`, and `dimmed`. Use `label` for a short title and `summary` for the saved summary or source excerpt. Summaries appear beneath the title and role on the passage board and do not enlarge compact rows. Existing `description` and `annotation` reserve extra space for rulings and practice in both views. The compact view shortens long labels and descriptions visually; `detail` keeps the full text available on selection in the modal.
- Edges have unique `id`, `from`, `to`, `label`, and `color`. Optional `dash`, `arrow`, and `provenance` describe their appearance and origin. `kindLabel` supplies the short relation name in the shared legend. An arrow points from `from` to `to`. Missing endpoints and self-links are omitted; the renderer never substitutes another target.
- Local edges connect children of the same group in its left gutter. Connections between group headers use the outer right gutter. Keep cross-section edges on their group headers in this layout; child-to-child links across groups are supported in the passage board through the aisles between columns. In the compact layout, keep cross-section links on headers.
- `onSelect` receives the same node in either view. The host owns text highlighting, navigation, and selection. `actions` and `onToggleActions` expose off-page links without fetching their targets.
- `onHover` receives the node under the pointer or keyboard focus, and `null` shortly after it leaves. Touch never hovers; a tap selects. Hosts use it to preview a node's text and restore the selection on `null`. `ReadingMap` has the same `onHover`, by move index.
- Selecting a line pins it and marks both endpoints. The caption reads the supplied source title, relationship, and target title, followed by any note and provenance. The caption's endpoint buttons scroll to and focus their cards without activating host navigation or disclosures. Clearing the caption restores keyboard focus to its line. Mouse, touch, Enter, and Space use the same selection. Lines remain keyed by ID across layout changes so keyboard focus survives a redraw.
- `onSelectConnection` optionally receives the selected connection, or `null` when it is cleared, hidden, removed, or its map is closed. The renderer never substitutes another endpoint. Selecting a node clears the line selection. Opening the full-screen map starts a fresh connection inspection; the host keeps its current text selection. `labels.clearConnection` provides the translated name of the clear button.
- The full-screen button opens a native modal. It starts with sections in columns across the screen, and their statements running down each column in source order. Cross-section links run above the columns; local links run beside the statements. Full labels determine card heights. A reading-order strip jumps to any section; “Sections only” hides statement detail without changing the host's text selection. Readers can switch to the stacked view, zoom, fit, inspect a line, or close with Escape. Closing restores focus and the previous page scroll lock. Each view uses the same data and callbacks.
- `renderFullscreen` lets a host supply `GraphDialog` with a larger passage. Its optional `toolbar`, `status`, and `revealId` support range controls, loading messages, and navigation to newly loaded sections. Data loading stays in the app. The Talmud passage adapter reads saved sections one daf at a time, qualifies every ID with its page, and uses saved cross-daf connections. Page adjacency creates no argument edge. Automatic Mishnah boundaries are not yet supplied.
- `renderDetail` adds host-specific source links or controls to the modal detail. `controlsOnly` adds the modal to an existing specialized canvas, as the tractate map does.

Use `@corpus/ui/graph/geometry` for specialized layouts. `assignLanes` separates connections with overlapping spans. `routeConnector` reserves a 12 px bend, 16 px of straight approach, and a 2 px arrow gap. It returns both the path and its bounds. Close ports take a wider detour; callers must reserve those bounds. `GraphEdge` supplies a fixed-size arrowhead, unique marker, optional keyboard selection, and a wider hit area. It imports its own CSS.

Specialized maps can reuse `@corpus/ui/GraphConnectionDetails` directly. Supply the real `edge`, `from` and `to` nodes, a translated `clearLabel`, and `onClear`. Optional `onLocate` focuses an endpoint; without it the titles are plain text. `GraphEdge.selected` marks a pinned connection, while `highlighted` is only a hover or keyboard preview. `edgeId` exposes the stable ID for locating an edge. Apps still own the source data and titles; these components do not generate either.

Import interactive edges from `@corpus/ui/GraphEdge`. The older `@corpus/ui/Graph` export retains its separate SVG-path `GraphEdge` API for specialized diagrams.

Overview, the daf argument page, the section drill-down, speaker maps, and codification maps use `GraphView`. The tractate map keeps its page and rabbi annotations while sharing connectors and the full-screen view. Build trees share the same gutter router and arrow component. The separate rectangle router in `graph/orthogonalEdge` remains available for diagrams with nodes on both axes.
