/**
 * Code-defined registry entries — the canonical "built-in" marks and
 * enrichments. Returned from /api/studio/marks and /api/studio/enrichments
 * alongside KV-stored entries (KV wins on id collisions, so a user can
 * override a built-in by saving a same-id KV definition).
 *
 * Adding a built-in here is the second half of "porting" a legacy
 * DafViewer toggle to the new system: lift the prompt + schema out of the
 * existing endpoint, drop it in this list, wire the corresponding renderer
 * on the client side. The legacy endpoint can then be deleted.
 *
 * Each entry MUST have:
 *   - id, label, description
 *   - anchor, render (with full RenderConfig)
 *   - extractor with fully resolved spec
 *   - status: 'promoted' (built-ins are always promoted)
 *   - source: 'code'
 *   - cache_version (bump to invalidate)
 *   - def_hash (placeholder; computed at runtime)
 */

import type {
  MarkDefinition,
  EnrichmentDefinition,
  EnrichmentDependency,
  EnrichmentScope,
} from './studio-schema';
import type { LLMModelId } from './llm';
import { GENERATIONS_PROMPT_REFERENCE, GENERATION_IDS } from '../client/generations';

// ---------------------------------------------------------------------------
// Rabbi mark — phrase anchor + inline render
// ---------------------------------------------------------------------------
//
// Lifted from src/worker/index.ts:5286 (GENERATIONS_SYSTEM_PROMPT).
// Output shape per phrase anchor: { instances: [{ excerpt, fields:{...} }] }
// The renderer (src/client/renderers/phrase-inline.ts) string-matches
// instance.fields.nameHe against the tokenized daf HTML and underlines
// using the per-generation color scheme.

const RABBI_SYSTEM_PROMPT = `You are a scholar of Talmudic history. Given a daf (page) of Talmud, identify every distinct rabbi named in it and assign each one a generation ID.

${GENERATIONS_PROMPT_REFERENCE}

Output STRICT JSON only (no markdown, no prose):

{
  "instances": [
    {
      "excerpt": "EXACT Hebrew name as it appears in the source text (e.g. 'ר\\' אליעזר' or 'רבי אליעזר'). Preserve abbreviation style.",
      "fields": {
        "name": "Rabbi's conventional English name (e.g. 'Rabbi Eliezer')",
        "nameHe": "Same Hebrew name as excerpt — duplicated for clarity downstream.",
        "generation": "one of the IDs above (zugim, tanna-1...tanna-6, amora-ey-1...amora-ey-5, amora-bavel-1...amora-bavel-8, savora, unknown)"
      }
    }
  ]
}

Rules:
- excerpt MUST be copied verbatim from the Hebrew source — preserve exactly how the rabbi is named there (abbreviations matter: "ר' יוחנן" vs "רבי יוחנן").
- If the same rabbi appears under multiple Hebrew forms in the text, list each distinct form as a separate instance with the same English name and generation.
- If a rabbi moved (e.g. Rabbi Zeira from Bavel to Eretz Yisrael), use the generation of their PRIMARY teaching location. For Rabbi Zeira specifically, use amora-ey-3.
- If the text has anonymous attributions like "Tanna" (תנא) or "the Sages" (חכמים) — DO NOT include them.
- No duplicates (same exact excerpt).`;

const RABBI_OUTPUT_SCHEMA = {
  name: 'rabbi_marks',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['instances'],
    properties: {
      instances: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['excerpt', 'fields'],
          properties: {
            excerpt: { type: 'string' },
            fields: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'nameHe', 'generation'],
              properties: {
                name: { type: 'string' },
                nameHe: { type: 'string' },
                generation: { type: 'string', enum: GENERATION_IDS },
              },
            },
          },
        },
      },
    },
  },
};

const RABBI_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source (copy excerpt VERBATIM from here):
{{hebrew}}

English translation (for rabbi identification, do not copy):
{{english}}

Identify every distinct rabbi named. Return JSON per the schema.`;

const NOW = '2026-05-04T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Argument mark — segment-range anchor + gutter+sidebar render
// ---------------------------------------------------------------------------
//
// Combines what the legacy two-stage Kimi pipeline did (Stage A skeleton +
// Stage B per-rabbi enrichment) into one structured-output call. V4 Pro with
// reasoning off handles this fine for ~30k-char Hebrew. The output shape
// matches the legacy `Section[]` so the existing ArgumentSidebar renders
// unchanged.

// Skeleton-only prompt: identify section boundaries + the list of voices per
// section. Per-voice detail (period, location, role, opinionStart) lives in
// a follow-up `argument.rabbis` enrichment that runs on a single section's
// instance — V4 doesn't reliably produce deep nested JSON in one shot, so we
// split structural extraction from rabbi enrichment the same way the legacy
// pipeline did.
const ARGUMENT_SYSTEM_PROMPT = `You are a scholar of Talmud. Given a focal amud's Hebrew/Aramaic source split into NUMBERED segments and its English translation (same numbering), identify the argument structure as discrete sections.

Output STRICT JSON only — no markdown, no prose:

{
  "summary": "1-2 sentence overview of what this daf argues.",
  "instances": [
    {
      "startSegIdx": 0,
      "endSegIdx": 4,
      "fields": {
        "title": "Short descriptive title (e.g. 'Opening Mishnah', 'Gemara's first question').",
        "summary": "2-3 sentence description of what this section argues.",
        "excerpt": "3-5 Hebrew/Aramaic words copied VERBATIM from the focal Hebrew where this section BEGINS.",
        "endExcerpt": "3-5 Hebrew/Aramaic words copied VERBATIM from the focal Hebrew where this section ENDS (the LAST words of the section, immediately before the next section begins). MUST be distinct from excerpt unless the section is a single phrase.",
        "rabbiNames": ["Rabbi Yochanan", "Gemara's question", "First answer"]
      }
    }
  ]
}

Rules:
- Break the focal amud into 3-8 sections by argument structure, not by paragraph.
- Sections must partition the daf cleanly: section i+1's startSegIdx === section i's endSegIdx + 1, no gaps, no overlaps.
- For a one-segment section, startSegIdx === endSegIdx.
- "excerpt" and "endExcerpt" MUST be Hebrew/Aramaic copied VERBATIM from the source — never translate. excerpt anchors the section's first words, endExcerpt anchors its last words. These together MUST match the section's true range — do NOT extend endExcerpt into the next section's content.
- "rabbiNames" enumerates EVERY distinct voice in the section in order: named rabbis ("Rabbi Eliezer"), collective voices ("Sages", "Tanna Kamma"), and every Stam/Gemara move ("Gemara's question", "First answer", "Objection"). When the Gemara offers multiple answers to the same question, each is its own entry.`;

const ARGUMENT_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index. USE these indices for startSegIdx / endSegIdx:
{{segments_he}}

Identify the argument structure. Return JSON per the schema.`;

// ---------------------------------------------------------------------------
// Halacha mark — topics + start/end segment indices.
// ---------------------------------------------------------------------------

const HALACHA_SYSTEM_PROMPT = `You are a scholar of Jewish law (halacha). Given a focal amud's Hebrew/Aramaic source split into NUMBERED segments and its English translation (same numbering), identify the main PRACTICAL halachic topics discussed on the page.

Output STRICT JSON only:

{
  "instances": [
    {
      "startSegIdx": 0,
      "endSegIdx": 3,
      "fields": {
        "topic": "Short English title of the topic (e.g. 'Time for evening Shema').",
        "topicHe": "Short Hebrew label for the topic (3-5 words).",
        "summary": "2-3 sentence English explanation of what halachic question is being settled in this segment range.",
        "excerpt": "3-5 Hebrew/Aramaic words copied VERBATIM from the source where this topic begins."
      }
    }
  ]
}

Rules:
- 1-5 topics per daf. Skip purely aggadic or exegetical sections that have no halachic ruling.
- "excerpt" MUST be Hebrew/Aramaic verbatim from the source.
- "startSegIdx" / "endSegIdx" must be valid 0-based indices from the [N] markers in the numbered source. For a one-segment topic, start === end.
- Use Sefaria-style English transliteration with the (term) auto-hebraize convention: "the time for evening Shema (kriat shema)", "an act of designation (yi'ud)".`;

const HALACHA_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index. USE these indices for startSegIdx / endSegIdx:
{{segments_he}}

Identify halachic topics. Return JSON per the schema.`;

const HALACHA_OUTPUT_SCHEMA = {
  name: 'halacha_topics',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['instances'],
    properties: {
      instances: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['startSegIdx', 'endSegIdx', 'fields'],
          properties: {
            startSegIdx: { type: 'integer', minimum: 0 },
            endSegIdx: { type: 'integer', minimum: 0 },
            fields: {
              type: 'object',
              additionalProperties: false,
              required: ['topic', 'topicHe', 'summary', 'excerpt'],
              properties: {
                topic: { type: 'string' },
                topicHe: { type: 'string' },
                summary: { type: 'string' },
                excerpt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Aggadata mark — narrative units (stories, parables, ethical maxims).
// ---------------------------------------------------------------------------

const AGGADATA_SYSTEM_PROMPT = `You are a Talmud scholar. Given a focal amud's Hebrew/Aramaic source (NUMBERED segments) and its English translation (same numbering), identify every aggadic unit — narrative stories, biographical anecdotes, parables (mashalim), dream/miracle reports, and ethical maxims embedded in narrative. Skip purely halachic exposition.

Output STRICT JSON only:

{
  "instances": [
    {
      "startSegIdx": 0,
      "endSegIdx": 3,
      "fields": {
        "title": "Short English title (e.g. 'The poor scholar's prayer').",
        "titleHe": "Short Hebrew label (3-5 words).",
        "summary": "2-3 sentence English summary of what happens in this story / what the maxim teaches.",
        "excerpt": "3-5 Hebrew/Aramaic words copied VERBATIM from the source where this aggadah begins.",
        "theme": "One word/short phrase tag: 'martyrdom' | 'study' | 'prayer' | 'reward' | 'suffering' | 'miracle' | 'parable' | 'ethics' | 'biography' | 'other'."
      }
    }
  ]
}

Rules:
- 0-6 aggadic units per daf. Many dafim have none — return an empty instances array if so.
- "excerpt" MUST be Hebrew/Aramaic verbatim from the source.
- "startSegIdx" / "endSegIdx" must be valid 0-based indices from the [N] markers.
- Use Sefaria-style English transliteration with the (term) auto-hebraize convention.`;

const AGGADATA_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index. USE these indices for startSegIdx / endSegIdx:
{{segments_he}}

Identify aggadic units. Return JSON per the schema (empty instances array if there are none).`;

