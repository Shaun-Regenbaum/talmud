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
| `ReaderIcon` | One maroon family of rounded outline icons, separate from annotation placement. |
| `Graph` | Shared card styles, SVG cards, connectors and lane routing used by argument, spine and dependency graphs. |
| `StudyOverview`, `ReadingMap` | Reference/title/prose and the parsha verse ribbon, aliyah markers and legend. Tanach supplies its layout and study data. |
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
