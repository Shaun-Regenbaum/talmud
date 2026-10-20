# compact-source-v4: point at source units instead of retyping Hebrew

**Status: a design for root review.** The only working code is a small, tested piece:
`units.py`, which splits a source into units and turns unit numbers back into exact quotes. Nothing
selects this directory. These do not exist yet:

- the request builder
- the schema
- the reader instructions
- the validator wiring
- any runner, cache or importer change

No model calls were made. v2 and v3 are unchanged, and a test pins their files.

## Why

Today the model retypes each quote in Hebrew and counts which occurrence it means. That fails often:

- **The 210 trial (v2-low).** 82 results failed the whole-word quote check. That is the largest
  single cause of failure. The failures break down like this:
  - 214 quotes left out an attached prefix letter
  - 4 quotes started inside an abbreviation, after the quote mark of `א"ר`
  - 17 quotes used other quote marks than the text does, for example ״ where the text has "
  - 5 quotes asked for an occurrence that does not exist
  - 3 quotes landed on the wrong occurrence
- **The matched 30 (v3-none).** 12 results failed the same check, and 54 raw quotes sat inside a
  word. In 036, the quote `רב` landed inside `רבי ירמיה`.
- **Vowelled text.** In 031, 5 quotes had the right letters but the vowel marks in another order.

In v4 the model names units by number. It types no Hebrew and counts nothing, so none of these
errors can occur.

**The cheaper fix to beat.** An offline word-snap repair widens a quote to whole words. It needs no
model change, and it already makes 68 of the 82 failed v2 results pass the frozen validator
(`eval-pack-210/matched30-arms/snap-repair-sim.json`). So v4 is only worth a run if it beats v3
plus that repair, not just v3.

## How it would work

1. **Split each source into units.** Words, marks (punctuation) and spaces each become a unit.
   Every character falls in exactly one unit. Joining the unit texts in order gives back the
   source text exactly. The source text and its sha256 stay in the job unchanged, and they are
   hashed on their own.
2. **What the model sees.** The job is the same as now. Each source also gets a separate JSON list
   of `[unit_id, exact text]`. Nothing is written into the text itself, so no character can clash
   with a marker. Every character is safe inside a JSON string.
3. **What the model returns.** Every anchor becomes `{source_id, first, last}`, using unit IDs. In
   v2 it was `{source_id, quote, occurrence}`. The rest of the answer schema stays as in v2.
4. **What the compiler does.** It takes the start of the first unit and the end of the last. Both
   must be words, not a space or a mark.
   - The quote is the exact slice of the source.
   - The occurrence is counted exactly as v2 counts it.
   - The result is the v2 answer form, which then goes through v2's `validate.check` unchanged.

   So the strict checks, the record shape and the exact resolved offsets all stay as they are. The
   envelope adds three things: the splitter version, a binding per source (the source hash and the
   unit table hash), and the map from units to offsets.
5. **Binding.** The splitter version is `source-units-v1`. The compiler refuses unit tables that
   differ from the ones the request was built with. An old answer is never re-split with a new
   version.

## The unit rules (`source-units-v1`)

- **Spaces.** A run of whitespace is one space unit.
- **Words.** Inside a run without spaces, a word is a letter or digit, plus the letters, combining
  marks and invisible format characters that follow it. The zero-width joiner in the vowelled
  Mekhilta is one such character.
- **Quote marks inside a word.** Quote marks between letters stay in the word, as in `א"ר` and
  `ר''ע`. Quote marks right after the last letter also stay, as in `ר'`, `מתני׳` and `וכו'`.
- **Marks.** Everything else is a mark unit: `(` `)` `[` `]` `:` `,`, the maqaf, and so on.

What this does to real text:

| text | units |
|---|---|
| `תרבא ... קנסיה רבא` (Bekhorot 29b) | `תרבא` and `רבא` are separate words, so Rava's word cannot land inside `תרבא` |
| `א"ר אבהו` (051) | `א"ר`, `אבהו`. No unit starts after the quote mark. |
| `אר"ש` (041) | one word: the name sits inside the abbreviation |
| `לקמיה דאביי` | `דאביי` is one word, so the attached prefix is always included |
| `[ר"ח זוידו לה זוודתא]` (136) | `[` is a mark, then `ר"ח` is a word |
| `(אמר ר' אסי)` (011) | `(`, `אמר`, `ר'`, `אסי`, `)` |
| vowelled Rosh Hashanah (031) | each word keeps all its marks, in the source's order |

## Tests on real sources (`tests/test_compact_source_v4_units.py`, 13 tests, all passing)

The fixtures are already in the repo. `quality-210-source-jobs.jsonl.gz` is the frozen 210-trial
shard, sha256 `823e4fb0…`, with 1,046 sources. `paired-source-v3-real.json.gz` holds the 30 matched
jobs and their saved answers. `anchor-prefix-v2-real.json` holds 3 probe answers with known quote
errors.

- **v2 and v3 are unchanged.** Their files match pinned hashes.
- **The fixture is the frozen trial.** Its hash matches, and every source text matches its sha256.
- **The units join back exactly.** For every real source, IDs run 1..n, offsets are contiguous, and
  the JSON unit list survives a round trip.
- **Every word passes v2's whole-word rule:** 23,645 words.
- **Everything compiles through the strict v2 checks.** I built a test answer from every word, plus
  every 2- and 3-word range, of every source. It passes `v2.check`, and every resolved offset
  equals the unit's offset.
- **The known traps behave:** `תרבא`/`רבא` (Rava compiles to occurrence 2), `א"ר אבהו`, Rav in 036
  (occurrence 2, not `רב בית נמרוד`), brackets, parentheses, vowel order, `דאביי`, `ר''ע`, `אר"ש`.
- **Vowelled quotes.** The trial's typed quote is not in the text. The compiled slice is, and it
  equals the typed quote only after NFC normalization.
- **The 15 saved v2 answers that passed:**
  - 143 of 143 people mentions are whole words and compile back to the same quote and occurrence.
  - Of the evidence quotes, 53 are whole words, 2 are part of a word, and 1 covers marks only.
- **The 3 probe answers with errors:**
  - 4 quotes that leave out a prefix get a whole-word range: `ר"ע` becomes `דר"ע`, `ר' יוסי`
    becomes `דר' יוסי`, and `ר' יהושע` becomes `ור' יהושע`.
  - 1 typed quote (`ר' אבהו`) is not in the text at all.
- **Fathers inside one word with the son:** 0 in the 15 saved answers.
- **Bad anchors are refused:** an unknown source, a reversed range, out of range, not an integer,
  starting or ending on a space, an extra `quote` field, or a changed unit table.
- **The unit tables are pinned.** Any change to the splitter needs a new version.
- **Any character survives the JSON unit list,** including `{`, `<`, quotes, backslashes, tabs and
  line separators.

## A local check on the full queues (`sweep.py`, read-only, not in CI)

Results are in `results/name-coverage-v18/compact-source-v4-design/`.

- **Bavli tiles.** 80,365 distinct sources and 1,831,316 words. Every source joins back exactly,
  and no word breaks the v2 rule.
- **Other texts v3.** 45,796 distinct sources and 3,631,634 words.
  - The first version split 43 words at a zero-width joiner in the vowelled Mekhilta. It is fixed:
    format characters now stay inside the word.
  - 8 words still break the v2 rule, for example in Vayikra Rabbah 6:6 and Mishnah Arakhin 8:1. In
    each, a vowel mark sits after a space or an apostrophe. The source text itself is malformed there, and v2
    cannot quote those words either. Proposal: the compiler refuses a range that ends on one of
    them, and the source repair list records them.

## Prompt cost on the fixed 30

v3-none's real prompts average 5,188 tokens per job (155,641 over the 30). The provider's tokenizer
is not available offline. So these estimates use a fit to those 30 real prompt sizes: 0.58 tokens
per Hebrew character. For the added JSON punctuation I assume 0.15 to 0.6 tokens per character.
That range is honest, but it is not an exact count. The numbers are in `token-estimate-matched30.txt`.