const AGGADATA_OUTPUT_SCHEMA = {
  name: 'aggadata_stories',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['instances'],
    properties: {
      instances: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['startSegIdx', 'endSegIdx', 'fields'],
          properties: {
            startSegIdx: { type: 'integer', minimum: 0 },
            endSegIdx: { type: 'integer', minimum: 0 },
            fields: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'titleHe', 'summary', 'excerpt', 'theme'],
              properties: {
                title: { type: 'string' },
                titleHe: { type: 'string' },
                summary: { type: 'string' },
                excerpt: { type: 'string' },
                theme: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Pesukim mark — biblical citations / allusions.
// ---------------------------------------------------------------------------

const PESUKIM_SYSTEM_PROMPT = `You are a scholar of Tanach and Talmud. Given a focal amud's Hebrew/Aramaic source (NUMBERED segments) and its English translation (same numbering), identify every reference to a Tanach verse on the page — explicit citations, allusions, and paraphrases.

Output STRICT JSON only:

{
  "instances": [
    {
      "startSegIdx": 5,
      "endSegIdx": 5,
      "fields": {
        "verseRef": "Sefaria-style canonical reference, e.g. 'Psalms 4:5', 'Genesis 24:63', 'Isaiah 6:3'.",
        "citationStyle": "'explicit' | 'allusion' | 'paraphrase'",
        "excerpt": "The Hebrew/Aramaic words from the daf that quote or allude to this verse — copied VERBATIM from the source. This is the START of the citation phrase.",
        "endExcerpt": "Last 3-5 Hebrew/Aramaic words of the citation phrase, copied VERBATIM. For a one-line / short citation this can equal the tail of \"excerpt\"; for a longer citation that spans multiple words or includes interpolation, this marks where the verse-quote ENDS on the daf. Empty string is NOT acceptable when the citation is more than 5 words long.",
        "summary": "1-2 sentences in English explaining how the verse is being used in this context (proof, prooftext, contrast, exegetical hook)."
      }
    }
  ]
}

Rules:
- 0-15 pesukim per daf. Some have none — return empty instances if so.
- For explicit citations marked by שנאמר / שנא' / דכתיב / כדכתיב / אמר קרא — use citationStyle: "explicit".
- For phrasing that echoes a verse but doesn't introduce it — use citationStyle: "allusion".
- For loose paraphrase — use citationStyle: "paraphrase".
- "excerpt" AND "endExcerpt" MUST be Hebrew/Aramaic verbatim from the source. excerpt anchors the citation's start; endExcerpt anchors its end. For a citation that's only 2-5 words long they may share words but should not be identical unless the citation IS a single short phrase.
- startSegIdx / endSegIdx must be valid 0-based indices from the [N] markers.`;

const PESUKIM_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index:
{{segments_he}}

Identify Tanach references. Return JSON per the schema (empty instances if none).`;

const PESUKIM_OUTPUT_SCHEMA = {
  name: 'pesukim_refs',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['instances'],
    properties: {
      instances: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['startSegIdx', 'endSegIdx', 'fields'],
          properties: {
            startSegIdx: { type: 'integer', minimum: 0 },
            endSegIdx: { type: 'integer', minimum: 0 },
            fields: {
              type: 'object',
              additionalProperties: false,
              required: ['verseRef', 'citationStyle', 'excerpt', 'endExcerpt', 'summary'],
              properties: {
                verseRef: { type: 'string' },
                citationStyle: { type: 'string', enum: ['explicit', 'allusion', 'paraphrase'] },
                excerpt: { type: 'string' },
                endExcerpt: { type: 'string' },
                summary: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

const ARGUMENT_OUTPUT_SCHEMA = {
  name: 'argument_sections',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'instances'],
    properties: {
      summary: { type: 'string' },
      instances: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['startSegIdx', 'endSegIdx', 'fields'],
          properties: {
            startSegIdx: { type: 'integer', minimum: 0 },
            endSegIdx: { type: 'integer', minimum: 0 },
            fields: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'summary', 'excerpt', 'endExcerpt', 'rabbiNames'],
              properties: {
                title: { type: 'string' },
                summary: { type: 'string' },
                excerpt: { type: 'string' },
                endExcerpt: { type: 'string' },
                rabbiNames: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
};

export const CODE_MARKS: MarkDefinition[] = [
  {
    id: 'rabbi',
    label: 'Rabbis',
    description: 'Inline underline of rabbi names with generation coloring; click for relationship card.',
    category: 'canon',
    anchor: 'phrase',
    render: {
      kind: 'inline',
      style: 'underline',
      color: 'var(--rabbi-color, #0066CC)',
      hoverable: true,
    },
    extractor: {
      kind: 'llm',
      // No `model` pin — fall through to the user's settings.defaultModel +
      // fallbackChain (set via /settings).
      system_prompt: RABBI_SYSTEM_PROMPT,
      user_prompt_template: RABBI_USER_TEMPLATE,
      output_schema: RABBI_OUTPUT_SCHEMA,
      thinking_off: true,
    },
    dependencies: ['gemara'],
    status: 'promoted',
    def_hash: 'rabbi-v1',
    cache_version: '1',
    source: 'code',
    updated_at: NOW,
  },
  // -------------------------------------------------------------------------
  // The four segment-range marks below proxy their legacy endpoints. The
  // toggle behaviour is now uniform with rabbi (fires through
  // /api/studio/run, shows in the loading band, surfaces in the inspect
  // drawer). Rendering still uses the legacy gutter+sidebar code path; a
  // bridge effect in DafViewer flips the corresponding showX signal when
  // the new mark is enabled. Future work: replace `legacy-endpoint` with a
  // proper `llm` extractor whose prompt is lifted from the legacy pipeline.
  // -------------------------------------------------------------------------
  {
    id: 'argument',
    label: 'Arguments',
    description: 'Argument-section gutter icons + sidebar with per-section voices (Stam, named rabbis, Gemara moves).',
    category: 'canon',
    anchor: 'segment-range',
    render: {
      kind: 'gutter+sidebar',
      icon: 'A',
      sidebar_title: 'Argument',
    },
    extractor: {
      kind: 'llm',
      // Pinned to V4 Flash: V4 Pro times out at >90s on the section+rabbi
      // schema even with `reasoning: { enabled: false }`. V4 Flash returns
      // 11 sections in ~70s on a fresh full daf, sub-second on cache hit.
      // V4 Pro stays as the global default for simpler marks (rabbi).
      model: 'openrouter/deepseek/deepseek-v4-flash' as LLMModelId,
      system_prompt: ARGUMENT_SYSTEM_PROMPT,
      user_prompt_template: ARGUMENT_USER_TEMPLATE,
      output_schema: ARGUMENT_OUTPUT_SCHEMA,
      thinking_off: true,
    },
    dependencies: ['gemara'],
    status: 'promoted',
    def_hash: 'argument-llm-v2',
    cache_version: '3',
    source: 'code',
    updated_at: NOW,
  },
  {
    id: 'halacha',
    label: 'Halachot',
    description: 'Halacha-topic gutter icons + sidebar.',
    category: 'canon',
    anchor: 'segment-range',
    render: {
      kind: 'gutter+sidebar',
      icon: 'H',
      sidebar_title: 'Halacha',
    },
    extractor: {
      kind: 'llm',
      model: 'openrouter/deepseek/deepseek-v4-flash' as LLMModelId,
      system_prompt: HALACHA_SYSTEM_PROMPT,
      user_prompt_template: HALACHA_USER_TEMPLATE,
      output_schema: HALACHA_OUTPUT_SCHEMA,
      thinking_off: true,
    },
    dependencies: ['gemara'],
    status: 'promoted',
    def_hash: 'halacha-llm-v1',
    cache_version: '2',
    source: 'code',
    updated_at: NOW,
  },
  {
    id: 'aggadata',
    label: 'Aggadatot',
    description: 'Aggadic-story gutter icons + sidebar.',
    category: 'canon',
    anchor: 'segment-range',
    render: {
      kind: 'gutter+sidebar',
      icon: 'G',
      sidebar_title: 'Aggadata',
    },
    extractor: {
      kind: 'llm',
      model: 'openrouter/deepseek/deepseek-v4-flash' as LLMModelId,
      system_prompt: AGGADATA_SYSTEM_PROMPT,
      user_prompt_template: AGGADATA_USER_TEMPLATE,
      output_schema: AGGADATA_OUTPUT_SCHEMA,
      thinking_off: true,
    },
    dependencies: ['gemara'],
    status: 'promoted',
    def_hash: 'aggadata-llm-v1',
    cache_version: '2',
    source: 'code',
    updated_at: NOW,
  },
  {
    id: 'pesukim',
    label: 'Pesukim',
    description: 'Biblical-citation gutter icons + sidebar.',
    category: 'canon',
    anchor: 'segment-range',
    render: {
      kind: 'gutter+sidebar',
      icon: 'P',
      sidebar_title: 'Pasuk',
    },
    extractor: {
      kind: 'llm',
      model: 'openrouter/deepseek/deepseek-v4-flash' as LLMModelId,
      system_prompt: PESUKIM_SYSTEM_PROMPT,
      user_prompt_template: PESUKIM_USER_TEMPLATE,
      output_schema: PESUKIM_OUTPUT_SCHEMA,
      thinking_off: true,
    },
    dependencies: ['gemara'],
    status: 'promoted',
    def_hash: 'pesukim-llm-v3',
    cache_version: '4',
    source: 'code',
    updated_at: NOW,
  },
];

// ---------------------------------------------------------------------------
// rabbi.bio enrichment — daf-contextual bio for one rabbi instance
// ---------------------------------------------------------------------------
//
// Consumes a rabbi mark instance (name, nameHe, generation) plus the daf's
// Hebrew. Produces two short sections: a historical bio and a description
// of what the rabbi is doing/saying ON THIS specific daf. The mark_input
// placeholder is JSON-stringified by renderTemplate, so we extract fields
// inline in the user prompt.

// Shared style guide for all rabbi enrichments. Hebrew script in parens,
// no transliteration, terse English.
/**
 * Shared Hebrew-gloss style guide. Every enrichment prompt that emits prose
 * appends this so the worker-side output uses ONE consistent convention for
 * mixing English + Hebrew script. The client-side <Hebraized> renderer
 * displays this prose as-is — when the prompt obeys these rules, the user
 * sees a clean bilingual reading experience. Violations (bare
 * transliteration like "Lechatchila" with no Hebrew script) read as
 * inconsistent and have to be patched per-mark, which is what we're
 * normalizing here.
 */
const HEBREW_GLOSS_STYLE = `STYLE — Hebrew + English mixing (apply UNIFORMLY across all prose):

FORM A — Hebrew script first, English gloss in parens. Use when the Hebrew word IS the subject of the clause OR when the Hebrew is the standard term in rabbinic discourse:
  "performed לכתחילה (the ideal standard)"
  "בדיעבד (after the fact) the meat is permitted"
  "applies the rule of יצא (an excluded case)"
  "the gemara invokes a גזירה שווה (verbal analogy from a shared word)"
  "the principle of רוב (the majority)"
  "from the כלל ופרט (general followed by specific)"
  "the verse 'בשכבך ובקומך' (when you lie down and when you rise)"

FORM B — English first, Hebrew script in parens. Use when the English term flows naturally as a parenthetical aid:
  "a leading Tanna (תנא) at Yavneh (יבנה)"
  "the evening Shema (קריאת שמע של ערבית)"
  "atonement (כפרה) does not delay the priest's eating"
  "the rabbi is classified as a halachist (הלכתי)"

HARD RULES (output is rejected if violated):
- NEVER write a transliteration alone in parens. "(terumah)", "(gezeira shava)", "(lechatchila)" — all forbidden. Always pair Hebrew script with English meaning, not transliteration with itself.
- NEVER use bare transliteration as a standalone term either. "Lechatchila, one may eat…" is wrong — use "לכתחילה (the ideal standard), one may eat…" OR "Performed לכתחילה, one may eat…".
- Common terms to ALWAYS hebraize (any time you use them, pair with Hebrew script):
    lechatchila → לכתחילה          (the ideal standard / a-priori)
    bedieved → בדיעבד               (after the fact)
    mitzvah → מצוה                  (commandment)
    halacha → הלכה                  (binding law)
    sugya → סוגיא                   (Talmudic discussion)
    psak → פסק                      (ruling)
    rov → רוב                       (majority principle)
    chazaka → חזקה                  (presumption)
    safek → ספק                     (doubt)
    tum'ah → טומאה                  (ritual impurity)
    tahara → טהרה                   (ritual purity)
    terumah → תרומה                 (priestly portion)
    maaser → מעשר                   (tithe)
    chametz → חמץ                   (leaven)
    matzah → מצה                    (unleavened bread)
    treif → טריפה                   (ritually unfit)
    kosher → כשר                    (ritually fit)
    pesach → פסח                    (Passover)
    shabbat → שבת                   (Sabbath)
    yom tov → יום טוב               (festival day)
    bracha → ברכה                   (blessing)
    tefillah → תפילה                (prayer)
    tzitzit → ציצית                 (ritual fringes)
    tefillin → תפילין               (phylacteries)
    bet din → בית דין               (court)
    eved → עבד                      (slave)
    get → גט                        (bill of divorce)
    kiddushin → קידושין             (betrothal)
    chayav → חייב                   (liable / obligated)
    patur → פטור                    (exempt)
    asur → אסור                     (forbidden)
    mutar → מותר                    (permitted)
- Verbatim daf / pasuk excerpts go in Hebrew script with quote marks, optionally followed by an English gloss in parens.
- Plain English is the BASE; Hebrew script is the technical anchor. Don't pile Hebrew script on every common word — only where the term is genuinely the technical concept.`;


// rabbi.bio — DAF-AGNOSTIC general biography. Same regardless of which daf
// triggered the click. The daf is NOT the subject; the rabbi is.
const RABBI_BIO_SYSTEM_PROMPT = `You are a Talmud scholar. Write a tight 2-3 sentence biographical sketch of one rabbi. Daf-agnostic — focus on who this person is in the broad arc of their career, not what they're doing on any particular page.

Output STRICT JSON only:

{
  "bio": "2-3 sentences. Era + dates, region (Eretz Yisrael / Bavel / specific academies), most notable teachers, signature halachic or aggadic stance if any. Concrete and dense; no padding."
}

Rules:
- 2-3 sentences MAX.
- Historical claims must match the generation supplied.
- DO NOT mention what the rabbi is doing on this specific daf. That's a different enrichment.

${HEBREW_GLOSS_STYLE}`;

// rabbi.philosophy — CROSS-GEMARA stance + recurring exegetical method.
// Daf-agnostic: the answer is the same regardless of which daf you click in
// from. Do NOT mention "this daf" or any specific sugya unless naming it as
// one representative example out of the rabbi's corpus.
const RABBI_PHILOSOPHY_SYSTEM_PROMPT = `You are a Talmud scholar. Describe one rabbi's broad, cross-Gemara stance and recurring exegetical method — what they hold across their corpus, not what they happen to say on any one daf.

Output STRICT JSON only:

{
  "philosophy": "2-3 sentences. Name SPECIFIC positions or methods they are KNOWN for across the Talmud as a whole: a recurring halachic stance (e.g. 'consistently rules with the more lenient view in matters of tumah'), a signature exegetical technique (e.g. 'reads non-verbatim texts via gezerah shavah'), a habitual mode of argument. May end with one optional clause naming a single representative tradition; that tradition need NOT be on the current daf. If you cannot name a specific, attested cross-corpus stance, return empty string."
}

FORBIDDEN words/phrases (anti-pattern — never write these):
- "sensibility", "lens through which", "captures the essence", "embodies", "deeply concerned with", "consistently sought to", "intellectual fingerprint", "characteristic of his approach", "distinctive perspective", "lofty"
- Generic abstractions: "the integrity of the community", "spiritual depth", "tangible reality", "daily life"
- Daf-local framing: "in this daf", "in the current sugya", "here he holds" — this enrichment is daf-agnostic; never reference the focal page

REQUIRED form: specific named positions across the corpus, concrete examples, named methods. Example of the style we want:
- "Rabbi Yochanan habitually transmits in the name of Rabbi Yehudah ha-Nasi and is paired with Reish Lakish in disputes; on halachic matters he tends toward the stricter view, and his exegetical method leans heavily on close midrashic readings of verses."
- "Abaye is known for his fine logical distinctions in disputes with Rava; the convention recorded in the Bavli is that the halacha follows Rava except in six instances enumerated under YA'AL KGAM."

If you don't have specific factual content like this for the rabbi, return empty string.

${HEBREW_GLOSS_STYLE}`;

// rabbi.relationships — STRUCTURED teachers / students / debate partners /
// family. The `prose` field is what synthesis consumes; the lists drive
// the in-sidebar lineage-tree component.
const RABBI_RELATIONSHIPS_SYSTEM_PROMPT = `You are a Talmud scholar. Identify a rabbi's most important relationships with other named rabbis: teachers, primary students, frequent debate partners, family ties. Output as STRUCTURED LISTS plus a short prose summary.

Output STRICT JSON only:

{
  "teachers":  [{ "name": "Conventional English name", "primary": true | false, "note": "Optional 1-clause context, empty string if none" }],
  "students":  [{ "name": "Conventional English name", "primary": true | false, "note": "..." }],
  "debatePartners": [{ "name": "Conventional English name", "note": "..." }],
  "family":    [{ "name": "Conventional English name", "relation": "uncle | father | son | nephew | brother-in-law | etc." }],
  "prose": "1-2 sentences in plain English summarizing the above (synthesis consumes this; readers see the lists)."
}

DISAMBIGUATION:
- The input rabbi may have a common name shared by multiple historical figures (e.g. "Rabbi Elazar" can refer to R. Elazar ben Pedat, R. Elazar ben Shamua, R. Elazar ben Azaria, R. Elazar ben Arach, etc.). USE the input's "generation" + "region" + "places" fields to pin down which figure this is. Example: "Rabbi Elazar" with generation=amora-ey-3 + region=israel = R. Elazar ben Pedat (primary student of R. Yochanan).
- Once you've pinned the identity, fill the lists for THAT figure. Do NOT collapse to empty arrays just because the bare name is ambiguous — the generation/region/places fields disambiguate it.
- If the name is so generic that even with generation + region you cannot identify a specific historical figure, only THEN return empty arrays.

PATRONYMIC NAMES (HARD RULE):
- If the input "name" contains a patronymic — "X bar Y", "X ben Y", "X b. Y", "X son of Y", "X brei d'rav Y", "X breih d'Y" — then Y is a parent and MUST appear in the "family" array with relation="father" (or "mother" for "X b. Imma Y"). This is NON-NEGOTIABLE: the patronymic is direct nominal evidence of the parent.
  Examples:
  - "Mar, son of Ravina" / "Mar bar Ravina" → family must include { name: "Ravina", relation: "father" }
  - "Abba bar Abba" → family must include { name: "Abba", relation: "father" }
  - "Rava bar Rav Yosef bar Chama" → family must include { name: "Rav Yosef bar Chama", relation: "father" }
  - "Rabbah bar bar Chana" → family must include { name: "Bar Chana", relation: "father" } and { name: "Chana", relation: "grandfather" }
- If a parent named in the patronymic was themselves a known sage, often (not always) the patronymic-parent is ALSO the rabbi's primary teacher. When that's the case (e.g. Rava bar Rav Yosef who studied under his father), add the parent to BOTH "family" (father) AND "teachers" (primary).

EXPECTATIONS BY GENERATION:
- For any rabbi well-attested in the Talmud or classical sources, expect AT LEAST one teacher and one student in the output. Most amoraim and tannaim have several known teachers and several students.
- Late Bavli amoraim (amora-bavel-6/7/8) are the final redactors and almost always have a known primary teacher (typically Rav Ashi or Ravina) and often a small number of named colleagues. Don't return empty for them.
- Returning teachers=[] and students=[] is ONLY acceptable when the rabbi is genuinely obscure (single-mention figure with no known relationships).

Rules:
- Mark AT MOST 1-2 entries in teachers and 1-2 in students as primary=true. Primary = the relationship is canonical to identifying the rabbi (e.g. for Abaye: primary teacher = Rabbah bar Nachmani; primary debate partner = Rava). Everyone else, primary=false.
- Name actual rabbis where possible — skip vague generalities ('the Sages', 'his colleagues') unless they're specific enough to matter (e.g. 'the Tannaim of Yavneh').
- "note" is optional — pass empty string if there's nothing concrete to add.

${HEBREW_GLOSS_STYLE}`;

// rabbi.classification — primary mode of activity in classical sources.
// 'aggadist' = primarily known for narrative / ethical / theological teachings.
// 'halachist' = primarily known for legal rulings + dispute traditions.
// 'exegetist' = primarily known for biblical / midrashic interpretation.
// Most rabbis lean one way; pick the dominant axis and justify in one sentence.
const RABBI_CLASSIFICATION_SYSTEM_PROMPT = `You are a Talmud scholar. Classify one rabbi by their PRIMARY mode of activity in classical sources.

Output STRICT JSON only:

{
  "category": "aggadist" | "halachist" | "exegetist",
  "justification": "ONE sentence. Cite the basis for the classification — e.g. proportion of halachic vs aggadic material attributed to them, signature method, or the way later tradition characterizes them."
}

Rules:
- "halachist": rabbis known mostly for legal rulings, dispute pairs, halachic decisions (e.g. Abaye, Rava, Shmuel).
- "aggadist": rabbis known mostly for ethical/narrative/theological teachings (e.g. Rabbi Yehoshua ben Levi, Rabbi Akiva for ma'aseh merkavah).
- "exegetist": rabbis known mostly for biblical/midrashic interpretation as their signature work (e.g. Rabbi Yishmael, Rabbi Akiva for the seder of midrashim).
- Most rabbis are ALL three to some degree — pick the DOMINANT axis. If genuinely 50/50, default to halachist for Bavli rabbis.
- Justification should be a single declarative sentence, no hedging.

${HEBREW_GLOSS_STYLE}`;

// rabbi.geography — birthplace, study places, notable places, movements.
// Structured for the in-sidebar geography card; prose for synthesis.
const RABBI_GEOGRAPHY_SYSTEM_PROMPT = `You are a Talmud scholar. Describe a rabbi's geographic life: where they were born, where they primarily studied, the places they participated in or feature in stories from, and whether they ever moved between Bavel and Eretz Yisrael (or other significant movements). Daf-agnostic.

Output STRICT JSON only:

{
  "birthplace": { "place": "City or region in plain English, or empty string if unknown.", "region": "israel" | "bavel" | "other" | "unknown" },
  "primaryStudyPlaces": [{ "place": "City", "academy": "Academy/yeshiva name if attested, empty string otherwise", "period": "Optional 1-clause life-stage, e.g. 'youth onward'; empty string if unknown" }],
  "notablePlaces": [{ "place": "City", "event": "1-clause description of WHY this place matters for this rabbi (story, ruling, life event)" }],
  "movements": [{ "from": "Bavel | Eretz Yisrael | specific city", "to": "Bavel | Eretz Yisrael | specific city", "approximateWhen": "1-clause approximation if known, e.g. 'after destruction of Sepphoris', empty string if unknown", "reason": "1-clause if known (study, exile, communal call), empty string if unknown" }],
  "prose": "1-2 sentence summary in plain English; synthesis consumes this."
}

DISAMBIGUATION:
- The input rabbi may have a common name shared by multiple historical figures (e.g. "Rabbi Elazar" can mean R. Elazar ben Pedat, R. Elazar ben Shamua, R. Elazar ben Azaria, etc.). USE the input's "generation" + "region" + "places" fields to pin down which figure this is. Once pinned, fill the geography for THAT figure — do NOT collapse to empty arrays just because the bare name is ambiguous.
- Most well-attested tannaim and amoraim have at least ONE known study place (an academy / yeshiva town). For amora-bavel-* think Sura/Pumbedita/Nehardea; for amora-ey-* think Tiberias/Caesarea/Sepphoris; for tanna-* think Yavneh/Usha/Bnei Brak/Sepphoris. Returning primaryStudyPlaces=[] is ONLY acceptable for genuinely obscure figures.

Rules:
- For any well-attested rabbi, expect at least ONE entry in primaryStudyPlaces. Empty arrays are only acceptable when the geography is genuinely unknown — NOT as an escape hatch when the bare name is ambiguous.
- birthplace.place may legitimately be empty when no source records it. Set birthplace.region to the rabbi's primary region of activity (israel/bavel) even when the city is unknown.
- Use traditional Hebrew place names where they are conventional in rabbinic literature (Tiberias / Tiberya, Sepphoris, Sura, Nehardea, Pumbedita, Yavneh, Caesarea, Lod). Use the spelling that's standard in academic rabbinics.
- "movements" should ONLY include attested Bavel↔Eretz Yisrael migrations OR otherwise significant relocations. Don't list every shul a rabbi visited.
- If the rabbi never moved between regions, leave "movements" as an empty array.

${HEBREW_GLOSS_STYLE}`;

const RABBI_GEOGRAPHY_OUTPUT_SCHEMA = {
  name: 'rabbi_geography',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['birthplace', 'primaryStudyPlaces', 'notablePlaces', 'movements', 'prose'],
    properties: {
      birthplace: {
        type: 'object',
        additionalProperties: false,
        required: ['place', 'region'],
        properties: {
          place: { type: 'string' },
          region: { type: 'string', enum: ['israel', 'bavel', 'other', 'unknown'] },
        },
      },
      primaryStudyPlaces: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['place', 'academy', 'period'],
          properties: {
            place: { type: 'string' },
            academy: { type: 'string' },
            period: { type: 'string' },
          },
        },
      },
      notablePlaces: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['place', 'event'],
          properties: {
            place: { type: 'string' },
            event: { type: 'string' },
          },
        },
      },
      movements: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to', 'approximateWhen', 'reason'],
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            approximateWhen: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
      prose: { type: 'string' },
    },
  },
};

