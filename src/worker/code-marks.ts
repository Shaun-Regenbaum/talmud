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
        "excerpt": "3-5 Hebrew/Aramaic words copied VERBATIM from the focal Hebrew, opening this section.",
        "rabbiNames": ["Rabbi Yochanan", "Gemara's question", "First answer"]
      }
    }
  ]
}

Rules:
- Break the focal amud into 3-8 sections by argument structure, not by paragraph.
- Sections must partition the daf cleanly: section i+1's startSegIdx === section i's endSegIdx + 1, no gaps, no overlaps.
- For a one-segment section, startSegIdx === endSegIdx.
- "excerpt" MUST be Hebrew/Aramaic copied VERBATIM from the source — never translate.
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
        "excerpt": "The Hebrew/Aramaic words from the daf that quote or allude to this verse — copied VERBATIM from the source.",
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
- "excerpt" MUST be Hebrew/Aramaic verbatim from the source.
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
              required: ['verseRef', 'citationStyle', 'excerpt', 'summary'],
              properties: {
                verseRef: { type: 'string' },
                citationStyle: { type: 'string', enum: ['explicit', 'allusion', 'paraphrase'] },
                excerpt: { type: 'string' },
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
              required: ['title', 'summary', 'excerpt', 'rabbiNames'],
              properties: {
                title: { type: 'string' },
                summary: { type: 'string' },
                excerpt: { type: 'string' },
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
    status: 'promoted',
    def_hash: 'argument-llm-v1',
    cache_version: '2',
    source: 'code',
    updated_at: NOW,
  },
  {
    id: 'halacha',
    label: 'Halachot',
    description: 'Halacha-topic gutter icons + sidebar (proxied through /api/halacha).',
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
    status: 'promoted',
    def_hash: 'halacha-llm-v1',
    cache_version: '2',
    source: 'code',
    updated_at: NOW,
  },
  {
    id: 'aggadata',
    label: 'Aggadatot',
    description: 'Aggadic-story gutter icons + sidebar (proxied through /api/aggadata).',
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
    status: 'promoted',
    def_hash: 'aggadata-llm-v1',
    cache_version: '2',
    source: 'code',
    updated_at: NOW,
  },
  {
    id: 'pesukim',
    label: 'Pesukim',
    description: 'Biblical-citation gutter icons + sidebar (proxied through /api/identify/pesukim).',
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
    status: 'promoted',
    def_hash: 'pesukim-llm-v1',
    cache_version: '2',
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
const RABBI_HEBRAIZE_STYLE = `STYLE: Write technical Hebrew/Aramaic terms with the Hebrew SCRIPT directly inside parentheses (NOT transliteration). e.g. "a leading Tanna (תנא)", "the academy at Yavneh (יבנה)", "in the name of (משם) Rabbi X". Do NOT emit transliterations like "(tanna)" or "(yavneh)". Use plain English with Hebrew-script parens only where genuinely technical. Verbatim daf quotes go in Hebrew script with quote marks.`;

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

${RABBI_HEBRAIZE_STYLE}`;

// rabbi.philosophy — signature positions, recurring themes.
const RABBI_PHILOSOPHY_SYSTEM_PROMPT = `You are a Talmud scholar. Describe one rabbi's KNOWN halachic / exegetical positions or recurring techniques, in concrete terms.

Output STRICT JSON only:

{
  "philosophy": "1-2 sentences. Name SPECIFIC positions they're known for: a particular halachic stance, a recurring exegetical technique (e.g. 'reads non-verbatim texts via gezerah shavah'), a frequent transmitter relationship. If you cannot name a specific, attested position, return empty string. NO vague evaluative language."
}

FORBIDDEN words/phrases (anti-pattern — never write these):
- "sensibility", "lens through which", "captures the essence", "embodies", "deeply concerned with", "consistently sought to", "intellectual fingerprint", "characteristic of his approach", "distinctive perspective", "lofty"
- Generic abstractions like "the integrity of the community", "spiritual depth", "tangible reality", "daily life"

REQUIRED form: specific named positions, concrete examples from their corpus, named relationships. Example of the style we want:
- "Rabbi Yochanan is the most-cited Amora in the Bavli; he frequently transmits in the name of Rabbi Yehudah ha-Nasi and is paired with Reish Lakish in disputes."
- "Holds that one fulfills the obligation of Shema only with kavanah; rejects R. Yose's view that anyone who fails to articulate the words has not fulfilled the mitzvah."

If you don't have specific factual content like this for the rabbi, return empty string.

${RABBI_HEBRAIZE_STYLE}`;

// rabbi.relationships — teachers, students, debate partners, family.
const RABBI_RELATIONSHIPS_SYSTEM_PROMPT = `You are a Talmud scholar. Identify a rabbi's most important relationships with other named rabbis: teachers, primary students, frequent debate partners, family ties.

Output STRICT JSON only:

{
  "relationships": "1-2 sentences naming up to 5-6 figures across the categories. Use phrasing like 'student of X, teacher of Y and Z, frequent debate partner of W'. Daf-agnostic."
}

Rules:
- Name actual rabbis where possible.
- Skip vague generalities ('the Sages', 'his colleagues') unless they're specific enough to matter (e.g. 'the Tannaim of Yavneh').

${RABBI_HEBRAIZE_STYLE}`;

// rabbi.daf-role — what THIS rabbi does on THIS daf, mechanically.
const RABBI_DAF_ROLE_SYSTEM_PROMPT = `You are a Talmud scholar. Describe what one specific rabbi is doing on the current daf — the local context, not their general biography.

Output STRICT JSON only:

{
  "daf_role": "1-2 sentences. State whether they're the originator of a teaching, a transmitter (saying it 'in the name of' someone), or a cited authority being invoked. Quote at most one short verbatim Hebrew phrase from the daf if it crystallizes their voice. If they appear only as a name in passing, say so."
}

${RABBI_HEBRAIZE_STYLE}`;

// rabbi.synthesis — combines bio + philosophy + relationships + daf-role
// into ONE concrete, fact-dense paragraph. User-facing card.
const RABBI_SYNTHESIS_SYSTEM_PROMPT = `You are a Talmud scholar. You'll receive four short paragraphs about one rabbi (bio, philosophy, relationships, daf-role). Combine them into ONE concrete paragraph (3-4 sentences) about this rabbi, anchored by what they do on the current daf.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, 3-4 sentences. Concrete facts only — names, dates, places, mechanical descriptions of what they say or cite. The reader should learn WHO the rabbi is (era, region, key teachers/students) AND what they specifically do on this daf (originator/transmitter/cited authority + a verbatim Hebrew phrase if it's distinctive)."
}

