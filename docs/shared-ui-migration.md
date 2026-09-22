# Move Tanach first, then Talmud

The shared library and gallery are the starting point. Both apps already use some
shared controls. This plan finishes the move in small, reviewable steps.

Keep maroon for primary actions and selection. Keep separate category colors for
reader icons. Preserve Hebrew reading fonts and corpus-specific meanings. Leave
printed daf layout, annotation placement, cache keys and generation recipes alone.

## Progress

Tanach’s first migration pass is ready for review. The reader, parsha drawer,
alignment, inspector and usage pages use the shared controls. See the
[Tanach inventory](tanach-component-inventory.md) for the remaining text-specific
components. Desktop and phone checks cover English, Hebrew, drawer focus and
failed requests. The broader Talmud pass follows the Tanach review.

## 1. Finish the Tanach component list

Walk through the reader, parsha drawer, geography, commentary, translation,
alignment, inspector and usage pages. For each visible control, record whether it
already uses `packages/ui`, needs an existing component, or needs a new component.
Add missing examples to the gallery before changing the app. Use real saved
content with its source and capture date, or actual empty/loading/error states.

Start with `App.tsx`, `ParshaDrawer.tsx`, `TermedProse.tsx`, `AlignPage.tsx`,
`Inspector.tsx` and `UsagePage.tsx` in `packages/tanach/src/client`.

## 2. Finish Tanach's reader and drawers

Use shared buttons, choices, section headings, overview text, source cards and
bottom sheets throughout the reader. Finish the parsha section list, selected
section, landmarks and source links around the existing shared `ReadingMap`.
Keep text loading and reader navigation in Tanach. Shared components receive
content and callbacks; they must not fetch or generate study content themselves.

Review desktop and phone layouts, English and Hebrew, keyboard focus, long titles,
scrolling within drawers, opening a source and returning to the text. Check the
smallest phone width before treating the component as ready.

## 3. Finish Tanach's supporting pages

Move alignment filters, source rows, status badges, inspector details and usage
summary cards onto the shared components. Add reusable empty, loading, failed and
paused states. Remove replaced CSS as each page moves, rather than keeping two
sets of styling rules.

Tanach is ready when every page in step 1 is accounted for, its controls use the
shared library, and remaining local components have a clear text-specific purpose.
Run lint, typecheck, tests and builds. Review screenshots and real interactions.
Approve Tanach's result before starting the broad Talmud migration.

## 4. Move Talmud onto the proven components

Start with the reader toolbar and mobile shelf, then study panels, source cards
and geography. Next move usage and alignment pages. Reuse the Tanach components;
add variants only when Talmud has a concrete need that the library cannot express.

Argument, spine and dependency graphs already share connector drawing and some
card styling. Continue with shared selection, expansion, pan/zoom controls,
legends and accessible node actions. Keep the different graph layouts and the
meaning of their relationships in their own adapters. Do not force every graph
into the dependency graph's data shape.

## 5. Finish and keep the apps consistent

Remove obsolete controls and duplicate styles. Document the exceptions. Keep
examples for every shared component in the gallery, including mobile and Hebrew.
Each migration pull request should cover one page or component family, include
before/after screenshots, and pass the four repository checks.

Suggested order of pull requests: Tanach inventory and missing primitives;
Tanach reader/drawers; Tanach supporting pages; Talmud reader/panels;
Talmud graphs; Talmud usage/alignment; final cleanup.