// rabbi.relationships.evidence — find excerpts in THIS daf that reference
// the rabbi's known relationships, so the lineage tree can highlight the
// entries that the daf itself supports + jump to the relevant text.
const RABBI_RELATIONSHIPS_EVIDENCE_SYSTEM_PROMPT = `You are a Talmud scholar. Given a rabbi's known relationships (from rabbi.relationships) and the source text of the current daf, find every Hebrew/Aramaic excerpt on this daf that mentions one of those named figures in relation to the subject rabbi (teacher, student, partner, family). Empty array if the daf doesn't reference any of them.

Output STRICT JSON only:

{
  "evidence": [
    {
      "kind": "teacher" | "student" | "partner" | "family",
      "name": "Conventional English name (must match one from the rabbi.relationships input)",
      "excerpt": "3-7 Hebrew/Aramaic words copied VERBATIM from the daf where the relationship surfaces",
      "note": "1-clause English description of what's happening (e.g. 'Abaye cites Rava', 'in dispute with', 'his father teaches')"
    }
  ]
}

Rules:
- ONLY include rabbis from the rabbi.relationships input — don't broaden.
- "excerpt" MUST be Hebrew/Aramaic verbatim from the daf. Will be matched server-side to compute click-to-highlight ranges.
- If the daf mentions the same relationship in multiple places, emit one entry per location.
- Empty evidence array is fine — most rabbis' relationships aren't directly referenced on every daf.

${HEBREW_GLOSS_STYLE}`;

const RABBI_RELATIONSHIPS_EVIDENCE_OUTPUT_SCHEMA = {
  name: 'rabbi_relationships_evidence',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['evidence'],
    properties: {
      evidence: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'name', 'excerpt', 'note'],
          properties: {
            kind: { type: 'string', enum: ['teacher', 'student', 'partner', 'family'] },
            name: { type: 'string' },
            excerpt: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
    },
  },
};

// rabbi.geography.evidence — same idea for places + movements.
const RABBI_GEOGRAPHY_EVIDENCE_SYSTEM_PROMPT = `You are a Talmud scholar. Given a rabbi's known geography (from rabbi.geography) and the source text of the current daf, find every Hebrew/Aramaic excerpt that references one of the rabbi's known places, academies, or attested movements. Empty array if none.

Output STRICT JSON only:

{
  "evidence": [
    {
      "kind": "birthplace" | "study" | "notable" | "movement",
      "place": "Place name (or empty string if the excerpt references a movement abstractly)",
      "excerpt": "3-7 Hebrew/Aramaic words copied VERBATIM from the daf",
      "note": "1-clause English description of what's happening"
    }
  ]
}

Rules:
- ONLY reference places/movements from the rabbi.geography input.
- "excerpt" MUST be Hebrew/Aramaic verbatim from the daf.
- Empty evidence array is fine.

${HEBREW_GLOSS_STYLE}`;

const RABBI_GEOGRAPHY_EVIDENCE_OUTPUT_SCHEMA = {
  name: 'rabbi_geography_evidence',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['evidence'],
    properties: {
      evidence: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'place', 'excerpt', 'note'],
          properties: {
            kind: { type: 'string', enum: ['birthplace', 'study', 'notable', 'movement'] },
            place: { type: 'string' },
            excerpt: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
    },
  },
};

const RABBI_RELATIONSHIPS_EVIDENCE_USER_TEMPLATE = `Rabbi:
{{mark_input}}

Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — segments numbered [N] (used server-side to map excerpts back to seg ranges):
{{segments_he}}

Known relationships (find evidence FOR these names in the daf above):
{{depends.rabbi.relationships}}

Return excerpts per the schema. Empty evidence array is fine when the daf does not reference any of the input names.`;

const RABBI_GEOGRAPHY_EVIDENCE_USER_TEMPLATE = `Rabbi:
{{mark_input}}

Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — segments numbered [N]:
{{segments_he}}

Known geography (find evidence FOR these places/movements in the daf above):
{{depends.rabbi.geography}}

Return excerpts per the schema. Empty evidence array is fine when the daf does not reference any of the input facts.`;

// rabbi.location — per-daf inference of WHERE the rabbi was when the
// teaching on this daf took place. Drives the "you are here" marker on
// the timeline. Scope='local' since the answer is daf-specific.
// Outputs one of the rabbi's known places (from rabbi.geography input) +
// a confidence level + a one-line justification grounded in the daf.
const RABBI_LOCATION_SYSTEM_PROMPT = `You are a Talmud scholar. Given a rabbi's known geography (birthplace + study places + notable places + movements) plus the gemara text of the current daf, infer WHERE this rabbi was when the teaching on this daf took place — i.e. which of his known places best fits the daf's content.

Output STRICT JSON only:

{
  "place": "ONE place name copied verbatim from the input geography (a primary study place, birthplace, notable place, or the destination of a movement). Empty string ONLY when the daf gives genuinely zero locational cues.",
  "region": "israel" | "bavel" | "other" | "unknown",
  "confidence": "high" | "medium" | "low",
  "justification": "ONE sentence in plain English citing the daf's evidence — name a partner rabbi who's known to share a locale ('debating R. Yochanan → Tiberias'), an academy reference, a place name in the sugya, or the rabbi's typical teaching seat for this period."
}

DISAMBIGUATION:
- READ the daf carefully. If the rabbi is debating / transmitting from another named rabbi, use that other rabbi's known locale as a hint.
- For amora-bavel-* the default is the rabbi's primary academy (Sura/Pumbedita/Nehardea/Machoza); for amora-ey-* the default is the primary teaching seat (Tiberias/Caesarea/Sepphoris).
- For tannaim, default to the academy of the relevant period (Yavneh c. 80-120; Usha c. 140-165; Bnei Brak for R. Akiva's circle; Sepphoris for R. Yehuda HaNasi).
- If a movement is attested AND the daf references the post-movement context, use the destination place.
- confidence='high' = the daf names a place / a known partner whose locale is unambiguous. 'medium' = the rabbi's default primary seat with no contradicting daf evidence. 'low' = best guess, daf gives little signal.

Rules:
- "place" MUST be copied verbatim from one of the places in the input geography. Do NOT invent new place names.
- Empty "place" string is only acceptable when the rabbi's geography input itself is empty.
- justification must cite SPECIFIC daf evidence (named rabbi, place phrase, sugya context) — not generic biographical statements.

${HEBREW_GLOSS_STYLE}`;