FORBIDDEN words/phrases (do NOT use any of these — they are LLM puff-prose or jargon):
- Puff: "sensibility", "lens through which", "captures the essence", "embodies", "consistently sought to", "deeply concerned with", "lofty", "tangible", "very sensibility", "spiritual depth", "intellectual fingerprint", "interpersonal", "self-accountability"
- Frame language: "this is the lens", "we see X through Y", "X reveals", "X showcases", "X exemplifies", "X is a window into"
- Generic abstractions: "the integrity of the community", "covenantal intimacy", "spiritual conviction"
- Adverbs of degree: "deeply", "profoundly", "characteristically"
- Specialist jargon that everyday English readers won't know: "tradent" (write "transmitter" or "cites X in the name of Y"), "asmakhta", "amoraic" (write "Amora" with a gloss), "tannaitic" (write "Tanna with a gloss"), "halakhic" (use "halachic" or just "legal"), "exegete" (write "interprets")
- Latin or technical loan words when plain English works ("apothegm", "dictum", "logion")

REQUIRED form: subject-verb-object sentences with named entities, plain English. Quote 1 short Hebrew phrase from the daf, in Hebrew script with quotes, if it's distinctive. Example of the style we want:

"Rabbi Levi bar Hama, a 2nd-generation Amora (אמורא) at Tiberias, often transmits teachings from Reish Lakish; he was a younger contemporary of Rabbi Yochanan. On Berakhot 5a he cites Reish Lakish twice — first that 'a person should always rouse the good inclination against the evil inclination' (לעולם ירגיז אדם יצר טוב על יצר הרע), and second that the Torah, Prophets, Writings, Mishnah, and Talmud were all given to Moses at Sinai. He is the messenger here, not the originator."

Notice: dates, place, named relationships, mechanical actions ('cites Reish Lakish twice'), one verbatim Hebrew quote. No evaluative vocabulary.

Rules:
- 3-4 sentences. Tight.
- If an input paragraph is empty or vague, skip that strand entirely; don't pad.
- If inputs disagree, defer to the bio.

${RABBI_HEBRAIZE_STYLE}`;

// Shared user prompt template for the four leaf rabbi enrichments. The
// synthesis has its own template that consumes depends.
const RABBI_LEAF_USER_TEMPLATE = `Rabbi:
{{mark_input}}

Tractate: {{tractate}}, page {{page}}.

