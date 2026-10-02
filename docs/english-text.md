# How English prose is formatted

`packages/core/src/text/displayText.ts` owns paragraph formatting for both readers.
The Talmud wrapper is `packages/talmud/src/client/displayText.ts`. Use
`useDisplayText` in a component, or `finishDisplayText` for a synchronous label.
Pass the current language to synchronous calls. `Hebraized` and
`HebraizedWithRabbis` use the same hook.

The first name mention is `רש״י (Rashi)`. Later mentions are `רש״י`.
Known terms follow the same rule. Ordinary one-word English meanings stay in
English after their first gloss. English explanations and source references
must survive cleanup.

## What caused the repeated names

Four older behaviors disagreed with this rule:

- The bare-name replacement changed `Rashi` even inside `(Rashi)`.
- The dictionary changed Hebrew-first English glosses into Hebrew echoes.
- The inverted-term rule moved an English explanation ahead of its Hebrew.
- A later whole-paragraph conversion could rewrite glosses again.

The old tests often checked those helpers separately. Some expected the English
name or gloss to disappear. They did not check the final rule across both reader
components. Echo removal also treated straight and Hebrew quote marks differently.

## How the formatter works

1. Read known transliterations from the dictionary. Preserve parentheses that
   already explain Hebrew text.
2. Remove existing echoes, treating Hebrew quote variants as the same spelling.
3. Give known names, page pairs, and dictionary spellings to `hebrewFirst` once.
   It handles longer names before shorter ones and counts aliases together.
4. Remove repeated concept explanations and tidy punctuation before adding links.

The hook can receive more pairs from the existing bilingual endpoint. Each update
starts from the source paragraph. It never feeds rendered prose back into another
rewrite. The client no longer calls the whole-paragraph `/api/hebraize` fallback.
Unknown transliterations stay as written until a dictionary entry or a supplied
pair identifies them. Saved text, producer prompts, and cache keys do not change.

## Where to add rules and tests

Add known spellings to the dictionary data in `packages/core/src/text/hebraize.ts`. The bare-word
allowlist selects which entries can appear without parentheses; it stores no
second copy of their Hebrew. Do not add string replacements to link renderers
or individual panels. Keep name and term ordering
in `hebrewFirst`; keep the complete display process in `displayText.ts`.

`tests/display-text.test.ts` checks the reported Rashi sentence, every fixed
spelling, aliases, possessives, vowel marks, source references, Hebrew mode, and
repeated application. It also rejects independent cleanup calls in other client
modules. The browser check renders the supplied sentence through both real reader
components. Existing dictionary, concept, and bilingual tests cover their narrower
contracts.

## Tanach uses the same formatter

Tanach formats generated notes, summaries, titles, map labels, and copied study
text through `packages/tanach/src/lib/displayText.ts`. Original verses and source
commentaries stay unchanged. Hebrew fields stay unchanged too. When a field is
missing, formatting follows the language of the field actually shown.

Glossary meanings such as “blessing” remain ordinary English unless the source
explicitly pairs them with Hebrew. Both readers use the shared `BidiText` component
to keep Hebrew abbreviations together. First mentions restart in each paragraph.

Tests also check quoted names, late glossary updates, plain and linked text, and
Tanach language changes.