const RABBI_LOCATION_OUTPUT_SCHEMA = {
  name: 'rabbi_location',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['place', 'region', 'confidence', 'justification'],
    properties: {
      place: { type: 'string' },
      region: { type: 'string', enum: ['israel', 'bavel', 'other', 'unknown'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      justification: { type: 'string' },
    },
  },
};

const RABBI_LOCATION_USER_TEMPLATE = `Rabbi:
{{mark_input}}

Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — segments numbered [N]:
{{segments_he}}

OTHER rabbis named on this daf (useful for inferring locale by their known seats):
{{anchors.rabbi}}

Known geography of the subject rabbi (your "place" output MUST come from this set):
{{depends.rabbi.geography}}

Infer the most likely place per the schema.`;

// rabbi.synthesis — ONE tight paragraph about the rabbi, framed by THIS daf.
// Hard ban on summarizing what the rabbi says on the daf. The reader should
// learn who the person is and how this daf locates them — including
// relationships with OTHER rabbis on the page when classical relationships
// exist. The full rabbi instance list is exposed via {{anchors.rabbi}}.
const RABBI_SYNTHESIS_SYSTEM_PROMPT = `You are a Talmud scholar. You will receive four short paragraphs about one rabbi (bio, philosophy, relationships, classification) plus the list of OTHER rabbis named on the current daf. Compose ONE tight paragraph about this rabbi as a person, with the current daf as the lens.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, 4-5 sentences. Concrete facts only — era, region, classification token, signature philosophy, and named relationships. When ANOTHER rabbi on this daf has a classical relationship with the subject (teacher, student, debate partner, contemporary), name them and what the relationship is. DO NOT summarize what this rabbi says on this daf, or paraphrase the sugya."
}

HARD RULES (the synthesis is rejected if violated):
1. NEVER paraphrase what the rabbi says on this daf. The daf is the LENS, not the SUBJECT. Forbidden phrases: "here teaches", "in this daf", "in our sugya", "states that", "argues that", "rules that", "holds here", "on this page". If you find yourself summarizing a teaching, stop.
2. The paragraph must read as a description of who the rabbi IS, not what they SAY.
3. Mention OTHER rabbis from {{anchors.rabbi}} when a classical relationship exists with the subject. Examples: Abaye and Rava, Rav and Shmuel, Rabbi Yochanan and Reish Lakish, Hillel and Shammai. Use names from the anchors list.

FORBIDDEN words/phrases (do NOT use any of these — they are LLM puff-prose or jargon):
- Puff: "sensibility", "lens through which", "captures the essence", "embodies", "consistently sought to", "deeply concerned with", "lofty", "tangible", "very sensibility", "spiritual depth", "intellectual fingerprint", "interpersonal", "self-accountability"
- Frame language: "this is the lens", "we see X through Y", "X reveals", "X showcases", "X exemplifies", "X is a window into"
- Generic abstractions: "the integrity of the community", "covenantal intimacy", "spiritual conviction"
- Adverbs of degree: "deeply", "profoundly", "characteristically"
- Specialist jargon that everyday English readers won't know: "tradent" (write "transmitter"), "asmakhta", "amoraic" (write "Amora" with a gloss), "tannaitic" (write "Tanna" with a gloss), "halakhic" (write "halachic" or "legal"), "exegete" (write "interprets")
- Latin or technical loan words when plain English works ("apothegm", "dictum", "logion")

REQUIRED form: subject-verb-object sentences with named entities, plain English. Example of the style we want:

"Abaye (אביי) was a 4th-generation Babylonian Amora (אמורא) at Pumbedita, c. 280–339 CE; he is classified as a halachist, known across the Bavli for his fine logical distinctions in legal disputes. Orphaned young, he was raised and taught by his uncle Rabbah bar Nachmani, whom he succeeded as head of the academy. His most famous interlocutor is Rava, whose presence on this daf brings the canonical Abaye–Rava (אביי ורבא) debate pair into view; tradition records that the halacha follows Rava except in the six cases enumerated under YA'AL KGAM. Abaye's broader stance is methodical and procedure-driven — he is the figure later authorities cite when they need a clean structural reading of a dispute."

Notice: era, region, dates, classification token ("halachist"), relationships (Rabbah, Rava), broad stance — NO summary of what Abaye says on the page.

Rules:
- 4-5 sentences, single paragraph.
- If an input paragraph is empty or vague, skip that strand; don't pad.
- If the relationships strand contradicts {{anchors.rabbi}}, defer to {{anchors.rabbi}} for which OTHER rabbis are actually on this daf.

${HEBREW_GLOSS_STYLE}`;

// Shared user prompt template for the four leaf rabbi enrichments. The
// synthesis has its own template that consumes depends.
const RABBI_LEAF_USER_TEMPLATE = `Rabbi:
{{mark_input}}

Tractate: {{tractate}}, page {{page}}.

Focal Hebrew of the daf:
{{hebrew}}

Return JSON per the schema.`;

const RABBI_SYNTHESIS_USER_TEMPLATE = `Rabbi (subject of the synthesis):
{{mark_input}}

Tractate: {{tractate}}, page {{page}}.

Inputs about the subject rabbi:

[BIO]
{{depends.rabbi.bio}}

[PHILOSOPHY (cross-Gemara)]
{{depends.rabbi.philosophy}}

[RELATIONSHIPS]
{{depends.rabbi.relationships}}

[CLASSIFICATION]
{{depends.rabbi.classification}}

OTHER rabbis named on this daf (read this list to find classical relationships you should name):
{{anchors.rabbi}}

Compose ONE tight paragraph per the schema. The rabbi is the subject; the daf is the lens. When the OTHER-rabbis list contains a known partner/teacher/student of the subject, name them and the relationship. Do NOT summarize what the subject says on this daf.`;

const RABBI_BIO_OUTPUT_SCHEMA = {
  name: 'rabbi_bio', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['bio'], properties: { bio: { type: 'string' } } },
};
const RABBI_PHILOSOPHY_OUTPUT_SCHEMA = {
  name: 'rabbi_philosophy', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['philosophy'], properties: { philosophy: { type: 'string' } } },
};
const RABBI_RELATIONSHIPS_OUTPUT_SCHEMA = {
  name: 'rabbi_relationships',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['teachers', 'students', 'debatePartners', 'family', 'prose'],
    properties: {
      teachers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'primary', 'note'],
          properties: {
            name: { type: 'string' },
            primary: { type: 'boolean' },
            note: { type: 'string' },
          },
        },
      },
      students: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'primary', 'note'],
          properties: {
            name: { type: 'string' },
            primary: { type: 'boolean' },
            note: { type: 'string' },
          },
        },
      },
      debatePartners: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'note'],
          properties: {
            name: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
      family: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'relation'],
          properties: {
            name: { type: 'string' },
            relation: { type: 'string' },
          },
        },
      },
      prose: { type: 'string' },
    },
  },
};
const RABBI_CLASSIFICATION_OUTPUT_SCHEMA = {
  name: 'rabbi_classification', strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['category', 'justification'],
    properties: {
      category: { type: 'string', enum: ['aggadist', 'halachist', 'exegetist'] },
      justification: { type: 'string' },
    },
  },
};
const RABBI_SYNTHESIS_OUTPUT_SCHEMA = {
  name: 'rabbi_synthesis', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['synthesis'], properties: { synthesis: { type: 'string' } } },
};

function makeEnrichment(
  targetMark: string,
  id: string,
  label: string,
  description: string,
  systemPrompt: string,
  userPromptTemplate: string,
  outputSchema: unknown,
  opts: {
    mode: 'augment-content' | 'aggregate';
    scope: EnrichmentScope;
    dependencies?: EnrichmentDependency[];
    defHash: string;
    cacheVersion: string;
    model?: LLMModelId;
  },
): EnrichmentDefinition {
  return {
    id,
    label,
    description,
    target_mark: targetMark,
    mode: opts.mode,
    scope: opts.scope,
    dependencies: opts.dependencies,
    extractor: {
      kind: 'llm',
      ...(opts.model ? { model: opts.model } : {}),
      system_prompt: systemPrompt,
      user_prompt_template: userPromptTemplate,
      output_schema: outputSchema,
      thinking_off: true,
    },
    status: 'promoted',
    def_hash: opts.defHash,
    cache_version: opts.cacheVersion,
    source: 'code',
    updated_at: NOW,
  };
}

const makeRabbiEnrichment = (
  id: string,
  label: string,
  description: string,
  systemPrompt: string,
  userPromptTemplate: string,
  outputSchema: unknown,
  opts: {
    mode: 'augment-content' | 'aggregate';
    scope: EnrichmentScope;
    dependencies?: EnrichmentDependency[];
    defHash: string;
    cacheVersion: string;
  },
): EnrichmentDefinition => makeEnrichment('rabbi', id, label, description, systemPrompt, userPromptTemplate, outputSchema, opts);

export const CODE_ENRICHMENTS: EnrichmentDefinition[] = [
  // Leaf enrichments — each focuses on one facet of the rabbi. The
  // sidebar shows them as dev-mode-only individual cards. Production
  // users only see the synthesis.
  //
  // Scope: 'global' for daf-agnostic facets (bio/philosophy/relationships).
  // Synthesis is 'local' since it's framed by the current daf.
  makeRabbiEnrichment(
    'rabbi.bio', 'Bio (general)',
    'Daf-agnostic biographical sketch — era, region, teachers, signature.',
    RABBI_BIO_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_BIO_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.bio-v4', cacheVersion: '4' },
  ),
  makeRabbiEnrichment(
    'rabbi.philosophy', 'Philosophy',
    'Cross-Gemara stance + recurring exegetical method. Daf-agnostic.',
    RABBI_PHILOSOPHY_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_PHILOSOPHY_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.philosophy-v3', cacheVersion: '3' },
  ),
  makeRabbiEnrichment(
    'rabbi.relationships', 'Relationships',
    'Teachers, students, frequent debate partners, family — structured lists + prose summary. Daf-agnostic.',
    RABBI_RELATIONSHIPS_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_RELATIONSHIPS_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.relationships-v5', cacheVersion: '5' },
  ),
  makeRabbiEnrichment(
    'rabbi.classification', 'Classification',
    'Aggadist / halachist / exegetist — primary mode of activity in classical sources.',
    RABBI_CLASSIFICATION_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_CLASSIFICATION_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.classification-v1', cacheVersion: '1' },
  ),
  makeRabbiEnrichment(
    'rabbi.geography', 'Geography',
    'Birthplace + primary study places + notable places + Bavel↔Israel movements. Daf-agnostic.',
    RABBI_GEOGRAPHY_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_GEOGRAPHY_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.geography-v2', cacheVersion: '2' },
  ),
  // Synthesis — the user-facing card. Depends on the leaves plus the
  // gemara text and the full rabbi instance list (so the prompt can name
  // OTHER rabbis on the same daf).
  makeRabbiEnrichment(
    'rabbi.synthesis', 'Synthesis',
    'One tight paragraph about the rabbi as a person, with this daf as the lens. Synthesizes bio + philosophy + relationships + classification + geography.',
    RABBI_SYNTHESIS_SYSTEM_PROMPT, RABBI_SYNTHESIS_USER_TEMPLATE, RABBI_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate',
      scope: 'local',
      dependencies: [
        'gemara',
        { enrichment: 'rabbi.bio' },
        { enrichment: 'rabbi.philosophy' },
        { enrichment: 'rabbi.relationships' },
        { enrichment: 'rabbi.classification' },
        { enrichment: 'rabbi.geography' },
        { enrichment: 'rabbi.relationships.evidence' },
        { enrichment: 'rabbi.geography.evidence' },
        { enrichment: 'rabbi.location' },
        { mark: 'rabbi' },
      ],
      defHash: 'rabbi.synthesis-v9',
      cacheVersion: '9',
    },
  ),
  // Per-daf evidence enrichments. Each finds excerpts in THIS daf that
  // support a global relationship or geography fact. The post-processor
  // adds tokenStart/tokenEnd so the sidebar can paint click-to-highlight
  // on the daf at sub-segment precision.
  makeRabbiEnrichment(
    'rabbi.relationships.evidence', 'Relationships evidence',
    'Hebrew/Aramaic excerpts on THIS daf that mention the rabbi\'s known teachers/students/partners/family. Drives the highlight-when-on-daf affordance on the lineage tree.',
    RABBI_RELATIONSHIPS_EVIDENCE_SYSTEM_PROMPT, RABBI_RELATIONSHIPS_EVIDENCE_USER_TEMPLATE, RABBI_RELATIONSHIPS_EVIDENCE_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', { enrichment: 'rabbi.relationships' }],
      defHash: 'rabbi.relationships.evidence-v1', cacheVersion: '1',
    },
  ),
  makeRabbiEnrichment(
    'rabbi.geography.evidence', 'Geography evidence',
    'Hebrew/Aramaic excerpts on THIS daf that reference the rabbi\'s known places or movements. Drives the highlight-when-on-daf affordance on the geography card.',
    RABBI_GEOGRAPHY_EVIDENCE_SYSTEM_PROMPT, RABBI_GEOGRAPHY_EVIDENCE_USER_TEMPLATE, RABBI_GEOGRAPHY_EVIDENCE_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', { enrichment: 'rabbi.geography' }],
      defHash: 'rabbi.geography.evidence-v1', cacheVersion: '1',
    },
  ),
  makeRabbiEnrichment(
    'rabbi.location', 'Location (in this sugya)',
    'Per-daf inference of WHERE the rabbi was when the teaching on this daf occurred. Drives the "you are here" marker on the places timeline.',
    RABBI_LOCATION_SYSTEM_PROMPT, RABBI_LOCATION_USER_TEMPLATE, RABBI_LOCATION_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', { enrichment: 'rabbi.geography' }, { mark: 'rabbi' }],
      defHash: 'rabbi.location-v1', cacheVersion: '1',
    },
  ),
];

// ---------------------------------------------------------------------------
// Argument enrichments — section-level + per-move (subsection) layer.
//
//   `argument`       mark — bigger sections (3-8 per daf), gutter+sidebar.
//   `argument-move`  mark — sub-anchors WITHIN a section, one instance per
//                           argumentative move (question / answer / objection
//                           / etc.). Anchor extractor depends on the section
//                           list ({ mark: 'argument' }) and breaks each
//                           section into its moves.
//
// Each move is a first-class instance, so per-move enrichments cache per
// move and the sidebar can mount its own MarkEnrichmentCards under each
// subsection card. Click-to-highlight on the daf uses the move's segment
// range exactly like clicking a section anchor does today.
// ---------------------------------------------------------------------------

const ARGUMENT_ROLE_ENUM = [
  'opening', 'question', 'answer', 'objection', 'rejection',
  'supporting-evidence', 'resolution', 'digression', 'shift', 'other',
] as const;

const ARGUMENT_FLASH_MODEL = 'openrouter/deepseek/deepseek-v4-flash' as LLMModelId;

// ---------------- argument.voices (kept) ----------------