Focal Hebrew of the daf:
{{hebrew}}

Return JSON per the schema.`;

const RABBI_SYNTHESIS_USER_TEMPLATE = `Rabbi:
{{mark_input}}

Tractate: {{tractate}}, page {{page}}.

Inputs to synthesize:

[BIO]
{{depends.rabbi.bio}}

[PHILOSOPHY]
{{depends.rabbi.philosophy}}

[RELATIONSHIPS]
{{depends.rabbi.relationships}}

[DAF ROLE]
{{depends.rabbi.daf-role}}

Weave these into ONE paragraph per the schema. The rabbi is the subject; the daf is the lens.`;

const RABBI_BIO_OUTPUT_SCHEMA = {
  name: 'rabbi_bio', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['bio'], properties: { bio: { type: 'string' } } },
};
const RABBI_PHILOSOPHY_OUTPUT_SCHEMA = {
  name: 'rabbi_philosophy', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['philosophy'], properties: { philosophy: { type: 'string' } } },
};
const RABBI_RELATIONSHIPS_OUTPUT_SCHEMA = {
  name: 'rabbi_relationships', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['relationships'], properties: { relationships: { type: 'string' } } },
};
const RABBI_DAF_ROLE_OUTPUT_SCHEMA = {
  name: 'rabbi_daf_role', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['daf_role'], properties: { daf_role: { type: 'string' } } },
};
const RABBI_SYNTHESIS_OUTPUT_SCHEMA = {
  name: 'rabbi_synthesis', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['synthesis'], properties: { synthesis: { type: 'string' } } },
};

function makeRabbiEnrichment(
  id: string,
  label: string,
  description: string,
  systemPrompt: string,
  userPromptTemplate: string,
  outputSchema: unknown,
  opts: { mode: 'augment-content' | 'aggregate'; depends?: string[]; defHash: string; cacheVersion: string },
): EnrichmentDefinition {
  return {
    id,
    label,
    description,
    target_mark: 'rabbi',
    mode: opts.mode,
    depends: opts.depends,
    extractor: {
      kind: 'llm',
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

export const CODE_ENRICHMENTS: EnrichmentDefinition[] = [
  // Leaf enrichments — each focuses on one facet of the rabbi. The
  // sidebar shows them as dev-mode-only individual cards. Production
  // users only see the synthesis.
  makeRabbiEnrichment(
    'rabbi.bio', 'Bio (general)',
    'Daf-agnostic biographical sketch — era, region, teachers, signature.',
    RABBI_BIO_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_BIO_OUTPUT_SCHEMA,
    { mode: 'augment-content', defHash: 'rabbi.bio-v4', cacheVersion: '4' },
  ),
  makeRabbiEnrichment(
    'rabbi.philosophy', 'Philosophy',
    'Signature halachic / aggadic stance + recurring exegetical method. Daf-agnostic.',
    RABBI_PHILOSOPHY_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_PHILOSOPHY_OUTPUT_SCHEMA,
    { mode: 'augment-content', defHash: 'rabbi.philosophy-v2', cacheVersion: '2' },
  ),
  makeRabbiEnrichment(
    'rabbi.relationships', 'Relationships',
    'Teachers, students, frequent debate partners, family. Daf-agnostic.',
    RABBI_RELATIONSHIPS_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_RELATIONSHIPS_OUTPUT_SCHEMA,
    { mode: 'augment-content', defHash: 'rabbi.relationships-v1', cacheVersion: '1' },
  ),
  makeRabbiEnrichment(
    'rabbi.daf-role', 'Daf role',
    'What this rabbi is mechanically doing on the current daf — originator / transmitter / cited authority.',
    RABBI_DAF_ROLE_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_DAF_ROLE_OUTPUT_SCHEMA,
    { mode: 'augment-content', defHash: 'rabbi.daf-role-v1', cacheVersion: '1' },
  ),
  // Synthesis — the user-facing card. Depends on the four leaves.
  makeRabbiEnrichment(
    'rabbi.synthesis', 'Synthesis',
    'One-paragraph view of the rabbi as a person, with the current daf as the lens. Synthesizes bio + philosophy + relationships + daf-role.',
    RABBI_SYNTHESIS_SYSTEM_PROMPT, RABBI_SYNTHESIS_USER_TEMPLATE, RABBI_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate',
      depends: ['rabbi.bio', 'rabbi.philosophy', 'rabbi.relationships', 'rabbi.daf-role'],
      defHash: 'rabbi.synthesis-v3',
      cacheVersion: '3',
    },
  ),
];

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