| layout | added per job | added tokens per job |
|---|---|---|
| B. source text kept, plus every unit (word, mark, space) as `[id, text]` | 445 Hebrew + 1,905 other chars | +535 to +1,402 (+10% to +27%) |
| C. every unit as `[id, text]`, source text left out of the prompt (still hashed in the job) | 1,739 other chars | +252 to +1,044 (+5% to +20%) |
| G. one unit per word, with the spaces and marks after it folded into its text; source text left out | 877 other chars | +127 to +526 (+2% to +10%) |

**Proposed: G.** Each unit holds the exact text of one word plus what follows it, so the list still
joins back exactly. The compiler takes the word part of the first and last unit for the offsets.
The model sees one number per word, not per space. The prototype currently builds B and C. G needs
only a different shown list, with the same compiler underneath.

**An exact count first.** Before any paid trial, get an exact count: either fetch the published
DeepSeek tokenizer (a download, no model call) or send one counted request. That is root's choice.

## What v4 does not fix

- **Interpretation.** A whole-word quote does not prove the right person or link. The checks for
  misses and false direct or passing-on links are still needed.
- **Wrong unit numbers.** A wrong number gives a valid quote of the wrong word. That failure is
  silent where today's is loud.

  Mitigations:
  - IDs local to each source.
  - A warning, not a failure, when a named person's quote has no letters in common with its label.
  - A source-checked sample in every evaluation.
- **Wide spans.** A range can still take `רב בית נמרוד`. Proposed: warn when a named person's range
  is two or more words longer than the label.
- **A father inside an abbreviation.** Gamliel inside `רשב"ג` cannot get a span of his own. The v2
  rule then rejects two named people on one span, unless the answer links them as alternatives.
  There are 0 such fathers in the 15 saved answers, but the full 210 has not been counted. Root
  decides: keep such a father in the son's reason, or let an embedded father share the son's
  span.
- **Identity.** Which R. Shimon is meant is out of scope.

## Risks

| risk | what would show it | mitigation |
|---|---|---|
| silent wrong-unit anchors | source-checked sample | per-source IDs, a label/quote letter warning, review |
| longer prompts | exact token count | layout G, measure first |
| splitter drift | pinned table hash | the version goes in every binding, and old answers are never re-split |
| malformed source text (8 words) | sweep | refuse those words, and log them for source repair |
| the model types quotes anyway | schema | the schema has no `quote` field, so the answer is refused |
| very long sources (up to 1,056 words, Tanna DeBei Eliyahu Rabbah 4:1) | sweep | numbering stays small in G; cap the source window as now |
| a range crossing sources | compiler | an anchor names one source, and its IDs exist only there |
| occurrence counting differs from v2 | test | every word of 210 jobs resolves through `v2.check` |

## Kept apart from v2 and v3

- A new directory, `compact_source_v4`.
- A new schema version (`compact-source-v4`) and a new recipe hash.
- New run IDs.
- No change to cache keys, importers, production, or the queue adapter until this is approved.
- A test pins the v2 and v3 files byte for byte.

## For root to decide before implementation

1. **The shown list:** B, C or G (G proposed).
2. **Fathers inside an abbreviation:** keep them in the son's reason, or allow a shared span.
3. **How to get the exact token count.**
4. **The evaluation:**
   - Same frozen 30 jobs, same model, same reasoning setting.
   - The arms: v3 plus word-snap repair, against v4.
   - What to measure:
     - anchor validity
     - the rate of wrong-unit anchors on a source-checked sample
     - misses of named people, fathers and real participants
     - false direct and passing-on links, using the same decision files as the matched-30
       comparison
     - prompt and output tokens, and cost
   - When to go further: only if v4 has fewer anchor failures than v3 plus the repair, loses no
     named people or fathers, and stays within the measured cost.

## Files

- `units.py`: the splitter, unit list, binding and compiler. Standard library only.
- `sweep.py`: the full-queue check. It needs the v2 validator, and therefore jsonschema.
- `../tests/test_compact_source_v4_units.py`: the real-source tests.