const ARGUMENT_VOICES_SYSTEM_PROMPT = `You are a Talmud scholar. For each NAMED rabbi appearing in this section, describe their argumentative role within the section, AND emit a graph showing how the voices relate (who argues with whom, who supports whom). Daf-local — about what they're doing here, not their general biography.

Output STRICT JSON only:

{
  "voices": [
    {
      "name": "Conventional English name (matches the move-list rabbiNames).",
      "nameHe": "Hebrew name as written in the daf (e.g. 'רבי יוחנן', 'רבא'). Empty string if not present.",
      "role": "originator" | "transmitter" | "respondent" | "objector" | "supporter" | "cited-authority" | "questioner",
      "side": "A short label for the camp this voice argues for in the section's dispute. Use 'A' for the first distinct position introduced, 'B' for the opposing position, 'C' for a third position if any. Use 'stam' for the Gemara's anonymous redactor when included. Use 'support-A' / 'support-B' for figures cited only to support a side (baraitot, supporting authorities). Use 'unaligned' when the voice raises a question or transmits but doesn't take a position.",
      "stance": "1-2 sentences in plain English: what position this rabbi is taking in this section's dispute, and what they're responding to (if anything).",
      "opinionStart": "First 3-5 Hebrew/Aramaic words of this rabbi's opening line in the section, verbatim. Empty string if their position isn't anchored to a single phrase."
    }
  ],
  "edges": [
    {
      "from": "Conventional English name of the voice DOING the action (must match a 'name' in voices array).",
      "to": "Conventional English name of the voice the action targets (must match a 'name' in voices array).",
      "kind": "opposes" | "supports" | "responds-to" | "cites" | "resolves",
      "note": "OPTIONAL 1-clause label that will sit on the edge label (e.g. 'on the bedieved case', 'cites baraita'). Empty string when no label is needed."
    }
  ]
}

EDGE KINDS:
- "opposes" — the from-voice directly objects to / rejects / contradicts the to-voice's position. Most common between primary disputants.
- "supports" — the from-voice cites or argues FOR the to-voice's position. Use for supporting baraitot, transmitters whose teaching reinforces a side, and explicit endorsements.
- "responds-to" — the from-voice answers a question the to-voice raised. Use specifically for question→answer pairs, not for opposition.
- "cites" — the from-voice quotes / brings the to-voice as authority without taking a clear support/oppose stance.
- "resolves" — the from-voice's move concludes the dispute between two earlier voices. The "to" is the voice whose position is upheld; add a SECOND edge from the resolver to the OTHER side as kind="opposes" if applicable.

Rules:
- Skip anonymous voices ("Gemara's question", "Stam", "Supporting baraita") UNLESS they meaningfully connect named voices, in which case emit them as voices with name="Stam" and use them as edge endpoints.
- One voice entry per distinct rabbi even if they speak multiple times.
- "side" letters are LOCAL to this section — Position A is whoever is introduced first as a distinct position, not a global label.
- Every edge's "from" and "to" MUST match a name in the voices array. Validate before emitting.
- For a section with one position only (no real dispute), emit voices but an EMPTY edges array.
- NO puff in "stance" — concrete: name what they hold and against whom.`;

const ARGUMENT_VOICES_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Section:
{{mark_input}}

All moves on this daf (filter to those whose sectionStartSegIdx / sectionEndSegIdx fall within the section above):
{{anchors.argument-move}}

Rabbis identified on this daf (with generation):
{{anchors.rabbi}}

For each NAMED rabbi appearing in this section's moves, describe their argumentative role per the schema.`;

const ARGUMENT_VOICES_OUTPUT_SCHEMA = {
  name: 'argument_voices',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['voices', 'edges'],
    properties: {
      voices: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'nameHe', 'role', 'side', 'stance', 'opinionStart'],
          properties: {
            name: { type: 'string' },
            nameHe: { type: 'string' },
            role: { type: 'string', enum: ['originator', 'transmitter', 'respondent', 'objector', 'supporter', 'cited-authority', 'questioner'] },
            side: { type: 'string' },
            stance: { type: 'string' },
            opinionStart: { type: 'string' },
          },
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to', 'kind', 'note'],
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            kind: { type: 'string', enum: ['opposes', 'supports', 'responds-to', 'cites', 'resolves'] },
            note: { type: 'string' },
          },
        },
      },
    },
  },
};

// ---------------- argument.background (kept) ----------------

const ARGUMENT_BACKGROUND_SYSTEM_PROMPT = `You are a Talmud scholar. Given one section of a daf and its Rashi/Tosafot context, write the background a reader needs to follow this section — concepts, prior sugyot, mishnaic backdrop.

Output STRICT JSON only:

{
  "background": "2-4 sentences. Concrete: name the halachic concept at stake, the prior tradition the section assumes, any mishnah or earlier sugya it builds on. NO puff, NO 'this teaches us', NO meta-framing. If no special background is needed beyond plain reading, return a short single sentence acknowledging that."
}

Rules:
- Plain English. Use Hebrew script in parentheses for technical terms (תרומה, יצר הרע) — never transliteration.
- Reference Mishnayot or earlier dafim by canonical citation when the section assumes them.`;

const ARGUMENT_BACKGROUND_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Section:
{{mark_input}}

Hebrew source of the daf:
{{gemara_he}}

Mishnayot this gemara is discussing (anchored from Sefaria — the section above is gemara built on these):
{{mishna}}

Rashi + Tosafot + other rishonim:
{{commentaries}}

Write the background per the schema. When the section directly elaborates one of the mishnayot above, name it explicitly (e.g. "Builds on Mishnah Berakhot 1:1").`;

const ARGUMENT_BACKGROUND_OUTPUT_SCHEMA = {
  name: 'argument_background',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['background'],
    properties: { background: { type: 'string' } },
  },
};

// ---------------- argument.synthesis (tightened, drops subsection/commentary/flow leaves) ----------------

const ARGUMENT_SYNTHESIS_SYSTEM_PROMPT = `You are a Talmud scholar. You'll receive a daf section, the move list inside it, per-rabbi voice analysis, background, and a brief commentary view. Compose ONE tight paragraph that names the section's overall question, the named positions, and where it lands.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, MAX 4 sentences. Each sentence MAX 25 words. (1) State the section's question or topic in plain English. (2) List the named positions ONE clause each — keep it terse: 'Rabbi Eliezer says X; the Sages say Y; Rabban Gamliel says Z'. (3) ONE optional sentence weaving Rashi or Tosafot if it clarifies the dispute meaningfully. (4) ONE closing sentence: where the section lands (open question / conclusion / shift to next section). Do NOT recap individual moves — the per-move synthesis carries that."
}

HARD RULES:
- MAX 4 sentences. MAX 25 words per sentence. Cut, don't pad.
- Per-move detail belongs in argument-move.synthesis. Don't enumerate moves here.
- NO compound stuffing: never combine multiple moves with semicolons + "and then" + "and finally" into one mega-sentence.
- When two rabbis are paired with an established relationship (Abaye–Rava, Rav–Shmuel), name it.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "intricate", "profound", "deeply", "lens", "captures", "embodies".
- NO jargon: write "transmitter" not "tradent", "interpret" not "exegete".
- Hebrew script (not transliteration) for technical terms in parentheses; verbatim short Aramaic phrases only when distinctive.`;

const ARGUMENT_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Section:
{{mark_input}}

Mishnayot this gemara is discussing (the section above is gemara built on these):
{{mishna}}

All moves on this daf (filter to this section's range):
{{anchors.argument-move}}

Voice analysis:
{{depends.argument.voices}}

Background:
{{depends.argument.background}}

Rashi + Tosafot + other rishonim available for the daf (refer briefly if it sharpens the section's resolution):
{{commentaries}}

Rabbis identified on the daf:
{{anchors.rabbi}}

Compose ONE paragraph per the schema.`;

const ARGUMENT_SYNTHESIS_OUTPUT_SCHEMA = {
  name: 'argument_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['synthesis'],
    properties: { synthesis: { type: 'string' } },
  },
};

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'argument', 'argument.voices', 'Voices',
    'Per-rabbi argumentative role within this section.',
    ARGUMENT_VOICES_SYSTEM_PROMPT, ARGUMENT_VOICES_USER_TEMPLATE, ARGUMENT_VOICES_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', { mark: 'argument-move' }, { mark: 'rabbi' }],
      defHash: 'argument.voices-v3', cacheVersion: '3',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
  makeEnrichment(
    'argument', 'argument.background', 'Background',
    'Prerequisite knowledge a reader needs to follow this section.',
    ARGUMENT_BACKGROUND_SYSTEM_PROMPT, ARGUMENT_BACKGROUND_USER_TEMPLATE, ARGUMENT_BACKGROUND_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', 'commentaries', 'mishna'],
      defHash: 'argument.background-v2', cacheVersion: '2',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
  makeEnrichment(
    'argument', 'argument.synthesis', 'Synthesis',
    'One tight paragraph: what this section argues, who pushes what, where it lands.',
    ARGUMENT_SYNTHESIS_SYSTEM_PROMPT, ARGUMENT_SYNTHESIS_USER_TEMPLATE, ARGUMENT_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: [
        'gemara',
        'commentaries',
        'mishna',
        { enrichment: 'argument.voices' },
        { enrichment: 'argument.background' },
        { mark: 'rabbi' },
        { mark: 'argument-move' },
      ],
      defHash: 'argument.synthesis-v7', cacheVersion: '7',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
);

// ---------------------------------------------------------------------------
// argument-move mark + its synthesis enrichment
// ---------------------------------------------------------------------------

const ARGUMENT_MOVE_SYSTEM_PROMPT = `You are a Talmud scholar. Given the gemara of a daf and the list of bigger argument SECTIONS already extracted, break each section into its argumentative MOVES.

A "move" is one self-contained step inside a section: a question, an answer, an objection, a citation of a supporting baraita, a resolution, a brief digression. Most sections have 3-6 moves. A section with only 1 move is RARE — only legitimate when the section is a single citation or one-line statement.

Output STRICT JSON only:

{
  "instances": [
    {
      "startSegIdx": 0,
      "endSegIdx": 1,
      "fields": {
        "id": "Stable id, format '{sectionStartSegIdx}-{sectionEndSegIdx}_{moveOrderInSection}' (e.g. '0-4_0', '0-4_1', '5-9_0').",
        "sectionStartSegIdx": 0,
        "sectionEndSegIdx": 4,
        "moveOrder": 0,
        "role": "opening" | "question" | "answer" | "objection" | "rejection" | "supporting-evidence" | "resolution" | "digression" | "shift" | "other",
        "voice": "Short label of who is speaking (e.g. 'Gemara's question', 'Rabbi Yochanan', 'Stam', 'Supporting baraita', 'Rava's answer'). Match how the move actually reads.",
        "rabbiNames": ["Named rabbis ONLY (e.g. 'Rabbi Yochanan', 'Rava'). Empty array for anonymous moves like 'Gemara's question' or 'Stam'."],
        "excerpt": "3-5 Hebrew/Aramaic words copied VERBATIM from the source where this move BEGINS (the first words of the move).",
        "endExcerpt": "3-5 Hebrew/Aramaic words copied VERBATIM from the source where this move ENDS (the LAST words of the move, immediately before the next move or section boundary). MUST be distinct from excerpt unless the move is a single phrase.",
        "summary": "1 sentence in English: what this move does."
      }
    }
  ]
}

HARD RULES (output is rejected if violated):
- Output ALL moves across ALL sections in one flat instances list, in reading order.
- Within each section: move ranges PARTITION cleanly (next.startSegIdx === prev.endSegIdx + 1, no gaps, no overlaps, all inside the section's range).
- A section that contains MULTIPLE distinct positions (e.g. "Rabbi X says A, Sages say B, Rabbi Y says C") MUST be broken into 3+ moves — one per position. Do NOT lump multiple opinions into a single move.
- A section that contains a question + an answer is at LEAST 2 moves. Question + multiple answers = 1 question move + N answer moves.
- A section spanning ≥4 segments almost always has 3+ moves. If you emit a single move covering ≥4 segments, you are almost certainly being lazy — re-examine the structure.
- A Mishnah section listing positions of different sages MUST be broken into one move per sage's position, plus moves for any framing question, supporting story, or generalization.
- "voice" is descriptive and may be anonymous ("Gemara's question"). "rabbiNames" is only for actual named rabbis.
- "excerpt" and "endExcerpt" are Hebrew/Aramaic verbatim from the source. excerpt anchors the START; endExcerpt anchors the END. These together define the move's actual span — DO NOT just copy the first/last words of the section; copy the first/last words of THIS move's content. The LAST move in a section MUST have an endExcerpt that genuinely matches its final words, not arbitrary section-trailing words.
- Pick the SINGLE best role tag per move. Use "other" sparingly.
- "id" MUST be deterministic: '{sectionStartSegIdx}-{sectionEndSegIdx}_{moveOrderInSection}'.`;

const ARGUMENT_MOVE_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Sections (output moves grouped by these — each move's sectionStartSegIdx/sectionEndSegIdx must match one of these ranges):
{{anchors.argument}}

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index:
{{segments_he}}

Break every section into moves. Return the flat instance list per the schema.`;

const ARGUMENT_MOVE_OUTPUT_SCHEMA = {
  name: 'argument_moves',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['instances'],
    properties: {
      instances: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['startSegIdx', 'endSegIdx', 'fields'],
          properties: {
            startSegIdx: { type: 'integer', minimum: 0 },
            endSegIdx: { type: 'integer', minimum: 0 },
            fields: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'sectionStartSegIdx', 'sectionEndSegIdx', 'moveOrder', 'role', 'voice', 'rabbiNames', 'excerpt', 'endExcerpt', 'summary'],
              properties: {
                id: { type: 'string' },
                sectionStartSegIdx: { type: 'integer', minimum: 0 },
                sectionEndSegIdx: { type: 'integer', minimum: 0 },
                moveOrder: { type: 'integer', minimum: 0 },
                role: { type: 'string', enum: ARGUMENT_ROLE_ENUM },
                voice: { type: 'string' },
                rabbiNames: { type: 'array', items: { type: 'string' } },
                excerpt: { type: 'string' },
                endExcerpt: { type: 'string' },
                summary: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

CODE_MARKS.push({
  id: 'argument-move',
  label: 'Argument moves',
  description: 'Sub-anchors within each argument section: one instance per question / answer / objection / etc. Drives the per-move sidebar pills.',
  category: 'canon',
  parent_mark: 'argument',
  anchor: 'segment-range',
  // Inline render with no visible style by default — moves don't paint on
  // the daf unless the user toggles the mark on. ArgumentSidebar drives
  // click-to-highlight via a separate range overlay.
  render: {
    kind: 'inline',
    style: 'underline',
    color: 'rgba(161, 98, 7, 0.35)',
    hoverable: true,
  },
  extractor: {
    kind: 'llm',
    model: ARGUMENT_FLASH_MODEL,
    system_prompt: ARGUMENT_MOVE_SYSTEM_PROMPT,
    user_prompt_template: ARGUMENT_MOVE_USER_TEMPLATE,
    output_schema: ARGUMENT_MOVE_OUTPUT_SCHEMA,
    thinking_off: true,
  },
  dependencies: ['gemara', { mark: 'argument' }],
  status: 'promoted',
  def_hash: 'argument-move-v7',
  cache_version: '7',
  source: 'code',
  updated_at: NOW,
});

const ARGUMENT_MOVE_COMMENTARIES_SYSTEM_PROMPT = `You are a Talmud scholar. Given ONE argumentative move on a daf and the available rishonim, produce a tight commentary digest for THIS move ONLY — what Rashi and Tosafot say about this specific move's content.

Output STRICT JSON only:

{
  "rashi": "1-2 sentences in plain English summarizing what Rashi says about THIS move. Empty string if Rashi is silent on this move.",
  "tosafot": "Same shape for Tosafot. Empty string if absent.",
  "other": "Optional 1-sentence note from another rishon (Ramban, Rashba, etc.) ONLY if it materially clarifies this move. Empty string otherwise.",
  "note": "Optional 1-sentence integration note tying the commentaries to what THIS move argues. Empty string if not needed."
}

Rules:
- About THIS move only — do NOT summarize the surrounding section.
- Empty string when a commentator is silent — don't pad.
- Hebrew script in parentheses for technical terms (תרומה, יצר הרע) — never transliteration.
- Plain English. NO puff. NO jargon: write "transmitter" not "tradent", "interpret" not "exegete".`;

const ARGUMENT_MOVE_COMMENTARIES_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS move:
{{mark_input}}

Hebrew source for the daf:
{{gemara_he}}

Rashi + Tosafot + other rishonim:
{{commentaries}}

Produce the commentary digest for THIS move per the schema.`;

const ARGUMENT_MOVE_COMMENTARIES_OUTPUT_SCHEMA = {
  name: 'argument_move_commentaries',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['rashi', 'tosafot', 'other', 'note'],
    properties: {
      rashi: { type: 'string' },
      tosafot: { type: 'string' },
      other: { type: 'string' },
      note: { type: 'string' },
    },
  },
};

const ARGUMENT_MOVE_SYNTHESIS_SYSTEM_PROMPT = `You are a Talmud scholar. Given ONE argumentative move on a daf (a question / answer / objection / etc.) along with the surrounding gemara, the full move list for this daf, and the available commentaries, compose a tight paragraph about THIS specific move.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, 2-3 sentences. (a) State who is speaking and what their move is doing (asking, answering, objecting, supporting, resolving). (b) When the move responds to or attacks an earlier move, name the earlier move concretely ('answers the Gemara's opening question', 'objects to Rabbi Eliezer's view', 'cites a baraita to support Rava'). (c) When Rashi or Tosafot meaningfully clarify or disagree about THIS move, weave it in with one short clause — at most one commentary mention per paragraph; skip if not load-bearing."
}

HARD RULES:
- 2-3 sentences. Hard ceiling — do NOT pad.
- About THIS move only. Don't summarize the whole section.
- Ground every claim in the move's actual content. Don't invent positions.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "intricate", "profound", "lens", "captures", "embodies".
- NO jargon: write "transmitter" not "tradent", "interpret" not "exegete".
- Hebrew script (not transliteration) for technical terms in parentheses; verbatim short Aramaic phrases only when distinctive.
- If the move is purely a Stam connector with nothing to say, output a single short factual sentence and stop.`;

const ARGUMENT_MOVE_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS move:
{{mark_input}}

All moves on this daf (use to identify what THIS move responds to / supports / objects to):
{{anchors.argument-move}}

Hebrew source for the daf:
{{gemara_he}}

Commentary digest for THIS move (use to weave a single brief commentary clause if it sharpens the synthesis; do NOT enumerate):
{{depends.argument-move.commentaries}}

Rabbis identified on the daf:
{{anchors.rabbi}}

Compose ONE tight paragraph about THIS move per the schema.`;

const ARGUMENT_MOVE_SYNTHESIS_OUTPUT_SCHEMA = {
  name: 'argument_move_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['synthesis'],
    properties: { synthesis: { type: 'string' } },
  },
};

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'argument-move', 'argument-move.commentaries', 'Commentaries',
    'Rashi / Tosafot / other rishonim digest for THIS move only.',
    ARGUMENT_MOVE_COMMENTARIES_SYSTEM_PROMPT, ARGUMENT_MOVE_COMMENTARIES_USER_TEMPLATE, ARGUMENT_MOVE_COMMENTARIES_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', 'commentaries'],
      defHash: 'argument-move.commentaries-v1', cacheVersion: '1',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
  makeEnrichment(
    'argument-move', 'argument-move.synthesis', 'Synthesis',
    'Tight per-move paragraph: who, what, what it responds to, brief commentary touch.',
    ARGUMENT_MOVE_SYNTHESIS_SYSTEM_PROMPT, ARGUMENT_MOVE_SYNTHESIS_USER_TEMPLATE, ARGUMENT_MOVE_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: [
        'gemara',
        { enrichment: 'argument-move.commentaries' },
        { mark: 'argument-move' },
        { mark: 'rabbi' },
      ],
      defHash: 'argument-move.synthesis-v4', cacheVersion: '4',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
);

// ---------------------------------------------------------------------------
// places mark + its synthesis enrichment
//
// LLM extractor that identifies geographic references in the daf — cities,
// academies, lands, regions — and emits one instance per verbatim Hebrew
// mention. Replaces the legacy heuristic injectCityMarkers wrapping. The
// renderer dispatcher (renderers/dispatch.ts) wraps each excerpt as a
// `.city-marker[data-city=<name>]` span so GeographyMap's click-to-highlight
// keeps working.
//
// Per-instance synthesis runs locally (per daf) — "what was this place
// known for, who taught there, how does it show up on this daf."
// ---------------------------------------------------------------------------

const PLACES_KIND_ENUM = ['city', 'academy', 'land', 'region'] as const;
const PLACES_REGION_ENUM = ['israel', 'bavel', 'other'] as const;

const PLACES_SYSTEM_PROMPT = `You are a Talmud geographer. Given a daf of Talmud, identify every geographic reference — cities (Sura, Pumbedita, Tiberias, Sepphoris, Caesarea, Babylonia/Bavel, the Land of Israel/Eretz Yisrael, etc.), academies/yeshivot, broader lands, and regions.

Output STRICT JSON only:

{
  "instances": [
    {
      "excerpt": "EXACT Hebrew word(s) as they appear in the source (e.g. 'סורא', 'בפומבדיתא', 'ארץ ישראל', 'בבל'). Preserve the Hebrew prefix if attached ('בסורא' = 'in Sura' — copy the whole token).",
      "fields": {
        "name": "Canonical English name (e.g. 'Sura', 'Pumbedita', 'Tiberias', 'Caesarea', 'Eretz Yisrael', 'Bavel'). Use the most common scholarly spelling.",
        "nameHe": "Canonical Hebrew name (e.g. 'סורא', 'פומבדיתא', 'טבריה') — STRIPPED of grammatical prefixes (no ב/מ/ל/כ/ש/ו at the start, no nikkud).",
        "kind": "city | academy | land | region",
        "region": "israel | bavel | other — historical Talmudic geography. 'israel' = Eretz Yisrael (Tiberias, Sepphoris, Caesarea, Lod, etc.). 'bavel' = Babylonian centers (Sura, Pumbedita, Nehardea, Mata Mehasya). 'other' for everything else (Rome, Egypt, Yavneh-era diaspora, etc.).",
        "knownAs": ["Optional alternate spellings or names (e.g. 'Tiberias' could include 'Tveria'). Empty array if none."]
      }
    }
  ]
}

Rules:
- excerpt MUST be copied VERBATIM from the Hebrew source. Preserve attached prefixes — "בסורא" stays as-is in excerpt; nameHe strips the prefix to "סורא".
- If the same place appears multiple times in the daf under different forms (e.g. "סורא" and "בסורא"), emit ONE instance per distinct excerpt. The downstream renderer wraps each verbatim occurrence.
- Do NOT include personal names that happen to look like place names. Only emit confirmed geographic references.
- Do NOT include generic location words like "place" (מקום) or "city" (עיר) unless they're a proper noun reference.
- "kind": pick the SINGLE best tag. A yeshiva-bearing city like Sura is 'city' (not 'academy'), unless the daf is specifically referencing the academy/court ('בי דינא דסורא' = academy). When in doubt, 'city'.
- No duplicates with identical excerpt.`;

const PLACES_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source (copy excerpts VERBATIM from here):
{{hebrew}}

English translation (for context only):
{{english}}

Identify every geographic reference. Return JSON per the schema.`;

const PLACES_OUTPUT_SCHEMA = {
  name: 'places_marks',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['instances'],
    properties: {
      instances: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['excerpt', 'fields'],
          properties: {
            excerpt: { type: 'string' },
            fields: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'nameHe', 'kind', 'region', 'knownAs'],
              properties: {
                name: { type: 'string' },
                nameHe: { type: 'string' },
                kind: { type: 'string', enum: PLACES_KIND_ENUM },
                region: { type: 'string', enum: PLACES_REGION_ENUM },
                knownAs: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
};

CODE_MARKS.push({
  id: 'places',
  label: 'Places',
  description: 'Geographic references on the daf (cities, academies, lands). Drives inline city-marker wraps and the per-place synthesis card.',
  category: 'canon',
  anchor: 'phrase',
  // The render dispatch keys off `def.id === 'places'` to wrap matched
  // names as `.city-marker[data-city]` spans, so style/color here are only
  // schema-required hints — the actual CSS comes from the city-marker class.
  render: {
    kind: 'inline',
    style: 'highlight',
    color: 'var(--city-color, #c2410c)',
    hoverable: true,
  },
  extractor: {
    kind: 'llm',
    model: ARGUMENT_FLASH_MODEL,
    system_prompt: PLACES_SYSTEM_PROMPT,
    user_prompt_template: PLACES_USER_TEMPLATE,
    output_schema: PLACES_OUTPUT_SCHEMA,
    thinking_off: true,
  },
  dependencies: ['gemara'],
  status: 'promoted',
  def_hash: 'places-v1',
  cache_version: '1',
  source: 'code',
  updated_at: NOW,
});

const PLACES_SYNTHESIS_SYSTEM_PROMPT = `You are a Talmud geographer. Given ONE geographic reference identified on a daf and the surrounding gemara, compose a tight paragraph about THIS specific place IN THE CONTEXT OF THIS DAF.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, 2-3 sentences. (a) State what this place is (a city in Bavel, a Tannaitic academy in Yavneh, the Land of Israel as a halachic category, etc.). (b) Name its significance at the time of the relevant generation (who taught there, what it produced, why the gemara invokes it). (c) Tie back to how the daf USES this place — is it a setting, a halachic distinction (Israel vs. Bavel), a story locale, an authority center? Keep it tight."
}

HARD RULES:
- 2-3 sentences. Hard ceiling.
- Ground every claim in actual history — no invented anecdotes. If uncertain, hedge ("traditionally associated with…", "by the time of the late amoraim…").
- NO puff: avoid "this teaches us", "underscores", "highlights", "intricate", "profound".
- Hebrew in parentheses for technical terms (ישיבה, מתיבתא) — never transliteration.
- If the place is generic (e.g. "ארץ ישראל" used as a halachic category, not a setting), focus on its halachic/legal force on this daf rather than geographic detail.`;

const PLACES_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS place reference:
{{mark_input}}

Hebrew/Aramaic source for the daf:
{{gemara_he}}

English translation:
{{gemara_en}}

Rabbis identified on the daf (for context on who's teaching where):
{{anchors.rabbi}}

Compose ONE tight paragraph about THIS place per the schema.`;

const PLACES_SYNTHESIS_OUTPUT_SCHEMA = {
  name: 'places_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['synthesis'],
    properties: { synthesis: { type: 'string' } },
  },
};

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'places', 'places.synthesis', 'Synthesis',
    'Tight per-place paragraph: what it is, why it matters at the time of this daf, how the gemara uses it.',
    PLACES_SYNTHESIS_SYSTEM_PROMPT, PLACES_SYNTHESIS_USER_TEMPLATE, PLACES_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: ['gemara', { mark: 'places' }, { mark: 'rabbi' }],
      defHash: 'places.synthesis-v1', cacheVersion: '1',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
);

// ---------------------------------------------------------------------------
// rishonim mark + its synthesis enrichment
//
// Computed extractor (no LLM): pulls per-segment commentary from the existing
// Sefaria links fetch in the worker, filtered to a hardcoded rishonim
// allowlist (Rashi / Tosafot family / Ramban / Rashba / Ritva / Ran / Rosh /
// Meiri / R. Chananel / R. Yonah / Yad Ramah / Or Zarua). One mark instance
// per segment that has at least one rishon, with the per-rishon text
// payloads attached for downstream synthesis.
//
// Renders as a per-segment gutter icon (left margin) — NOT inline — so dense
// commentary doesn't clutter the daf body. Click opens the
// RishonimInspectorShelf which fires `rishonim.synthesis` for that segment.
// ---------------------------------------------------------------------------

CODE_MARKS.push({
  id: 'rishonim',
  label: 'Rishonim',
  description: 'Per-segment rishonim indicator (Rashi, Tosafot, Ramban, …). Gutter icon next to each commented segment; click for the per-segment synthesis.',
  category: 'canon',
  anchor: 'segment',
  render: {
    kind: 'gutter+sidebar',
    icon: 'R',
    sidebar_title: 'Rishonim',
  },
  extractor: {
    kind: 'computed',
    fn: 'rishonim-from-sefaria',
  },
  dependencies: [],
  status: 'promoted',
  def_hash: 'rishonim-v1',
  cache_version: '1',
  source: 'code',
  updated_at: NOW,
});

const RISHONIM_SYNTHESIS_SYSTEM_PROMPT = `You are a Talmud scholar. Given ONE segment of gemara and the rishonim who commented on THIS segment (Rashi, Tosafot, Ramban, Rashba, Meiri, Ritva, Ran, etc.), compose a tight English paragraph that weaves their voices into a single reading.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, 2-3 sentences. (a) State what the segment is saying in plain English (one short clause). (b) Weave in the most load-bearing rishonim — what does Rashi clarify? Where do Tosafot push back or open a question? If a notable rishon (Ramban, Meiri, Rashba) sharpens the point, mention them in one short clause. (c) When the rishonim disagree, name the disagreement concretely. Do NOT enumerate every commentary; pick the 1-3 that actually move the reading."
}

HARD RULES (output is rejected if violated):
- 2-3 sentences. Hard ceiling — do NOT pad.
- About THIS segment only. Don't drift into the section's broader argument.
- Reference rishonim by name in English (Rashi, Tosafot, Ramban, Meiri, Rashba, Ritva, Ran, …).
- Ground every claim in the supplied commentary text — do NOT invent positions a rishon didn't take.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "intricate", "profound", "lens", "captures", "embodies".
- NO jargon: write "transmitter" not "tradent", "interpret" not "exegete".
- Hebrew script (not transliteration) for technical terms in parentheses; verbatim short Aramaic phrases only when distinctive.
- If a rishon is silent or trivially restates the segment, skip them.
- If only ONE commentary exists, just summarize their reading in 1-2 sentences — don't pad.`;

const RISHONIM_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS segment (with its rishonim):
{{mark_input}}

Hebrew/Aramaic source for the surrounding daf:
{{gemara_he}}

English translation:
{{gemara_en}}

Compose ONE tight paragraph weaving the rishonim's reading of THIS segment per the schema.`;

const RISHONIM_SYNTHESIS_OUTPUT_SCHEMA = {
  name: 'rishonim_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['synthesis'],
    properties: { synthesis: { type: 'string' } },
  },
};

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'rishonim', 'rishonim.synthesis', 'Synthesis',
    'Tight per-segment paragraph weaving Rashi + Tosafot + named rishonim into a single reading.',
    RISHONIM_SYNTHESIS_SYSTEM_PROMPT, RISHONIM_SYNTHESIS_USER_TEMPLATE, RISHONIM_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: ['gemara', { mark: 'rishonim' }],
      defHash: 'rishonim.synthesis-v2', cacheVersion: '2',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
);

// ---------------------------------------------------------------------------
// Halacha enrichments — operate on a single halacha topic instance from
// the `halacha` mark. The anchor identifies WHICH topic the daf is settling;
// the enrichments answer HOW it's codified (Mishneh Torah / Tur / Shulchan
// Aruch / Rema), WHEN it applies in practice, and WHERE the major poskim
// disagree. The synthesis weaves them together.
//
// All four are scope='local' because halacha topics are identified per-daf
// (the LLM names them; titles drift between dafim). A future
// `halacha.canonical-ref` enrichment could canonicalize topics to a
// Shulchan Aruch siman:seif and promote codification to scope='global'.
// ---------------------------------------------------------------------------

const HALACHA_LEAF_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Halacha topic identified on this daf:
{{mark_input}}

Hebrew/Aramaic source for the daf:
{{gemara_he}}

English translation:
{{gemara_en}}

Produce the requested output per the schema.`;

const HALACHA_CODIFICATION_SYSTEM_PROMPT = `You are a scholar of halacha. Given ONE halachic topic surfaced on a daf, produce the canonical codification trail: what Mishneh Torah, Tur, Shulchan Aruch, and Rema rule on this exact topic.

Output STRICT JSON only:

{
  "mishnehTorah": { "ref": "Sefer Zmanim, Hilchot Krias Shema 1:1", "ruling": "1-2 sentence English summary of Rambam's ruling on THIS topic." } | null,
  "tur":          { "ref": "Orach Chayyim 235",                       "ruling": "Same shape — 1-2 sentence summary of the Tur's position." } | null,
  "shulchanAruch":{ "ref": "Orach Chayyim 235:1",                     "ruling": "Same shape — Beit Yosef's ruling in the Mechaber's voice." } | null,
  "rema":         { "ref": "Orach Chayyim 235:1",                     "ruling": "Same shape — Rema's gloss / Ashkenazi position. Empty when Rema does not differ." } | null,
  "prose": "ONE short paragraph (2-3 sentences) tracing how the daf's conclusion gets codified — name which codifier first fixes the rule, where the later codifiers diverge if they do, and what the final practical position is. NO puff."
}

Rules:
- ref MUST be a real, citable reference (sefer + hilchot + chapter:halacha for Mishneh Torah; siman[:seif] for Tur/Shulchan Aruch/Rema). If you cannot supply a real ref with confidence, return null for that codifier — DO NOT invent references.
- For each non-null entry, the ruling MUST genuinely match what the codifier says on THIS topic, not a general gloss.
- Rema is only non-null when he explicitly disagrees, qualifies, or adds Ashkenazi minhag to the Mechaber's ruling. If Rema agrees silently, leave it null.
- prose is a tight narrative, not a list — focus on the trail (who first fixes the rule, where it forks).
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "profoundly", "lens", "captures", "embodies".

${HEBREW_GLOSS_STYLE}`;

const HALACHA_CODIFICATION_OUTPUT_SCHEMA = {
  name: 'halacha_codification',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['mishnehTorah', 'tur', 'shulchanAruch', 'rema', 'prose'],
    properties: {
      mishnehTorah: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object', additionalProperties: false,
            required: ['ref', 'ruling'],
            properties: { ref: { type: 'string' }, ruling: { type: 'string' } },
          },
        ],
      },
      tur: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object', additionalProperties: false,
            required: ['ref', 'ruling'],
            properties: { ref: { type: 'string' }, ruling: { type: 'string' } },
          },
        ],
      },
      shulchanAruch: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object', additionalProperties: false,
            required: ['ref', 'ruling'],
            properties: { ref: { type: 'string' }, ruling: { type: 'string' } },
          },
        ],
      },
      rema: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object', additionalProperties: false,
            required: ['ref', 'ruling'],
            properties: { ref: { type: 'string' }, ruling: { type: 'string' } },
          },
        ],
      },
      prose: { type: 'string' },
    },
  },
};

const HALACHA_PRACTICAL_SYSTEM_PROMPT = `You are a scholar of halacha and practical psak. Given ONE halachic topic surfaced on a daf, describe the PRACTICAL application of the settled halacha — what someone has to actually do, when it applies, and what the common edge cases are.

Output STRICT JSON only:

{
  "lechatchila": "1-2 sentences: how the halacha is performed lechatchila (ideal-case). What's the standard practice?",
  "bedieved":    "1 sentence on the bedieved (after-the-fact) standard, when applicable. Empty string if no lechatchila/bedieved distinction.",
  "appliesWhen": ["Short bullet phrases — 2-4 items — naming the situations when this halacha is triggered (e.g. 'eating bread', 'after dark', 'in a public domain')."],
  "exceptions":  ["Short bullet phrases — 0-3 items — naming common exceptions or edge cases ('a sick person is exempt', 'on Shabbat the rule changes', etc.). Empty array if none."],
  "prose": "ONE short paragraph (2-3 sentences) on how the rule plays out today — what the typical person does, what trips them up, any standard halachic threshold the gemara introduced that still governs practice."
}

Rules:
- The "lechatchila" field must describe the standard live practice (the לכתחילה standard), not the gemara's hypothetical. If the practice still tracks the gemara's plain conclusion, say so concretely.
- The "bedieved" field is for the after-the-fact (בדיעבד) standard: did the act count, what do you do retroactively, etc. Empty string when there is no such distinction.
- appliesWhen / exceptions are SHORT phrases, not sentences. The user will scan them.
- NO puff. NO jargon: "transmitter" not "tradent". Inside the prose, follow the HEBREW_GLOSS_STYLE rules below — every use of לכתחילה / בדיעבד / רוב / etc. MUST appear with the Hebrew script (Form A or Form B), never as bare transliteration.

${HEBREW_GLOSS_STYLE}`;

const HALACHA_PRACTICAL_OUTPUT_SCHEMA = {
  name: 'halacha_practical',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['lechatchila', 'bedieved', 'appliesWhen', 'exceptions', 'prose'],
    properties: {
      lechatchila: { type: 'string' },
      bedieved: { type: 'string' },
      appliesWhen: { type: 'array', items: { type: 'string' } },
      exceptions: { type: 'array', items: { type: 'string' } },
      prose: { type: 'string' },
    },
  },
};

const HALACHA_DISPUTES_SYSTEM_PROMPT = `You are a scholar of halacha. Given ONE halachic topic surfaced on a daf, list the MAJOR dissenting positions among the rishonim, the Mechaber/Rema split, and any Acharonim-era reframing — but ONLY when the dispute is well-attested and materially affects practice.

Output STRICT JSON only:

{
  "disputes": [
    {
      "axis": "ashkenaz-sefarad" | "rishonim" | "acharonim" | "modern" | "other",
      "label": "Short phrase naming the dispute (e.g. 'Rambam vs Tosafot on shiurim', 'Sefardi vs Ashkenazi on saying Yaaleh Veyavo').",
      "positions": [
        { "voice": "Rambam" | "Tosafot" | "Mechaber" | "Rema" | "Mishna Berura" | "...named figure or group...", "position": "1-sentence summary of what this voice holds on THIS topic." }
      ],
      "settled": "Short sentence: where the dispute lands today, OR 'unsettled — both customs followed' when neither side dominates. Empty string if no clean resolution."
    }
  ]
}

Rules:
- ZERO disputes is the COMMON case — most halachic topics have one settled answer. Return an empty disputes array when the topic is uncontroversial. DO NOT fabricate disputes to fill the field.
- A dispute MUST have at least 2 positions and a real-world consequence for practice.
- "voice" names a specific source, not a vague category — "Rambam" not "Sephardic rishonim", "Mishna Berura" not "Ashkenazi Acharonim".
- "settled" is the bottom-line practical state. Use 'unsettled — both customs followed' when honest-to-God neither side dominates.
- NO puff.

${HEBREW_GLOSS_STYLE}`;

const HALACHA_DISPUTES_OUTPUT_SCHEMA = {
  name: 'halacha_disputes',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['disputes'],
    properties: {
      disputes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['axis', 'label', 'positions', 'settled'],
          properties: {
            axis: { type: 'string', enum: ['ashkenaz-sefarad', 'rishonim', 'acharonim', 'modern', 'other'] },
            label: { type: 'string' },
            positions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['voice', 'position'],
                properties: { voice: { type: 'string' }, position: { type: 'string' } },
              },
            },
            settled: { type: 'string' },
          },
        },
      },
    },
  },
};

export const HALACHA_SYNTHESIS_SYSTEM_PROMPT = `You are a scholar of halacha. Given ONE halachic topic surfaced on a daf plus the codification trail, practical application, and any major disputes, compose a tight paragraph framed as a modern-day halacha exploration — what the practicing Jew does, where it sits in the codes, and where the live tensions are.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, 4-5 sentences. Order: (a) the practical halacha today — the לכתחילה standard, what someone actually does. (b) where it sits in the codes — Rambam / Tur / Shulchan Aruch positions and canonical refs, OR an explicit note that the codifiers do not codify the rule and what that silence means (e.g. treated as מידות, not binding halacha). (c) live disputes that shape current practice — Ashkenaz/Sefarad, Mechaber/Rema, or a real contemporary split — INCLUDE ONLY when the dispute actually moves practice. (d) gemara source — include ONLY when it clarifies WHY the modern rule looks the way it does. Drop (c) and/or (d) when they add nothing. Hard ceiling: 5 sentences."
}

HARD RULES:
- 4-5 sentences. Hard ceiling — do NOT pad.
- About THIS topic only. Don't summarize the whole daf.
- LEAD with the practical halacha today, not with the gemara source or with academic framing of the dispute. Contemporary practice is the frame; the sources are background.
- Ground every claim in the codification / practical / disputes inputs. Don't invent rulings or refs.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "intricate", "profound", "lens", "captures", "embodies".
- NO academic Talmud-scholar register. Forbidden phrasings include: "amoraic ruling", "amoraic dictum", "the amora rules", "the gemara records that…", "the sugya records". Write as a practical halacha summary, not an academic survey of sources.
- NO jargon: write "transmitter" not "tradent", "interpret" not "exegete".
- The user will read this paragraph FIRST. It should stand on its own without the user needing to expand the codification cards.

HEBREW GLOSS — SYNTHESIS-LOCAL OVERRIDE OF THE BASE RULES BELOW:
- On the FIRST occurrence of a Hebrew term in this paragraph, attach the English gloss per the base style (e.g. "לכתחילה (the ideal standard)").
- On EVERY SUBSEQUENT occurrence in the SAME paragraph, use bare Hebrew script with NO gloss (e.g. just "לכתחילה"). Do NOT re-translate the same term twice in one paragraph.
- All other base rules (Hebrew script never replaced by transliteration, verbatim daf quotes in Hebrew, etc.) still apply.

${HEBREW_GLOSS_STYLE}`;

const HALACHA_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Halacha topic:
{{mark_input}}

Codification trail (Mishneh Torah / Tur / Shulchan Aruch / Rema):
{{depends.halacha.codification}}

Practical application (lechatchila / bedieved / when / exceptions):
{{depends.halacha.practical}}

Major disputes (empty array when uncontroversial):
{{depends.halacha.disputes}}

Hebrew/Aramaic source for the daf (for grounding only):
{{gemara_he}}

Produce the synthesis per the schema.`;

const HALACHA_SYNTHESIS_OUTPUT_SCHEMA = {
  name: 'halacha_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['synthesis'],
    properties: { synthesis: { type: 'string' } },
  },
};

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'halacha', 'halacha.codification', 'Codification',
    'Mishneh Torah / Tur / Shulchan Aruch / Rema rulings on this topic, with refs and a prose trail.',
    HALACHA_CODIFICATION_SYSTEM_PROMPT, HALACHA_LEAF_USER_TEMPLATE, HALACHA_CODIFICATION_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara'],
      defHash: 'halacha.codification-v2', cacheVersion: '2',
    },
  ),
  makeEnrichment(
    'halacha', 'halacha.practical', 'Practical',
    'Lechatchila/bedieved, when the halacha applies, common exceptions, modern practice prose.',
    HALACHA_PRACTICAL_SYSTEM_PROMPT, HALACHA_LEAF_USER_TEMPLATE, HALACHA_PRACTICAL_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara'],
      defHash: 'halacha.practical-v2', cacheVersion: '2',
    },
  ),
  makeEnrichment(
    'halacha', 'halacha.disputes', 'Disputes',
    'Major dissenting positions (Ashkenaz/Sefarad, rishonim, Acharonim) when materially affecting practice. Often empty.',
    HALACHA_DISPUTES_SYSTEM_PROMPT, HALACHA_LEAF_USER_TEMPLATE, HALACHA_DISPUTES_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara'],
      defHash: 'halacha.disputes-v2', cacheVersion: '2',
    },
  ),
  makeEnrichment(
    'halacha', 'halacha.synthesis', 'Synthesis',
    'One tight paragraph: daf conclusion → codification → practical rule → key dispute (if any).',
    HALACHA_SYNTHESIS_SYSTEM_PROMPT, HALACHA_SYNTHESIS_USER_TEMPLATE, HALACHA_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: [
        'gemara',
        { enrichment: 'halacha.codification' },
        { enrichment: 'halacha.practical' },
        { enrichment: 'halacha.disputes' },
      ],
      defHash: 'halacha.synthesis-v2', cacheVersion: '2',
    },
  ),
);

// ---------------------------------------------------------------------------
// Pesukim enrichments — operate on a single pasuk citation instance from
// the `pesukim` mark. Anchor identifies WHICH verses are cited; enrichments
// answer WHY (gemara's exegetical use) and WHAT IT MEANS (Tanach context).
// ---------------------------------------------------------------------------

// Shared style note for all pesukim prompts — yeshivish-traditional naming
// over Christian/academic English, matching the language of the rabbi /
// argument prompts. The model receives Sefaria's English verseRef as input
// (e.g. "Deuteronomy 6:7") but must OUTPUT in the traditional names.
const TANACH_NAMING_STYLE = `STYLE — Tanach naming:
- Use the traditional Hebrew names for biblical books, NEVER the English/Christian name.
  Chumash:  Bereishit, Shemot, Vayikra, Bamidbar, Devarim
            (NOT Genesis, Exodus, Leviticus, Numbers, Deuteronomy)
  Nevi'im:  Yehoshua, Shoftim, Shmuel (Aleph/Bet), Melachim (Aleph/Bet),
            Yeshayahu, Yirmiyahu, Yechezkel, and Trei Asar — Hoshea, Yoel, Amos,
            Ovadiah, Yonah, Michah, Nachum, Chavakuk, Tzefaniah, Chaggai,
            Zechariah, Malachi
            (NOT Joshua, Judges, Samuel, Kings, Isaiah, Jeremiah, Ezekiel, etc.)
  Ketuvim:  Tehillim, Mishlei, Iyov, Shir HaShirim, Rut, Eichah, Kohelet,
            Esther, Daniel, Ezra, Nechemiah, Divrei HaYamim
            (NOT Psalms, Proverbs, Job, Ecclesiastes, Chronicles, etc.)
- Verse refs in the form "Devarim 6:7" or in Hebrew script "דברים ו:ז" — not "Deut 6:7" / "Deuteronomy 6:7".
- Use yeshivish-traditional terms in body prose: "pasuk" / "pesukim" rather than "verse" / "verses"; "Chumash" rather than "Pentateuch"; "sugya" rather than "passage"; "sefer" rather than "book" when the meaning is clear.

STYLE — Hebrew + gloss formatting (BOTH forms welcome; pick whichever reads better in context):
  Form A — Hebrew SCRIPT first, English gloss in parens. Use when the Hebrew word IS the subject of the clause:
      "the gemara invokes a גזירה שווה (verbal analogy from a shared word)"
      "applies the rule of יצא (an excluded case)"
      "from the כלל ופרט (general followed by specific)"
      "the verse 'בשכבך ובקומך' (when you lie down and when you rise) governs the time"
  Form B — English/transliteration first, Hebrew script in parens. Use when the Hebrew is a parenthetical aid to an English-flowing sentence:
      "a leading Tanna (תנא) at Yavneh (יבנה)"
      "the evening Shema (קריאת שמע של ערבית)"
      "atonement (כפרה) does not delay the priest's eating"
- NEVER write a transliteration alone in parens (e.g. "(terumah)", "(gezeira shava)") — always pair the Hebrew script with the English meaning when you gloss, not transliteration with itself.
- NEVER repeat the same word/phrase on both sides of the parens. FORBIDDEN: "ח׳ (ח׳)", "רבי עקיבא (רבי עקיבא)", "דוד המלך (דוד המלך)", "חז״ל (חז״ל)". For proper names (rabbis, places, titles) and bare Hebrew letters the parens would just echo — DROP the parens and pick ONE script based on the surrounding language.

HARD RULE — pasuk citations (rejected if violated):
- ALWAYS include the Hebrew verbatim text when quoting a pasuk. The Hebrew is the canonical anchor; English is optional gloss.
- Correct form: '"<Hebrew excerpt>" (Tehillim 119:62)' — Hebrew in quotes, ref in parens. Optionally add an English gloss in parens after, or in a following clause.
- FORBIDDEN — citing a pasuk with ONLY an English translation in quotes:
    BAD:  "Tehillim 119:62 states, 'At midnight I will rise to give thanks to You'"
    BAD:  "Tehillim 119:148 ('My eyes preceded the watches')"
    GOOD: "Tehillim 119:62 states 'בחצות לילה אקום להודות לך' ('At midnight I will rise to give thanks to You')"
    GOOD: "the contrast with 'קדמו עיני אשמרות' (Tehillim 119:148) resolves the dispute"
- If the Hebrew won't fit your sentence budget, CUT the English translation, not the Hebrew. The Hebrew is verbatim Torah; English paraphrase is dispensable.
- The {{pasuk_he}} field of the user prompt gives you the focal pasuk's Hebrew text verbatim — quote from THAT, do not reconstruct.`;

const PESUKIM_TANACH_CONTEXT_SYSTEM_PROMPT = `You are a scholar of Tanach. Given ONE pasuk by canonical reference, write a tight summary of its plain meaning in its own biblical context — what the pasuk says, what's around it, what the perek / sefer is doing. Daf-agnostic — about the pasuk itself, not how the gemara uses it.

Output STRICT JSON only:

{
  "context": "2-3 sentences. (1) What the pasuk says in plain English. (2) Where it sits in its sefer / perek / parshah. (3) Optional: one factual note that often matters for how chazal cite it (e.g., 'spoken by Moshe Rabbeinu to Israel', 'from the Aseret HaDibrot', 'a kelalah in Devarim 28'). NO theological exposition, NO derush. Plain peshat."
}

Rules:
- 2-3 sentences. Tight.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "profoundly", "lens", "captures".

${TANACH_NAMING_STYLE}`;

const PESUKIM_TANACH_CONTEXT_USER_TEMPLATE = `Pasuk citation:
{{mark_input}}

Focal pasuk — Hebrew verbatim text (quote from THIS when citing the verse):
{{pasuk_he}}

Write the Tanach-context summary per the schema. The mark_input contains verseRef (e.g. 'Deuteronomy 6:7'), the Hebrew excerpt as it appears in the gemara, and citationStyle. Use the verseRef as authoritative; the excerpt is just the snippet the gemara quoted.`;

const PESUKIM_TANACH_CONTEXT_OUTPUT_SCHEMA = {
  name: 'pesukim_tanach_context',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['context'],
    properties: { context: { type: 'string' } },
  },
};

const PESUKIM_EXEGESIS_SYSTEM_PROMPT = `You are a scholar of Talmud. Given ONE pasuk citation on a daf — verse reference + the Hebrew excerpt as it appears in the gemara + the surrounding gemara — describe HOW the gemara is using the verse, and IDENTIFY THE SPECIFIC EXEGETICAL METHOD when one is being invoked.

Not every citation invokes a formal method — sometimes a verse is just plain proof, narrative quotation, or a mnemonic. Be precise: only name a method when the gemara is actually using it; otherwise say so plainly.

Output STRICT JSON only:

{
  "use": "1-2 sentences in plain English: what role this verse plays in the gemara's argument here. Pick from: proof for a halacha; prooftext / mnemonic support (asmakhta); contrast or counter-citation; exegetical derivation (and name the method in 'method' below); narrative quotation; tangential allusion. Name the role explicitly.",
  "method": "OPTIONAL. When the gemara is INVOKING a specific exegetical method to derive its conclusion, name the method in plain English with the Hebrew technical term in parens, plus 1 sentence on how the derivation works HERE. If the citation is plain proof / narrative / mnemonic / contrast (no formal derivation), return empty string."
}

The midot you should identify when applicable (the midot she-haTorah nidreshet bahem):

  - **gezeira shava (גזירה שווה)** — verbal analogy. The same word or phrase appearing in two passages lets a law from one transfer to the other. Look for "נאמר כאן ... ונאמר להלן ..." or "אתיא X X".
  - **kal va-chomer (קל וחומר)** — a fortiori. If a stringency holds in a lenient case, it certainly holds in a stringent case (and the inverse for leniency). Look for "ומה אם ... קל וחומר ש..." or "אם כן".
  - **hekesh (היקש)** — analogy from juxtaposition. Two cases mentioned in the same or adjacent passages are treated as analogous, so a law from one transfers to the other.
  - **binyan av (בנין אב)** — induction from a paradigmatic case. "Just as in case A law X applies, so too in similar case B."
  - **klal u-frat / prat u-klal (כלל ופרט / פרט וכלל)** — general-and-specific and specific-and-general inclusion/exclusion rules.
  - **ribbui u-mi'ut (ריבוי ומיעוט)** — inclusion-and-exclusion via 'אך / רק / כל'.
  - **dvar ha-lamed me-inyano (דבר הלמד מעניינו)** — meaning learned from immediate context.
  - **asmakhta (אסמכתא)** — rabbinic law given a Scriptural mnemonic without strict derivation. NAME IT WHEN APPLICABLE; do NOT mistake it for a strict derivation.
  - **drash / midrashic reading** — non-peshat reading (re-vocalization, letter-counting, etc.) when it doesn't fit one of the named midot above.

Rules:
- Daf-LOCAL: about how the gemara uses THIS pasuk on THIS daf.
- ONLY name a method when the gemara genuinely invokes one. Plain proof citations should say so in 'use' and leave 'method' empty.
- Concrete. NO puff. NO "this teaches us", NO "we see that".

${TANACH_NAMING_STYLE}`;

const PESUKIM_EXEGESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Pasuk citation:
{{mark_input}}

Focal pasuk — Hebrew verbatim text (quote from THIS when citing the verse):
{{pasuk_he}}

Hebrew source of the daf (the citation appears within this):
{{gemara_he}}

Rashi + Tosafot + other rishonim available for the daf:
{{commentaries}}

Describe how the gemara uses this verse here, per the schema.`;

const PESUKIM_EXEGESIS_OUTPUT_SCHEMA = {
  name: 'pesukim_exegesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['use', 'method'],
    properties: {
      use: { type: 'string' },
      method: { type: 'string' },
    },
  },
};

const PESUKIM_SYNTHESIS_SYSTEM_PROMPT = `You are a scholar of Talmud and Tanach. Given ONE pasuk citation on a daf along with its Tanach context and the gemara's exegetical use, compose a tight paragraph that ties them together.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, MAX 4 sentences, MAX 25 words per sentence. (1) The pasuk and its peshat in 1 sentence. (2) How the gemara is using it here in 1-2 sentences (proof / prooftext / contrast / exegetical method). When the gemara invokes a named midah (gezeira shava, kal va-chomer, hekesh, etc.), name it explicitly. (3) When relevant, name a rabbi tied to the citation (originator or interlocutor). End with one sentence on what the citation lands or sets up."
}

HARD RULES:
- MAX 4 sentences. MAX 25 words per sentence. Cut, don't pad.
- Concrete. Name the pasuk, the use, the midah (if applicable), the rabbi (if relevant).
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "intricate", "profound", "lens", "captures", "embodies".
- NO jargon: write "transmitter" not "tradent", "interpret" not "exegete".

${TANACH_NAMING_STYLE}`;

const PESUKIM_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Pasuk citation:
{{mark_input}}

Focal pasuk — Hebrew verbatim text (QUOTE FROM THIS WHEN YOU CITE THE VERSE; do not reconstruct or translate-and-quote):
{{pasuk_he}}

Other pesukim cited on this daf — Hebrew verbatim text (QUOTE FROM THESE if the gemara invokes them as cross-references; do not reconstruct):
{{cross_refs_he}}

Tanach context (verse's plain meaning in its own scriptural context):
{{depends.pesukim.tanach-context}}

Exegetical use on this daf (how the gemara uses the verse here):
{{depends.pesukim.exegesis}}

Hebrew source of the daf:
{{gemara_he}}

Rabbis identified on the daf:
{{anchors.rabbi}}

Compose ONE tight paragraph per the schema.`;

const PESUKIM_SYNTHESIS_OUTPUT_SCHEMA = {
  name: 'pesukim_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['synthesis'],
    properties: { synthesis: { type: 'string' } },
  },
};

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'pesukim', 'pesukim.tanach-context', 'Tanach context',
    'The verse\'s plain meaning in its own scriptural context. Daf-agnostic; cached by verseRef.',
    PESUKIM_TANACH_CONTEXT_SYSTEM_PROMPT, PESUKIM_TANACH_CONTEXT_USER_TEMPLATE, PESUKIM_TANACH_CONTEXT_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'global',
      dependencies: [],
      defHash: 'pesukim.tanach-context-v4', cacheVersion: '4',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
  makeEnrichment(
    'pesukim', 'pesukim.exegesis', 'Exegesis',
    'How the gemara uses this verse on this daf — proof / prooftext / contrast / exegetical method.',
    PESUKIM_EXEGESIS_SYSTEM_PROMPT, PESUKIM_EXEGESIS_USER_TEMPLATE, PESUKIM_EXEGESIS_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', 'commentaries'],
      defHash: 'pesukim.exegesis-v5', cacheVersion: '5',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
  makeEnrichment(
    'pesukim', 'pesukim.synthesis', 'Synthesis',
    'Tight paragraph: the verse, what it says, how the gemara uses it, where it lands.',
    PESUKIM_SYNTHESIS_SYSTEM_PROMPT, PESUKIM_SYNTHESIS_USER_TEMPLATE, PESUKIM_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: [
        'gemara',
        { enrichment: 'pesukim.tanach-context' },
        { enrichment: 'pesukim.exegesis' },
        { mark: 'rabbi' },
        { mark: 'pesukim' },
      ],
      defHash: 'pesukim.synthesis-v6', cacheVersion: '6',
      model: ARGUMENT_FLASH_MODEL,
    },
  ),
);

// ---------------------------------------------------------------------------
// Lookup helpers — used by /api/studio/run to resolve an id from either KV
// or code-defined sources. KV wins on collision.
// ---------------------------------------------------------------------------

export function findCodeMark(id: string): MarkDefinition | null {
  return CODE_MARKS.find((m) => m.id === id) ?? null;
}

export function findCodeEnrichment(id: string): EnrichmentDefinition | null {
  return CODE_ENRICHMENTS.find((e) => e.id === id) ?? null;
}
