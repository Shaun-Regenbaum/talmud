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
import { alwaysHebraizeBlock } from '../lib/hebrewTerms';

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
- "rabbiNames" enumerates EVERY distinct voice in the section in order: named rabbis ("Rabbi Eliezer"), collective voices ("Sages", "Tanna Kamma"), and every Stam/Gemara move ("Gemara's question", "First answer", "Objection"). When the Gemara offers multiple answers to the same question, each is its own entry.
- "title" and "summary" — NEVER literally translate a fixed Hebrew/Aramaic halachic phrase into bare English (no "most flesh" for רוב בשר, no "house of justice" for בית דין, no "son of his year" for בן שנתו, no "sons of Noah" for בני נח). If a phrase is a fixed technical term, keep it in Hebrew script (e.g. "without רוב בשר") or use the conventional English equivalent ("court", "Noahides", "a year-old animal"). Calque translations read as nonsense to the learner.`;

const ARGUMENT_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index. USE these indices for startSegIdx / endSegIdx:
{{segments_he}}

Identify the argument structure. Return JSON per the schema.`;

const ARGUMENT_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן מקור עברי/ארמי של עמוד ממוקד המחולק לקטעים ממוספרים ותרגומו לאנגלית (באותו מספור), זהה את מבנה הסוגיה כחטיבות נפרדות.

החזר JSON תקני בלבד — ללא markdown, ללא טקסט חופשי. ערכי "title" ו-"summary" ייכתבו בעברית.

{
  "summary": "סקירה בת משפט–שניים בעברית של מה שהדף הזה טוען.",
  "instances": [
    {
      "startSegIdx": 0,
      "endSegIdx": 4,
      "fields": {
        "title": "כותרת קצרה ותיאורית בעברית (למשל 'משנת הפתיחה', 'קושיית הגמרא הראשונה').",
        "summary": "תיאור בן 2–3 משפטים בעברית של מה החטיבה הזו טוענת.",
        "excerpt": "3-5 מילים בעברית/ארמית המועתקות מילה-במילה מן המקור העברי הממוקד, במקום שבו החטיבה מתחילה.",
        "endExcerpt": "3-5 מילים בעברית/ארמית המועתקות מילה-במילה מן המקור העברי, במקום שבו החטיבה מסתיימת (המילים האחרונות של החטיבה, מיד לפני שמתחילה החטיבה הבאה). חייבות להיות שונות מ-excerpt אלא אם החטיבה היא ביטוי יחיד.",
        "rabbiNames": ["Rabbi Yochanan", "Gemara's question", "First answer"]
      }
    }
  ]
}

כללים:
- חלק את העמוד הממוקד ל-3-8 חטיבות לפי מבנה הטיעון, לא לפי פסקה.
- החטיבות חייבות לחלק את הדף במדויק: startSegIdx של חטיבה i+1 שווה ל-endSegIdx של חטיבה i ועוד 1; ללא רווחים, ללא חפיפות.
- לחטיבה בת קטע אחד, startSegIdx שווה ל-endSegIdx.
- "excerpt" ו-"endExcerpt" חייבים להיות עברית/ארמית המועתקות מילה-במילה מן המקור — לעולם אל תתרגם. excerpt מעגן את מילות הפתיחה של החטיבה, endExcerpt את מילות הסיום. יחד עליהם להתאים לטווח האמיתי של החטיבה — אל תמשיך את endExcerpt אל תוכן החטיבה הבאה.
- "rabbiNames" מונה כל קול נבדל בחטיבה לפי הסדר: חכמים נקובים, קולות קיבוציים ("Sages", "Tanna Kamma"), וכל מהלך של הסתמא/הגמרא ("Gemara's question", "First answer", "Objection"). השאר ערכים אלה באנגלית כפי שבדוגמה, כדי שיתאימו לזיהוי הקולות במערכת. כשהגמרא מציעה כמה תשובות לאותה קושיה, כל אחת היא ערך נפרד.
- "title" ו-"summary" נכתבים בעברית. מונח הלכתי/ארמי קבוע — השאר אותו בכתב עברי כפי שהוא (למשל "רוב בשר", "בית דין", "בני נח").`;

const ARGUMENT_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

מקור עברי/ארמי — כל שורה מתחילה ב-[N], אינדקס הקטע (מבוסס-0). השתמש באינדקסים אלה עבור startSegIdx / endSegIdx:
{{segments_he}}

זהה את מבנה הסוגיה. החזר JSON לפי הסכמה.`;

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
- Use Sefaria-style English transliteration with the (term) auto-hebraize convention: "the time for evening Shema (kriat shema)", "an act of designation (yi'ud)".
- NEVER literally translate a fixed Hebrew/Aramaic halachic phrase into bare English. Calques like "most flesh" (for רוב בשר), "house of justice" (for בית דין), "son of his year" (for בן שנתו), "sons of Noah" (for בני נח) are forbidden. Either keep the Hebrew (Sefaria-style transliteration + auto-hebraize, e.g. "rov basar") or use the conventional English equivalent ("court", "Noahides", "year-old animal").`;

const HALACHA_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index. USE these indices for startSegIdx / endSegIdx:
{{segments_he}}

Identify halachic topics. Return JSON per the schema.`;

const HALACHA_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בהלכה. בהינתן מקור עברי/ארמי של עמוד ממוקד המחולק לקטעים ממוספרים ותרגומו לאנגלית (באותו מספור), זהה את הנושאים ההלכתיים המעשיים העיקריים הנידונים בדף.

החזר JSON תקני בלבד. ערכי "topic" ו-"summary" ייכתבו בעברית.

{
  "instances": [
    {
      "startSegIdx": 0,
      "endSegIdx": 3,
      "fields": {
        "topic": "כותרת קצרה בעברית לנושא (למשל 'זמן קריאת שמע של ערבית').",
        "topicHe": "תווית עברית קצרה לנושא (3-5 מילים).",
        "summary": "הסבר בן 2–3 משפטים בעברית של איזו שאלה הלכתית מתבררת בטווח הקטעים הזה.",
        "excerpt": "3-5 מילים בעברית/ארמית המועתקות מילה-במילה מן המקור, במקום שבו הנושא מתחיל."
      }
    }
  ]
}

כללים:
- 1-5 נושאים לדף. דלג על חלקים אגדיים או דרשניים גרידא שאין בהם פסק הלכה.
- "excerpt" חייב להיות עברית/ארמית מילה-במילה מן המקור.
- "startSegIdx" / "endSegIdx" חייבים להיות אינדקסים תקפים מבוססי-0 מסימוני ה-[N] שבמקור הממוספר. לנושא בן קטע אחד, start שווה ל-end.
- "topic" ו-"summary" נכתבים בעברית. מונח הלכתי/ארמי קבוע — השאר אותו בכתב עברי כפי שהוא (למשל "רוב בשר", "בית דין", "בני נח").`;

const HALACHA_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

מקור עברי/ארמי — כל שורה מתחילה ב-[N], אינדקס הקטע (מבוסס-0). השתמש באינדקסים אלה עבור startSegIdx / endSegIdx:
{{segments_he}}

זהה נושאים הלכתיים. החזר JSON לפי הסכמה.`;

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
        "excerpt": "3-5 Hebrew/Aramaic words copied VERBATIM from the source where this aggadah BEGINS.",
        "endExcerpt": "Last 3-5 Hebrew/Aramaic words of the story, copied VERBATIM from the source — where this aggadah ENDS on the daf. NOT the start of the next halachic discussion or the next story. If the story is one line long, this can still be the closing 3-5 words of that same line; it MUST NOT equal excerpt.",
        "theme": "One word/short phrase tag: 'martyrdom' | 'study' | 'prayer' | 'reward' | 'suffering' | 'miracle' | 'parable' | 'ethics' | 'biography' | 'other'."
      }
    }
  ]
}

Rules:
- 0-6 aggadic units per daf. Many dafim have none — return an empty instances array if so.
- "excerpt" AND "endExcerpt" MUST be Hebrew/Aramaic verbatim from the source. excerpt anchors the story's start; endExcerpt anchors its end. The two MUST differ (an aggadic unit is at least one sentence long).
- endExcerpt is the LAST 3-5 words of the story itself — the closing words of the narrative or maxim. Do NOT pick the first words of whatever comes next on the daf.
- "startSegIdx" / "endSegIdx" must be valid 0-based indices from the [N] markers. endSegIdx must be the segment that contains endExcerpt.
- Use Sefaria-style English transliteration with the (term) auto-hebraize convention.
- NEVER literally translate a fixed Hebrew/Aramaic halachic phrase into bare English. Calques like "most flesh" (for רוב בשר), "house of justice" (for בית דין), "son of his year" (for בן שנתו), "sons of Noah" (for בני נח) are forbidden. Either keep the Hebrew (Sefaria-style transliteration + auto-hebraize) or use the conventional English equivalent ("court", "Noahides", "year-old animal").`;

const AGGADATA_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index. USE these indices for startSegIdx / endSegIdx:
{{segments_he}}

Identify aggadic units. Return JSON per the schema (empty instances array if there are none).`;

const AGGADATA_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן מקור עברי/ארמי של עמוד ממוקד (קטעים ממוספרים) ותרגומו לאנגלית (באותו מספור), זהה כל יחידה אגדית — סיפורי מעשה, אנקדוטות ביוגרפיות, משלים, דיווחי חלום/נס, ומימרות מוסר השזורות בנרטיב. דלג על דרשה הלכתית גרידא.

החזר JSON תקני בלבד. ערכי "title" ו-"summary" ייכתבו בעברית.

{
  "instances": [
    {
      "startSegIdx": 0,
      "endSegIdx": 3,
      "fields": {
        "title": "כותרת קצרה בעברית (למשל 'תפילת התלמיד העני').",
        "titleHe": "תווית עברית קצרה (3-5 מילים).",
        "summary": "סיכום בן 2–3 משפטים בעברית של מה שקורה בסיפור / מה שהמימרה מלמדת.",
        "excerpt": "3-5 מילים בעברית/ארמית המועתקות מילה-במילה מן המקור, במקום שבו האגדה מתחילה.",
        "endExcerpt": "3-5 המילים האחרונות של הסיפור, מועתקות מילה-במילה מן המקור — במקום שבו האגדה מסתיימת בדף. לא תחילת הדיון ההלכתי הבא או הסיפור הבא. אם הסיפור באורך שורה אחת, אלה עדיין מילות הסיום של אותה שורה; חייבות להיות שונות מ-excerpt.",
        "theme": "תגית של מילה/ביטוי קצר באנגלית: 'martyrdom' | 'study' | 'prayer' | 'reward' | 'suffering' | 'miracle' | 'parable' | 'ethics' | 'biography' | 'other'."
      }
    }
  ]
}

כללים:
- 0-6 יחידות אגדה לדף. בדפים רבים אין כלל — החזר מערך instances ריק במקרה כזה.
- "excerpt" וגם "endExcerpt" חייבים להיות עברית/ארמית מילה-במילה מן המקור. excerpt מעגן את תחילת הסיפור; endExcerpt את סופו. השניים חייבים להיות שונים (יחידה אגדית היא לכל הפחות משפט אחד).
- endExcerpt הוא 3-5 המילים האחרונות של הסיפור עצמו — מילות הסיום של הנרטיב או המימרה. אל תבחר את מילות הפתיחה של מה שבא אחריו בדף.
- "startSegIdx" / "endSegIdx" חייבים להיות אינדקסים תקפים מבוססי-0 מסימוני ה-[N]. endSegIdx הוא הקטע המכיל את endExcerpt.
- "theme" נשאר ערך אנגלי מן הרשימה הסגורה לעיל.
- "title" ו-"summary" נכתבים בעברית. מונח הלכתי/ארמי קבוע — השאר אותו בכתב עברי כפי שהוא.`;

const AGGADATA_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

מקור עברי/ארמי — כל שורה מתחילה ב-[N], אינדקס הקטע (מבוסס-0). השתמש באינדקסים אלה עבור startSegIdx / endSegIdx:
{{segments_he}}

זהה יחידות אגדה. החזר JSON לפי הסכמה (מערך instances ריק אם אין).`;

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
              required: ['title', 'titleHe', 'summary', 'excerpt', 'endExcerpt', 'theme'],
              properties: {
                title: { type: 'string' },
                titleHe: { type: 'string' },
                summary: { type: 'string' },
                excerpt: { type: 'string' },
                endExcerpt: { type: 'string' },
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
- startSegIdx / endSegIdx must be valid 0-based indices from the [N] markers.
- "summary" — NEVER literally translate a fixed Hebrew/Aramaic halachic phrase into bare English. Calques like "most flesh" (for רוב בשר), "house of justice" (for בית דין), "son of his year" (for בן שנתו), "sons of Noah" (for בני נח) are forbidden. Either keep the Hebrew or use the conventional English equivalent.`;

const PESUKIM_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index:
{{segments_he}}

Identify Tanach references. Return JSON per the schema (empty instances if none).`;

const PESUKIM_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בתנ"ך ובש"ס. בהינתן מקור עברי/ארמי של עמוד ממוקד (קטעים ממוספרים) ותרגומו לאנגלית (באותו מספור), זהה כל הפניה לפסוק מן התנ"ך בדף — ציטוטים מפורשים, רמזים, ופרפראזות.

החזר JSON תקני בלבד. ערך "summary" ייכתב בעברית.

{
  "instances": [
    {
      "startSegIdx": 5,
      "endSegIdx": 5,
      "fields": {
        "verseRef": "הפניה קנונית בסגנון Sefaria באנגלית, למשל 'Psalms 4:5', 'Genesis 24:63', 'Isaiah 6:3'.",
        "citationStyle": "'explicit' | 'allusion' | 'paraphrase'",
        "excerpt": "המילים בעברית/ארמית מן הדף המצטטות או רומזות לפסוק — מועתקות מילה-במילה מן המקור. זו תחילת ביטוי הציטוט.",
        "endExcerpt": "3-5 המילים האחרונות של ביטוי הציטוט, מועתקות מילה-במילה. לציטוט קצר/בן שורה זה יכול להיות סוף \"excerpt\"; לציטוט ארוך יותר זה מסמן היכן מסתיים ציטוט-הפסוק בדף. מחרוזת ריקה אינה קבילה כשהציטוט ארוך מ-5 מילים.",
        "summary": "1–2 משפטים בעברית המסבירים כיצד הפסוק משמש בהקשר זה (ראיה, אסמכתא, ניגוד, עוגן דרשני)."
      }
    }
  ]
}

כללים:
- 0-15 פסוקים לדף. בחלק אין כלל — החזר instances ריק במקרה כזה.
- לציטוטים מפורשים המסומנים ב-שנאמר / שנא' / דכתיב / כדכתיב / אמר קרא — השתמש ב-citationStyle: "explicit".
- לניסוח המהדהד פסוק אך אינו מציג אותו — השתמש ב-citationStyle: "allusion".
- לפרפראזה חופשית — השתמש ב-citationStyle: "paraphrase".
- "verseRef" נשאר הפניה קנונית באנגלית בסגנון Sefaria. "citationStyle" נשאר ערך אנגלי מן הרשימה.
- "excerpt" וגם "endExcerpt" חייבים להיות עברית/ארמית מילה-במילה מן המקור. excerpt מעגן את תחילת הציטוט; endExcerpt את סופו. לציטוט בן 2-5 מילים בלבד הם עשויים לחלוק מילים אך לא להיות זהים אלא אם הציטוט הוא ביטוי קצר יחיד.
- startSegIdx / endSegIdx חייבים להיות אינדקסים תקפים מבוססי-0 מסימוני ה-[N].
- "summary" נכתב בעברית. מונח הלכתי/ארמי קבוע — השאר אותו בכתב עברי כפי שהוא.`;

const PESUKIM_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

מקור עברי/ארמי — כל שורה מתחילה ב-[N], אינדקס הקטע (מבוסס-0):
{{segments_he}}

זהה הפניות לתנ"ך. החזר JSON לפי הסכמה (instances ריק אם אין).`;

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
    def_hash: 'rabbi-v2',
    cache_version: '2',
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
      system_prompt_he: ARGUMENT_SYSTEM_PROMPT_HE,
      user_prompt_template_he: ARGUMENT_USER_TEMPLATE_HE,
      output_schema: ARGUMENT_OUTPUT_SCHEMA,
      thinking_off: true,
    },
    dependencies: ['gemara'],
    status: 'promoted',
    def_hash: 'argument-llm-v3',
    cache_version: '4',
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
      system_prompt_he: HALACHA_SYSTEM_PROMPT_HE,
      user_prompt_template_he: HALACHA_USER_TEMPLATE_HE,
      output_schema: HALACHA_OUTPUT_SCHEMA,
      thinking_off: true,
    },
    dependencies: ['gemara'],
    status: 'promoted',
    def_hash: 'halacha-llm-v2',
    cache_version: '3',
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
      system_prompt_he: AGGADATA_SYSTEM_PROMPT_HE,
      user_prompt_template_he: AGGADATA_USER_TEMPLATE_HE,
      output_schema: AGGADATA_OUTPUT_SCHEMA,
      thinking_off: true,
    },
    dependencies: ['gemara'],
    status: 'promoted',
    def_hash: 'aggadata-llm-v3',
    cache_version: '4',
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
      system_prompt_he: PESUKIM_SYSTEM_PROMPT_HE,
      user_prompt_template_he: PESUKIM_USER_TEMPLATE_HE,
      output_schema: PESUKIM_OUTPUT_SCHEMA,
      thinking_off: true,
    },
    dependencies: ['gemara'],
    status: 'promoted',
    def_hash: 'pesukim-llm-v4',
    cache_version: '5',
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
- NEVER calque-translate a fixed Hebrew/Aramaic halachic phrase into bare English. A "calque" is a word-for-word literal translation that produces grammatically marked or meaningless English. If the English would only make sense to someone who already knows the underlying Hebrew term, the term IS the technical concept and MUST appear in Hebrew script. The English is then a gloss in parens — not a replacement.
    BAD:  "Eli's broken neck occurred without most flesh"                  (calque of רוב בשר)
    BAD:  "the requirement of severing most of the flesh"                  (same calque, padded)
    BAD:  "a son of his year"                                               (calque of בן שנתו)
    BAD:  "the house of justice"                                            (calque of בית דין — use 'בית דין' or English 'court')
    BAD:  "the sons of Noah's commandments"                                 (calque of שבע מצוות בני נח)
    BAD:  "great in fear of Heaven"                                         (calque of גדול ביראת שמים)
    GOOD: "Eli's broken neck occurred without רוב בשר (the majority of surrounding flesh that normally must tear with the spine)"
    GOOD: "a בן שנתו (year-old animal)"
    GOOD: "the שבע מצוות בני נח (Noahide laws)"
  Heuristic: read the sentence aloud in English. If a reader who doesn't know the term has to stop and ask "wait, most WHAT?" or "year of what?", you've calqued. Restore the Hebrew.
- Common terms to ALWAYS hebraize (any time you use them, pair with Hebrew script):
${alwaysHebraizeBlock()}
- Verbatim daf / pasuk excerpts go in Hebrew script with quote marks, optionally followed by an English gloss in parens.
- HARD RULE — verbatim daf words in quotes ('…' or "…") MUST be Hebrew/Aramaic script, NEVER transliteration. The single-quoted form is a signal that what's inside is a direct quote from the daf, and direct quotes are by definition in the source language.
    BAD:  "the gemara uses 'hutz'u' to describe how they were brought out"
    BAD:  "the term 'amar' indicates direct attribution"
    GOOD: "the gemara uses 'הוצאו' (they were brought out) to describe…"
    GOOD: "the term 'אמר' indicates direct attribution"
  If you don't remember the Hebrew/Aramaic verbatim, paraphrase in English instead of writing the transliteration in quotes. NEVER fake a verbatim quote with transliteration.
- Plain English is the BASE; Hebrew script is the technical anchor. Don't pile Hebrew script on every common word — only where the term is genuinely the technical concept.`;

/**
 * Hebrew-output style guide — the lang='he' counterpart of HEBREW_GLOSS_STYLE.
 * The gloss convention INVERTS in Hebrew mode: there is no English base to
 * gloss into, so technical terms are simply written in their natural Hebrew
 * form with no parenthetical aid. Every *_SYSTEM_PROMPT_HE appends this the
 * way the English prompts append HEBREW_GLOSS_STYLE. The hard rules about
 * keeping JSON keys / enum values / required-English-name fields in English
 * live here so every Hebrew prompt inherits them uniformly.
 */
const HEBREW_NATIVE_STYLE = `סגנון — כתיבה בעברית (החל באופן אחיד על כל הפרוזה):

- כתוב את כל שדות הטקסט החופשי בעברית רהוטה, ברמה המתאימה ללומד תורה משכיל. עברית תקנית עם מינוח תלמודי טבעי.
- מונחים הלכתיים ותלמודיים — כתוב אותם בעברית כצורתם הטבעית (לכתחילה, בדיעבד, גזירה שווה, רוב, חזקה, ספק, טומאה, טהרה). אל תוסיף תרגום או הסבר באנגלית בסוגריים — זהו ההפך מן המצב האנגלי; כאן כל הטקסט ממילא בעברית.
- שמות חכמים ומקומות — כתוב בעברית כמקובל בספרות חז"ל (רבי יוחנן, רבא, אביי, ריש לקיש; טבריה, ציפורי, סורא, נהרדעא, פומבדיתא, יבנה, קיסריה, לוד).
- ציטוטים מן הדף או מן הפסוק — בעברית/ארמית מילה במילה, בתוך מירכאות. לעולם אל תכתוב תעתיק לטיני בתוך מירכאות.

כללים נוקשים (הפלט נפסל אם מופרים):
- שמות השדות (keys) ב-JSON, וכל ערכי ה-enum (כגון "halachist", "israel", "high", "teacher"), חייבים להישאר באנגלית בדיוק כפי שהוגדרו בסכימה. תרגם לעברית אך ורק את ערכי המחרוזת הפרוזאיים — לעולם לא את שמות השדות ולא את ערכי ה-enum.
- שדה המבקש במפורש שם באנגלית (למשל "name": "Conventional English name") — מלא אותו באנגלית כנדרש. שדה מקביל "nameHe" — מלא בעברית.
- ציטוטי excerpt מן הדף נשארים בעברית/ארמית מילה במילה כפי שהם בדף, ללא שינוי.
- הימנע ממליצות ריקות ומשפה מנופחת. אל תכתוב: "תמצית", "מבעד לעדשה של", "מגלם", "עומק רוחני", "ביטוי מובהק", "רגישות עמוקה", "שואף בעקביות", "טבוע בו". כתוב משפטי נושא-נשוא-מושא ענייניים עם עובדות קונקרטיות (תקופה, אזור, שמות חכמים, שיטות).
- עברית היא שפת הבסיס; אין צורך לפזר מילים לועזיות או תעתיקים.`;


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

// ===========================================================================
// HEBREW-OUTPUT PROMPTS (lang='he'). Full parallels of the English rabbi
// prompts above. They share the EXACT JSON contract — same keys, same enum
// values, same template variables — with their English counterparts; only
// the prose instructions and field descriptions are in Hebrew. The
// prompt-parity test (tests/prompt-parity.test.ts) enforces that parity.
// Fields that must stay English (JSON keys, enum values, "Conventional
// English name" fields) are kept English here on purpose.
// ===========================================================================

const RABBI_BIO_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. כתוב מתווה ביוגרפי תמציתי בן 2-3 משפטים על חכם אחד. ביוגרפיה כללית — התמקד במי האדם הזה בקשת הרחבה של חייו ופועלו, ולא במה שהוא עושה בדף מסוים.

החזר JSON תקין בלבד:

{
  "bio": "2-3 משפטים. תקופה ושנים, אזור (ארץ ישראל / בבל / ישיבות מסוימות), רבותיו הבולטים, ועמדה הלכתית או אגדית אופיינית אם יש. קונקרטי וצפוף; ללא מילוי מיותר."
}

כללים:
- 2-3 משפטים לכל היותר.
- טענות היסטוריות חייבות להתאים לדור שסופק בקלט.
- אל תזכיר מה החכם עושה בדף המסוים הזה. לכך מיועד enrichment אחר.

${HEBREW_NATIVE_STYLE}`;

const RABBI_PHILOSOPHY_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. תאר את העמדה הרחבה של חכם אחד על פני הש"ס כולו ואת שיטת הדרשנות החוזרת שלו — מה הוא מחזיק לאורך כלל מאמריו, ולא מה שהוא אומר במקרה בדף אחד.

החזר JSON תקין בלבד:

{
  "philosophy": "2-3 משפטים. נקוב בעמדות או בשיטות מסוימות שהוא ידוע בהן על פני הש"ס כולו: עמדה הלכתית חוזרת (למשל 'פוסק בעקביות כדעה המקילה בענייני טומאה'), שיטה דרשנית אופיינית (למשל 'דורש גזירה שווה בטקסטים שאינם מפורשים'), או דרך טיעון קבועה. מותר לסיים במשפט אחד הנוקב במסורת מייצגת אחת; מסורת זו אינה חייבת להיות בדף הנוכחי. אם אינך יכול לנקוב בעמדה מסוימת ומבוססת מכלל מאמריו, החזר מחרוזת ריקה."
}

מילים וביטויים אסורים (אל תכתוב לעולם):
- "רגישות", "מבעד לעדשה של", "לוכד את התמצית", "מגלם", "עוסק לעומק ב", "שאף בעקביות", "טביעת אצבע אינטלקטואלית", "אופייני לגישתו", "נקודת מבט ייחודית", "נשגב"
- הפשטות כלליות: "שלמות הקהילה", "עומק רוחני", "מציאות מוחשית", "חיי היומיום"
- מסגור מקומי לדף: "בדף זה", "בסוגיה הנוכחית", "כאן הוא מחזיק" — enrichment זה אינו תלוי-דף; אל תתייחס לדף המוקד.

הצורה הנדרשת: עמדות נקובות ומסוימות על פני כלל המאמרים, דוגמאות קונקרטיות, שיטות נקובות. דוגמה לסגנון הרצוי:
- "רבי יוחנן רגיל למסור בשם רבי יהודה הנשיא ומופיע בזוגות מחלוקת עם ריש לקיש; בענייני הלכה הוא נוטה לדעה המחמירה, ושיטת הדרשנות שלו נשענת בכבדות על קריאות מדרשיות צמודות של פסוקים."
- "אביי ידוע בהבחנותיו ההגיוניות הדקות במחלוקותיו עם רבא; הכלל הרשום בבבלי הוא שהלכה כרבא חוץ משישה מקומות הנמנים תחת יע"ל קג"ם."

אם אין לך תוכן עובדתי מסוים כזה על החכם, החזר מחרוזת ריקה.

${HEBREW_NATIVE_STYLE}`;

const RABBI_RELATIONSHIPS_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. זהה את הקשרים החשובים ביותר של חכם עם חכמים נקובים אחרים: רבותיו, תלמידיו המרכזיים, בני הפלוגתא התדירים, וקשרי משפחה. הצג כרשימות מובנות בתוספת סיכום פרוזה קצר.

החזר JSON תקין בלבד:

{
  "teachers":  [{ "name": "Conventional English name", "primary": true | false, "note": "הקשר אופציונלי במשפט אחד בעברית, מחרוזת ריקה אם אין" }],
  "students":  [{ "name": "Conventional English name", "primary": true | false, "note": "..." }],
  "debatePartners": [{ "name": "Conventional English name", "note": "..." }],
  "family":    [{ "name": "Conventional English name", "relation": "uncle | father | son | nephew | brother-in-law | etc. (ערך זה נשאר באנגלית)" }],
  "prose": "1-2 משפטים בעברית המסכמים את הנ"ל (ה-synthesis צורך אותם; הקוראים רואים את הרשימות)."
}

הבהרת זהות:
- ייתכן שלחכם בקלט יש שם נפוץ המשותף לכמה דמויות היסטוריות (למשל "רבי אלעזר" עשוי להתייחס לרבי אלעזר בן פדת, רבי אלעזר בן שמוע, רבי אלעזר בן עזריה, רבי אלעזר בן ערך, ועוד). השתמש בשדות "generation" + "region" + "places" שבקלט כדי לקבוע באיזו דמות מדובר. דוגמה: "רבי אלעזר" עם generation=amora-ey-3 + region=israel = רבי אלעזר בן פדת (תלמידו המובהק של רבי יוחנן).
- לאחר שקבעת את הזהות, מלא את הרשימות עבור אותה דמות. אל תצמצם למערכים ריקים רק משום שהשם המופשט רב-משמעי — שדות הדור/האזור/המקומות מבהירים אותו.
- רק אם השם כללי כל כך שאף עם הדור והאזור אינך מצליח לזהות דמות היסטורית מסוימת — רק אז החזר מערכים ריקים.

שמות פטרונימיים (כלל נוקשה):
- אם "name" שבקלט כולל פטרונים — "X bar Y", "X ben Y", "X b. Y", "פלוני בן פלוני", "פלוני בריה דרב פלוני" — אזי Y הוא הורה וחייב להופיע במערך "family" עם relation="father" (או "mother" עבור "X b. Imma Y"). זה אינו ניתן למשא ומתן: הפטרונים הוא ראיה נומינלית ישירה להורה.
  דוגמאות:
  - "Mar, son of Ravina" / "Mar bar Ravina" → family חייב לכלול { name: "Ravina", relation: "father" }
  - "Abba bar Abba" → family חייב לכלול { name: "Abba", relation: "father" }
  - "Rava bar Rav Yosef bar Chama" → family חייב לכלול { name: "Rav Yosef bar Chama", relation: "father" }
  - "Rabbah bar bar Chana" → family חייב לכלול { name: "Bar Chana", relation: "father" } ו-{ name: "Chana", relation: "grandfather" }
- אם הורה הנקוב בפטרונים היה בעצמו חכם ידוע, פעמים רבות (לא תמיד) הוא גם רבו המובהק של החכם. במקרה כזה (למשל רבא בר רב יוסף שלמד אצל אביו), הוסף את ההורה גם ל-"family" (father) וגם ל-"teachers" (primary).

ציפיות לפי דור:
- עבור כל חכם המתועד היטב בתלמוד או במקורות הקלאסיים, צפה ללפחות רב אחד ותלמיד אחד בפלט. לרוב האמוראים והתנאים יש כמה רבותיים וכמה תלמידים ידועים.
- אמוראי בבל המאוחרים (amora-bavel-6/7/8) הם עורכי הש"ס האחרונים וכמעט תמיד יש להם רב מובהק ידוע (בדרך כלל רב אשי או רבינא) ולעיתים קרובות מספר חברים נקובים. אל תחזיר מערך ריק עבורם.
- החזרת teachers=[] ו-students=[] מקובלת רק כשהחכם באמת בלתי ידוע (דמות המוזכרת פעם אחת ללא קשרים ידועים).

כללים:
- סמן primary=true לכל היותר ב-1-2 ערכים ב-teachers וב-1-2 ב-students. primary = הקשר קנוני לזיהוי החכם (למשל עבור אביי: הרב המובהק = רבה בר נחמני; בן הפלוגתא המובהק = רבא). כל השאר primary=false.
- נקוב בחכמים ממשיים היכן שאפשר — דלג על הכללות מעורפלות ('החכמים', 'חבריו') אלא אם הן מסוימות דיין (למשל 'תנאי יבנה').
- "note" אופציונלי — העבר מחרוזת ריקה אם אין מה להוסיף.

${HEBREW_NATIVE_STYLE}`;

const RABBI_CLASSIFICATION_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. סווג חכם אחד לפי אופן הפעילות העיקרי שלו במקורות הקלאסיים.

החזר JSON תקין בלבד:

{
  "category": "aggadist" | "halachist" | "exegetist",
  "justification": "משפט אחד. נמק את בסיס הסיווג — למשל יחס החומר ההלכתי לעומת האגדי המיוחס לו, שיטה אופיינית, או הדרך שבה המסורת המאוחרת מאפיינת אותו."
}

כללים:
- "halachist": חכמים הידועים בעיקר בפסיקת הלכה, בזוגות מחלוקת, ובהכרעות הלכתיות (למשל אביי, רבא, שמואל).
- "aggadist": חכמים הידועים בעיקר בתורות מוסר/אגדה/מחשבה (למשל רבי יהושע בן לוי, רבי עקיבא במעשה מרכבה).
- "exegetist": חכמים הידועים בעיקר בפרשנות מקרא/מדרש כפועלם האופייני (למשל רבי ישמעאל, רבי עקיבא בסדר המדרשים).
- רוב החכמים הם כל השלושה במידה כלשהי — בחר את הציר הדומיננטי. אם באמת חצי-חצי, ברירת המחדל היא halachist עבור חכמי בבל.
- ה-justification יהיה משפט הצהרתי יחיד, ללא היסוס.

${HEBREW_NATIVE_STYLE}`;

const RABBI_GEOGRAPHY_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. תאר את הגיאוגרפיה של חיי החכם: היכן נולד, היכן למד בעיקר, באילו מקומות השתתף או מופיע בסיפורים מהם, והאם נדד אי-פעם בין בבל לארץ ישראל (או נדידות משמעותיות אחרות). אינו תלוי-דף.

החזר JSON תקין בלבד:

{
  "birthplace": { "place": "עיר או אזור בעברית, או מחרוזת ריקה אם לא ידוע.", "region": "israel" | "bavel" | "other" | "unknown" },
  "primaryStudyPlaces": [{ "place": "עיר", "academy": "שם ישיבה/מתיבתא אם מתועד, מחרוזת ריקה אחרת", "period": "שלב חיים אופציונלי במשפט אחד, למשל 'מנעוריו ואילך'; מחרוזת ריקה אם לא ידוע" }],
  "notablePlaces": [{ "place": "עיר", "event": "תיאור במשפט אחד מדוע מקום זה חשוב לחכם (סיפור, פסק, אירוע חיים)" }],
  "movements": [{ "from": "בבל | ארץ ישראל | עיר מסוימת", "to": "בבל | ארץ ישראל | עיר מסוימת", "approximateWhen": "קירוב במשפט אחד אם ידוע, מחרוזת ריקה אם לא", "reason": "סיבה במשפט אחד אם ידועה (לימוד, גלות, קריאה ציבורית), מחרוזת ריקה אם לא" }],
  "prose": "סיכום בן 1-2 משפטים בעברית; ה-synthesis צורך אותו."
}

הבהרת זהות:
- ייתכן שלחכם בקלט יש שם נפוץ המשותף לכמה דמויות (למשל "רבי אלעזר"). השתמש בשדות "generation" + "region" + "places" כדי לקבוע באיזו דמות מדובר. לאחר הקביעה, מלא את הגיאוגרפיה עבור אותה דמות — אל תצמצם למערכים ריקים רק בגלל רב-משמעות השם.
- לרוב התנאים והאמוראים המתועדים היטב יש לפחות מקום לימוד אחד ידוע (עיר ישיבה). עבור amora-bavel-* חשוב על סורא/פומבדיתא/נהרדעא; עבור amora-ey-* חשוב על טבריה/קיסריה/ציפורי; עבור tanna-* חשוב על יבנה/אושא/בני ברק/ציפורי. החזרת primaryStudyPlaces=[] מקובלת רק עבור דמויות בלתי ידועות באמת.

כללים:
- עבור כל חכם מתועד היטב, צפה ללפחות ערך אחד ב-primaryStudyPlaces. מערכים ריקים מקובלים רק כשהגיאוגרפיה באמת לא ידועה — לא כפתח מילוט בשם רב-משמעי.
- birthplace.place עשוי להיות ריק כדין כשאין מקור לכך. קבע את birthplace.region לאזור הפעילות העיקרי של החכם (israel/bavel) גם כשהעיר לא ידועה.
- השתמש בשמות מקומות עבריים מקובלים בספרות חז"ל (טבריה, ציפורי, סורא, נהרדעא, פומבדיתא, יבנה, קיסריה, לוד).
- "movements" יכלול רק נדידות בבל↔ארץ ישראל מתועדות או העתקות מקום משמעותיות אחרות. אל תמנה כל בית כנסת שחכם ביקר בו.
- אם החכם מעולם לא נדד בין אזורים, השאר את "movements" כמערך ריק.

${HEBREW_NATIVE_STYLE}`;

const RABBI_RELATIONSHIPS_EVIDENCE_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן קשריו הידועים של חכם (מ-rabbi.relationships) וטקסט המקור של הדף הנוכחי, מצא כל ציטוט בעברית/ארמית בדף זה המזכיר אחת מאותן דמויות נקובות ביחס לחכם הנדון (רב, תלמיד, בן פלוגתא, משפחה). מערך ריק אם הדף אינו מתייחס לאף אחת מהן.

החזר JSON תקין בלבד:

{
  "evidence": [
    {
      "kind": "teacher" | "student" | "partner" | "family",
      "name": "Conventional English name (חייב להתאים לאחד מן הקלט rabbi.relationships)",
      "excerpt": "3-7 מילים בעברית/ארמית המועתקות מילה במילה מן הדף, במקום שבו הקשר עולה",
      "note": "תיאור במשפט אחד בעברית של מה שמתרחש (למשל 'אביי מצטט את רבא', 'במחלוקת עם', 'אביו מלמד')"
    }
  ]
}

כללים:
- כלול רק חכמים מן הקלט rabbi.relationships — אל תרחיב.
- "excerpt" חייב להיות עברית/ארמית מילה במילה מן הדף. ייעשה לו התאמה בצד השרת לחישוב טווחי הדגשה ללחיצה.
- אם הדף מזכיר את אותו קשר בכמה מקומות, פלוט ערך אחד לכל מיקום.
- מערך evidence ריק מקובל — לרוב קשריו של חכם אינם מוזכרים במישרין בכל דף.

${HEBREW_NATIVE_STYLE}`;

const RABBI_GEOGRAPHY_EVIDENCE_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן הגיאוגרפיה הידועה של חכם (מ-rabbi.geography) וטקסט המקור של הדף הנוכחי, מצא כל ציטוט בעברית/ארמית המתייחס לאחד ממקומותיו הידועים של החכם, לישיבותיו, או לנדידותיו המתועדות. מערך ריק אם אין.

החזר JSON תקין בלבד:

{
  "evidence": [
    {
      "kind": "birthplace" | "study" | "notable" | "movement",
      "place": "שם המקום (או מחרוזת ריקה אם הציטוט מתייחס לנדידה באופן מופשט)",
      "excerpt": "3-7 מילים בעברית/ארמית המועתקות מילה במילה מן הדף",
      "note": "תיאור במשפט אחד בעברית של מה שמתרחש"
    }
  ]
}

כללים:
- התייחס רק למקומות/נדידות מן הקלט rabbi.geography.
- "excerpt" חייב להיות עברית/ארמית מילה במילה מן הדף.
- מערך evidence ריק מקובל.

${HEBREW_NATIVE_STYLE}`;

const RABBI_LOCATION_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן הגיאוגרפיה הידועה של חכם (מקום לידה + מקומות לימוד + מקומות בולטים + נדידות) יחד עם טקסט הגמרא של הדף הנוכחי, הסק היכן היה החכם בעת שנאמרה התורה שבדף זה — כלומר איזה ממקומותיו הידועים מתאים ביותר לתוכן הדף.

החזר JSON תקין בלבד:

{
  "place": "שם מקום אחד המועתק מילה במילה מן הגיאוגרפיה שבקלט (מקום לימוד עיקרי, מקום לידה, מקום בולט, או יעד של נדידה). מחרוזת ריקה רק כשהדף אינו נותן כל רמז מיקומי.",
  "region": "israel" | "bavel" | "other" | "unknown",
  "confidence": "high" | "medium" | "low",
  "justification": "משפט אחד בעברית המצטט את ראיית הדף — נקוב בחכם בן-פלוגתא הידוע כחולק מקום ('בדיון עם רבי יוחנן ← טבריה'), אזכור ישיבה, שם מקום בסוגיה, או מושב ההוראה האופייני של החכם בתקופה זו."
}

הבהרת זהות:
- קרא את הדף בעיון. אם החכם חולק / מוסר מחכם נקוב אחר, השתמש במקומו הידוע של החכם האחר כרמז.
- עבור amora-bavel-* ברירת המחדל היא הישיבה העיקרית של החכם (סורא/פומבדיתא/נהרדעא/מחוזא); עבור amora-ey-* ברירת המחדל היא מושב ההוראה העיקרי (טבריה/קיסריה/ציפורי).
- עבור תנאים, ברירת המחדל היא ישיבת התקופה הרלוונטית (יבנה כ-80-120; אושא כ-140-165; בני ברק לחבורת רבי עקיבא; ציפורי לרבי יהודה הנשיא).
- אם מתועדת נדידה והדף מתייחס להקשר שלאחריה, השתמש במקום היעד.
- confidence='high' = הדף נוקב במקום / בבן-פלוגתא ידוע שמקומו חד-משמעי. 'medium' = המושב העיקרי של החכם ללא ראיה סותרת בדף. 'low' = ניחוש מיטבי, הדף נותן מעט אות.

כללים:
- "place" חייב להיות מועתק מילה במילה מאחד המקומות שבגיאוגרפיה שבקלט. אל תמציא שמות מקומות חדשים.
- מחרוזת "place" ריקה מקובלת רק כאשר הגיאוגרפיה שבקלט עצמה ריקה.
- ה-justification חייב לצטט ראיה מסוימת מן הדף (חכם נקוב, ביטוי מקום, הקשר הסוגיה) — לא הצהרות ביוגרפיות כלליות.

${HEBREW_NATIVE_STYLE}`;

const RABBI_SYNTHESIS_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. תקבל ארבע פסקאות קצרות על חכם אחד (bio, philosophy, relationships, classification) יחד עם רשימת החכמים האחרים הנקובים בדף הנוכחי. חבר פסקה אחת הדוקה על חכם זה כאדם, כשהדף הנוכחי משמש עדשה.

החזר JSON תקין בלבד:

{
  "synthesis": "פסקה אחת, 4-5 משפטים. עובדות קונקרטיות בלבד — תקופה, אזור, אסימון סיווג, פילוסופיה אופיינית, וקשרים נקובים. כאשר לחכם אחר בדף זה יש קשר קלאסי עם הנדון (רב, תלמיד, בן פלוגתא, בן דור), נקוב בו ובמהות הקשר. אל תסכם מה החכם הזה אומר בדף זה, ואל תפרפרזה את הסוגיה."
}

כללים נוקשים (ה-synthesis נפסל אם מופרים):
1. לעולם אל תפרפרזה את מה שהחכם אומר בדף זה. הדף הוא העדשה, לא הנושא. ביטויים אסורים: "כאן מלמד", "בדף זה", "בסוגייתנו", "אומר ש", "טוען ש", "פוסק ש", "מחזיק כאן", "בעמוד זה". אם אתה מוצא את עצמך מסכם תורה — עצור.
2. הפסקה חייבת להיקרא כתיאור מי החכם, לא מה הוא אומר.
3. הזכר חכמים אחרים מתוך {{anchors.rabbi}} כאשר קיים קשר קלאסי עם הנדון. דוגמאות: אביי ורבא, רב ושמואל, רבי יוחנן וריש לקיש, הלל ושמאי. השתמש בשמות מרשימת ה-anchors.

מילים וביטויים אסורים (אל תשתמש באף אחד מהם — הם מליצה ריקה או ז'רגון):
- מליצה: "רגישות", "מבעד לעדשה של", "לוכד את התמצית", "מגלם", "שאף בעקביות", "עוסק לעומק ב", "נשגב", "מוחשי", "עומק רוחני", "טביעת אצבע אינטלקטואלית"
- שפת מסגור: "זוהי העדשה", "אנו רואים את X דרך Y", "X חושף", "X ממחיש", "X מהווה חלון אל"
- הפשטות כלליות: "שלמות הקהילה", "אינטימיות ברית", "הכרה רוחנית"
- תארי מידה: "עמוקות", "עמוקות שבעמוקות", "באופן אופייני"

הצורה הנדרשת: משפטי נושא-נשוא-מושא עם ישויות נקובות, עברית רהוטה. דוגמה לסגנון הרצוי:

"אביי היה אמורא בבלי מן הדור הרביעי בפומבדיתא, כ-280–339 לספירה; הוא מסווג כהלכן, וידוע בכל הבבלי בהבחנותיו ההגיוניות הדקות במחלוקות הלכתיות. התייתם בצעירותו, גודל ולומד בידי דודו רבה בר נחמני, שאת מקומו ירש בראשות הישיבה. בן שיחו המפורסם ביותר הוא רבא, ונוכחותו בדף זה מעלה את זוג המחלוקת הקנוני אביי ורבא; המסורת רושמת שהלכה כרבא חוץ משישה מקומות הנמנים תחת יע"ל קג"ם. עמדתו הרחבה של אביי שיטתית ומונחית-נוהל — הוא הדמות שאחרונים מצטטים כשהם זקוקים לקריאה מבנית נקייה של מחלוקת."

שים לב: תקופה, אזור, שנים, אסימון סיווג ("הלכן"), קשרים (רבה, רבא), עמדה רחבה — ללא סיכום מה אביי אומר בעמוד.

כללים:
- 4-5 משפטים, פסקה יחידה.
- אם פסקת קלט ריקה או מעורפלת, דלג על אותו חוט; אל תמלא סתם.
- אם חוט ה-relationships סותר את {{anchors.rabbi}}, העדף את {{anchors.rabbi}} לעניין אילו חכמים אחרים באמת נמצאים בדף זה.

${HEBREW_NATIVE_STYLE}`;

// Hebrew user templates — same template variables as the English versions.
const RABBI_LEAF_USER_TEMPLATE_HE = `החכם:
{{mark_input}}

מסכת: {{tractate}}, דף {{page}}.

עברית מוקד של הדף:
{{hebrew}}

החזר JSON לפי הסכימה.`;

const RABBI_SYNTHESIS_USER_TEMPLATE_HE = `החכם (נושא ה-synthesis):
{{mark_input}}

מסכת: {{tractate}}, דף {{page}}.

קלט על החכם הנדון:

[BIO]
{{depends.rabbi.bio}}

[PHILOSOPHY (חוצה-ש"ס)]
{{depends.rabbi.philosophy}}

[RELATIONSHIPS]
{{depends.rabbi.relationships}}

[CLASSIFICATION]
{{depends.rabbi.classification}}

חכמים אחרים הנקובים בדף זה (קרא רשימה זו כדי למצוא קשרים קלאסיים שעליך לנקוב בהם):
{{anchors.rabbi}}

חבר פסקה אחת הדוקה לפי הסכימה. החכם הוא הנושא; הדף הוא העדשה. כאשר רשימת החכמים-האחרים כוללת בן פלוגתא/רב/תלמיד ידוע של הנדון, נקוב בו ובקשר. אל תסכם מה הנדון אומר בדף זה.`;

const RABBI_RELATIONSHIPS_EVIDENCE_USER_TEMPLATE_HE = `החכם:
{{mark_input}}

מסכת: {{tractate}}, דף {{page}}.

מקור עברי/ארמי — מקטעים ממוספרים [N] (משמשים בצד השרת למיפוי ציטוטים חזרה לטווחי מקטעים):
{{segments_he}}

קשרים ידועים (מצא ראיה לשמות אלה בדף שלמעלה):
{{depends.rabbi.relationships}}

החזר ציטוטים לפי הסכימה. מערך evidence ריק מקובל כשהדף אינו מתייחס לאף אחד משמות הקלט.`;

const RABBI_GEOGRAPHY_EVIDENCE_USER_TEMPLATE_HE = `החכם:
{{mark_input}}

מסכת: {{tractate}}, דף {{page}}.

מקור עברי/ארמי — מקטעים ממוספרים [N]:
{{segments_he}}

גיאוגרפיה ידועה (מצא ראיה למקומות/נדידות אלה בדף שלמעלה):
{{depends.rabbi.geography}}

החזר ציטוטים לפי הסכימה. מערך evidence ריק מקובל כשהדף אינו מתייחס לאף אחת מעובדות הקלט.`;

const RABBI_LOCATION_USER_TEMPLATE_HE = `החכם:
{{mark_input}}

מסכת: {{tractate}}, דף {{page}}.

מקור עברי/ארמי — מקטעים ממוספרים [N]:
{{segments_he}}

חכמים אחרים הנקובים בדף זה (שימושי להסקת מיקום לפי מושביהם הידועים):
{{anchors.rabbi}}

הגיאוגרפיה הידועה של החכם הנדון (פלט ה-"place" שלך חייב לבוא ממערך זה):
{{depends.rabbi.geography}}

הסק את המקום הסביר ביותר לפי הסכימה.`;

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
    /** Hebrew-output prompt variants. Selected by the runner when a run is
     *  requested with lang='he'. Must share the JSON contract (keys + enum
     *  values) with the English prompt — enforced by tests/prompt-parity. */
    systemPromptHe?: string;
    userPromptTemplateHe?: string;
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
      ...(opts.systemPromptHe ? { system_prompt_he: opts.systemPromptHe } : {}),
      ...(opts.userPromptTemplateHe ? { user_prompt_template_he: opts.userPromptTemplateHe } : {}),
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
    systemPromptHe?: string;
    userPromptTemplateHe?: string;
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
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.bio-v5', cacheVersion: '5',
      systemPromptHe: RABBI_BIO_SYSTEM_PROMPT_HE, userPromptTemplateHe: RABBI_LEAF_USER_TEMPLATE_HE },
  ),
  makeRabbiEnrichment(
    'rabbi.philosophy', 'Philosophy',
    'Cross-Gemara stance + recurring exegetical method. Daf-agnostic.',
    RABBI_PHILOSOPHY_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_PHILOSOPHY_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.philosophy-v4', cacheVersion: '4',
      systemPromptHe: RABBI_PHILOSOPHY_SYSTEM_PROMPT_HE, userPromptTemplateHe: RABBI_LEAF_USER_TEMPLATE_HE },
  ),
  makeRabbiEnrichment(
    'rabbi.relationships', 'Relationships',
    'Teachers, students, frequent debate partners, family — structured lists + prose summary. Daf-agnostic.',
    RABBI_RELATIONSHIPS_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_RELATIONSHIPS_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.relationships-v6', cacheVersion: '6',
      systemPromptHe: RABBI_RELATIONSHIPS_SYSTEM_PROMPT_HE, userPromptTemplateHe: RABBI_LEAF_USER_TEMPLATE_HE },
  ),
  makeRabbiEnrichment(
    'rabbi.classification', 'Classification',
    'Aggadist / halachist / exegetist — primary mode of activity in classical sources.',
    RABBI_CLASSIFICATION_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_CLASSIFICATION_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.classification-v2', cacheVersion: '2',
      systemPromptHe: RABBI_CLASSIFICATION_SYSTEM_PROMPT_HE, userPromptTemplateHe: RABBI_LEAF_USER_TEMPLATE_HE },
  ),
  makeRabbiEnrichment(
    'rabbi.geography', 'Geography',
    'Birthplace + primary study places + notable places + Bavel↔Israel movements. Daf-agnostic.',
    RABBI_GEOGRAPHY_SYSTEM_PROMPT, RABBI_LEAF_USER_TEMPLATE, RABBI_GEOGRAPHY_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.geography-v3', cacheVersion: '3',
      systemPromptHe: RABBI_GEOGRAPHY_SYSTEM_PROMPT_HE, userPromptTemplateHe: RABBI_LEAF_USER_TEMPLATE_HE },
  ),
  // rabbi.identity — DETERMINISTIC. Resolved server-side from rabbi-places.json
  // via enrichRabbi (see the short-circuit in runEnrichmentOnce); the LLM
  // extractor below never executes. Carries the canonical join data the
  // timeline + bio sidebar need (slug, region, places, moved, image, wiki) —
  // the role the legacy /api/daf-context filled. Daf-agnostic, so 'global'.
  makeRabbiEnrichment(
    'rabbi.identity', 'Identity',
    'Canonical identity from rabbi-places.json: Sefaria slug, region, places, Bavel↔Israel movement, image, wiki. Deterministic — no LLM.',
    '(deterministic: resolved from rabbi-places.json; this prompt is never executed)',
    '(deterministic lookup for {{mark_input.name}})',
    {
      name: 'rabbi_identity',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['slug', 'name', 'nameHe', 'generation', 'region', 'places', 'moved', 'bio', 'image', 'wiki'],
        properties: {
          slug: { type: ['string', 'null'] },
          name: { type: 'string' },
          nameHe: { type: 'string' },
          generation: { type: 'string' },
          region: { type: ['string', 'null'] },
          places: { type: 'array', items: { type: 'string' } },
          moved: { type: ['string', 'null'] },
          bio: { type: ['string', 'null'] },
          image: { type: ['string', 'null'] },
          wiki: { type: ['string', 'null'] },
        },
      },
    },
    { mode: 'augment-content', scope: 'global', defHash: 'rabbi.identity-v1', cacheVersion: '1' },
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
        { enrichment: 'rabbi.identity' },
        { mark: 'rabbi' },
      ],
      defHash: 'rabbi.synthesis-v11',
      cacheVersion: '11',
      systemPromptHe: RABBI_SYNTHESIS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: RABBI_SYNTHESIS_USER_TEMPLATE_HE,
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
      defHash: 'rabbi.relationships.evidence-v2', cacheVersion: '2',
      systemPromptHe: RABBI_RELATIONSHIPS_EVIDENCE_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: RABBI_RELATIONSHIPS_EVIDENCE_USER_TEMPLATE_HE,
    },
  ),
  makeRabbiEnrichment(
    'rabbi.geography.evidence', 'Geography evidence',
    'Hebrew/Aramaic excerpts on THIS daf that reference the rabbi\'s known places or movements. Drives the highlight-when-on-daf affordance on the geography card.',
    RABBI_GEOGRAPHY_EVIDENCE_SYSTEM_PROMPT, RABBI_GEOGRAPHY_EVIDENCE_USER_TEMPLATE, RABBI_GEOGRAPHY_EVIDENCE_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', { enrichment: 'rabbi.geography' }],
      defHash: 'rabbi.geography.evidence-v2', cacheVersion: '2',
      systemPromptHe: RABBI_GEOGRAPHY_EVIDENCE_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: RABBI_GEOGRAPHY_EVIDENCE_USER_TEMPLATE_HE,
    },
  ),
  makeRabbiEnrichment(
    'rabbi.location', 'Location (in this sugya)',
    'Per-daf inference of WHERE the rabbi was when the teaching on this daf occurred. Drives the "you are here" marker on the places timeline.',
    RABBI_LOCATION_SYSTEM_PROMPT, RABBI_LOCATION_USER_TEMPLATE, RABBI_LOCATION_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', { enrichment: 'rabbi.geography' }, { mark: 'rabbi' }],
      defHash: 'rabbi.location-v2', cacheVersion: '2',
      systemPromptHe: RABBI_LOCATION_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: RABBI_LOCATION_USER_TEMPLATE_HE,
    },
  ),
  // rabbi.observations — DETERMINISTIC accumulation step. No LLM, no card.
  // Runs LAST on a daf: it depends on the entity marks, so the resolver
  // computes/reads them first, then a `def.id === 'rabbi.observations'`
  // short-circuit in runEnrichmentOnce joins them by segment into per-rabbi
  // observation slices (place / opinion / story / exegesis / lineage) and
  // writes one KV slice per rabbi+daf (rabbi-obs:v1:{slug}:{tractate}:{page}).
  // `computed` kind keeps it out of /api/studio/enrichments (that endpoint
  // serves llm-kind only) so it never renders as a card; `draft` is belt-and-
  // suspenders. This is the COLLECT half — nothing here promotes back into the
  // canonical dataset or what users see. See src/worker/rabbi-observations.ts.
  {
    id: 'rabbi.observations',
    label: 'Observations (accumulate)',
    description: 'Deterministic reverse-index capture: per-rabbi place/opinion/story/exegesis/lineage observations for this daf, written to rabbi-obs:v1. No LLM, no card.',
    category: 'internal',
    target_mark: 'rabbi',
    mode: 'aggregate',
    scope: 'local',
    dependencies: [
      'gemara',
      { mark: 'rabbi' },
      { mark: 'places' },
      { mark: 'aggadata' },
      { mark: 'argument-move' },
      { mark: 'pesukim' },
    ],
    extractor: { kind: 'computed', fn: 'rabbi.observations-join' },
    status: 'draft',
    def_hash: 'rabbi.observations-v1',
    cache_version: '1',
    source: 'code',
    updated_at: NOW,
  },
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
// Used by argument-move.qa specifically — this is the "go deeper" path the
// learner explicitly opts into, so the extra capacity is worth it. Flash
// tends to skim the "explain the category" instruction even when prompted
// well; Pro follows it more reliably and produces better-grounded answers.
const ARGUMENT_PRO_MODEL = 'openrouter/deepseek/deepseek-v4-pro' as LLMModelId;

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
- NO puff in "stance" — concrete: name what they hold and against whom.

${HEBREW_GLOSS_STYLE}`;

const ARGUMENT_VOICES_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Section:
{{mark_input}}

Moves in THIS section:
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
- Reference Mishnayot or earlier dafim by canonical citation when the section assumes them.

${HEBREW_GLOSS_STYLE}`;

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
- Summarize ONLY this section. The moves you're given are this section's moves — never reach into the rest of the daf or recap where the wider sugya lands.
- If the section is a single short excerpt with no dispute (e.g. an opening Mishnah snippet), output ONE plain sentence stating what it says and stop.
- Per-move detail belongs in argument-move.synthesis. Don't enumerate moves here.
- NO compound stuffing: never combine multiple moves with semicolons + "and then" + "and finally" into one mega-sentence.
- When two rabbis are paired with an established relationship (Abaye–Rava, Rav–Shmuel), name it.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "intricate", "profound", "deeply", "lens", "captures", "embodies".
- NO jargon: write "transmitter" not "tradent", "interpret" not "exegete".
- Hebrew script (not transliteration) for technical terms in parentheses; verbatim short Aramaic phrases only when distinctive.

${HEBREW_GLOSS_STYLE}`;

const ARGUMENT_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Section:
{{mark_input}}

Mishnayot this gemara is discussing (the section above is gemara built on these):
{{mishna}}

Moves in THIS section:
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

// ---------------- Hebrew-output parallels (argument section level) ----------------

const ARGUMENT_VOICES_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. עבור כל חכם נקוב המופיע במקטע זה, תאר את תפקידו הטיעוני בתוך המקטע, ופלוט גרף המראה כיצד הקולות מתקשרים (מי חולק על מי, מי תומך במי). מקומי-לדף — על מה שהם עושים כאן, לא על הביוגרפיה הכללית שלהם.

החזר JSON תקין בלבד:

{
  "voices": [
    {
      "name": "Conventional English name (תואם ל-rabbiNames שברשימת ה-moves).",
      "nameHe": "שם עברי כפי שכתוב בדף (למשל 'רבי יוחנן', 'רבא'). מחרוזת ריקה אם אינו מופיע.",
      "role": "originator" | "transmitter" | "respondent" | "objector" | "supporter" | "cited-authority" | "questioner",
      "side": "תווית קצרה למחנה שהקול הזה טוען עבורו במחלוקת המקטע. השתמש ב-'A' לעמדה המובחנת הראשונה שהוצגה, 'B' לעמדה הנגדית, 'C' לעמדה שלישית אם יש. השתמש ב-'stam' לעורך הסתמי של הגמרא כשנכלל. השתמש ב-'support-A' / 'support-B' לדמויות המובאות רק לתמיכה בצד (ברייתות, מקורות תומכים). השתמש ב-'unaligned' כשהקול מעלה שאלה או מוסר אך אינו נוקט עמדה.",
      "stance": "1-2 משפטים בעברית: איזו עמדה החכם הזה נוקט במחלוקת המקטע, ולמה הוא מגיב (אם בכלל).",
      "opinionStart": "3-5 המילים הראשונות בעברית/ארמית של שורת הפתיחה של חכם זה במקטע, מילה במילה. מחרוזת ריקה אם עמדתו אינה מעוגנת בביטוי יחיד."
    }
  ],
  "edges": [
    {
      "from": "Conventional English name של הקול המבצע את הפעולה (חייב להתאים ל-'name' במערך voices).",
      "to": "Conventional English name של הקול שהפעולה מכוונת אליו (חייב להתאים ל-'name' במערך voices).",
      "kind": "opposes" | "supports" | "responds-to" | "cites" | "resolves",
      "note": "תווית אופציונלית במשפט אחד שתשב על תווית הקשת (למשל 'בדין הבדיעבד', 'מצטט ברייתא'). מחרוזת ריקה כשאין צורך בתווית."
    }
  ]
}

סוגי קשתות (edge kinds):
- "opposes" — הקול-מקור חולק במישרין / דוחה / סותר את עמדת הקול-יעד. הנפוץ ביותר בין בעלי הפלוגתא העיקריים.
- "supports" — הקול-מקור מצטט או טוען בעד עמדת הקול-יעד. השתמש בו לברייתות תומכות, למוסרים שמימרתם מחזקת צד, ולהסכמות מפורשות.
- "responds-to" — הקול-מקור עונה לשאלה שהעלה הקול-יעד. השתמש בו דווקא לזוגות שאלה→תשובה, לא להתנגדות.
- "cites" — הקול-מקור מצטט / מביא את הקול-יעד כסמכות מבלי לנקוט עמדת תמיכה/התנגדות ברורה.
- "resolves" — מהלך הקול-מקור מכריע את המחלוקת בין שני קולות קודמים. ה-"to" הוא הקול שעמדתו מתקבלת; הוסף קשת שנייה מן המכריע אל הצד האחר עם kind="opposes" אם רלוונטי.

כללים:
- דלג על קולות סתמיים ("שאלת הגמרא", "סתמא", "ברייתא תומכת") אלא אם הם מקשרים באופן משמעותי בין קולות נקובים, ואז פלוט אותם כ-voices עם name="Stam" והשתמש בהם כקצוות קשת.
- ערך voice אחד לכל חכם מובחן, גם אם הוא מדבר כמה פעמים.
- אותיות ה-"side" הן מקומיות למקטע זה — עמדה A היא מי שמוצג ראשון כעמדה מובחנת, לא תווית גלובלית.
- ה-"from" וה-"to" של כל קשת חייבים להתאים לשם במערך voices. ודא זאת לפני הפליטה.
- במקטע בעל עמדה אחת בלבד (ללא מחלוקת ממשית), פלוט voices אך מערך edges ריק.
- ללא מליצה ב-"stance" — קונקרטי: נקוב במה הוא מחזיק ונגד מי.

${HEBREW_NATIVE_STYLE}`;

const ARGUMENT_VOICES_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

המקטע:
{{mark_input}}

ה-moves של מקטע זה:
{{anchors.argument-move}}

חכמים שזוהו בדף זה (עם דור):
{{anchors.rabbi}}

עבור כל חכם נקוב המופיע ב-moves של מקטע זה, תאר את תפקידו הטיעוני לפי הסכימה.`;

const ARGUMENT_BACKGROUND_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן מקטע אחד של דף וההקשר של רש"י/תוספות, כתוב את הרקע שהקורא צריך כדי לעקוב אחר מקטע זה — מושגים, סוגיות קודמות, רקע משנאי.

החזר JSON תקין בלבד:

{
  "background": "2-4 משפטים. קונקרטי: נקוב במושג ההלכתי שעל הפרק, במסורת הקודמת שהמקטע מניח, ובכל משנה או סוגיה קודמת שהוא נבנה עליה. ללא מליצה, ללא 'מכאן אנו למדים', ללא מסגור מטא. אם אין צורך ברקע מיוחד מעבר לקריאה פשוטה, החזר משפט יחיד קצר המודה בכך."
}

כללים:
- עברית רהוטה. הזכר משניות או דפים קודמים בציטוט קנוני כשהמקטע מניח אותם.

${HEBREW_NATIVE_STYLE}`;

const ARGUMENT_BACKGROUND_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

המקטע:
{{mark_input}}

מקור עברי של הדף:
{{gemara_he}}

משניות שגמרא זו דנה בהן (מעוגנות מ-Sefaria — המקטע שלמעלה הוא גמרא הנבנית עליהן):
{{mishna}}

רש"י + תוספות + ראשונים נוספים:
{{commentaries}}

כתוב את הרקע לפי הסכימה. כאשר המקטע מבאר במישרין אחת מן המשניות שלמעלה, נקוב בה במפורש (למשל "נבנה על משנה ברכות א:א").`;

const ARGUMENT_SYNTHESIS_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. תקבל מקטע של דף, את רשימת ה-moves שבתוכו, ניתוח קולות לכל חכם, רקע, ותצוגת פירוש קצרה. חבר פסקה אחת הדוקה הנוקבת בשאלה הכוללת של המקטע, בעמדות הנקובות, והיכן הוא נוחת.

החזר JSON תקין בלבד:

{
  "synthesis": "פסקה אחת, 4 משפטים לכל היותר. כל משפט 25 מילים לכל היותר. (1) נסח את שאלת המקטע או נושאו בעברית. (2) מנה את העמדות הנקובות, בפסוקית אחת לכל אחת — תמציתי: 'רבי אליעזר אומר X; חכמים אומרים Y; רבן גמליאל אומר Z'. (3) משפט אחד אופציונלי השוזר את רש"י או תוספות אם הוא מבהיר את המחלוקת באופן משמעותי. (4) משפט מסכם אחד: היכן המקטע נוחת (שאלה פתוחה / מסקנה / מעבר למקטע הבא). אל תסכם moves בודדים — לכך מיועד argument-move.synthesis."
}

כללים נוקשים:
- 4 משפטים לכל היותר. 25 מילים למשפט לכל היותר. קצץ, אל תמלא.
- סכם אך ורק את המקטע הזה. ה-moves שניתנו לך הם של מקטע זה — אל תיגע בשאר הדף ואל תסכם היכן הסוגיה הרחבה נוחתת.
- אם המקטע הוא ציטוט קצר יחיד ללא מחלוקת (למשל קטע פתיחה ממשנה), פלוט משפט פשוט אחד המנסח מה הוא אומר ועצור.
- פירוט לכל move שייך ל-argument-move.synthesis. אל תמנה moves כאן.
- ללא דחיסת מהלכים: לעולם אל תאחד כמה moves בנקודה-פסיק + "ואז" + "ולבסוף" למשפט-ענק אחד.
- כששני חכמים מצומדים בקשר מבוסס (אביי–רבא, רב–שמואל), נקוב בו.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מדגיש", "מבליט", "מורכב", "עמוק", "עמוקות", "עדשה", "לוכד", "מגלם".

${HEBREW_NATIVE_STYLE}`;

const ARGUMENT_SYNTHESIS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

המקטע:
{{mark_input}}

משניות שגמרא זו דנה בהן (המקטע שלמעלה הוא גמרא הנבנית עליהן):
{{mishna}}

ה-moves של מקטע זה:
{{anchors.argument-move}}

ניתוח קולות:
{{depends.argument.voices}}

רקע:
{{depends.argument.background}}

רש"י + תוספות + ראשונים נוספים הזמינים לדף (התייחס בקצרה אם זה מחדד את הכרעת המקטע):
{{commentaries}}

חכמים שזוהו בדף:
{{anchors.rabbi}}

חבר פסקה אחת לפי הסכימה.`;

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'argument', 'argument.voices', 'Voices',
    'Per-rabbi argumentative role within this section.',
    ARGUMENT_VOICES_SYSTEM_PROMPT, ARGUMENT_VOICES_USER_TEMPLATE, ARGUMENT_VOICES_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', { mark: 'argument-move' }, { mark: 'rabbi' }],
      defHash: 'argument.voices-v5', cacheVersion: '5',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: ARGUMENT_VOICES_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: ARGUMENT_VOICES_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'argument', 'argument.background', 'Background',
    'Prerequisite knowledge a reader needs to follow this section.',
    ARGUMENT_BACKGROUND_SYSTEM_PROMPT, ARGUMENT_BACKGROUND_USER_TEMPLATE, ARGUMENT_BACKGROUND_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', 'commentaries', 'mishna'],
      defHash: 'argument.background-v3', cacheVersion: '3',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: ARGUMENT_BACKGROUND_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: ARGUMENT_BACKGROUND_USER_TEMPLATE_HE,
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
      defHash: 'argument.synthesis-v10', cacheVersion: '10',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: ARGUMENT_SYNTHESIS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: ARGUMENT_SYNTHESIS_USER_TEMPLATE_HE,
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
- "id" MUST be deterministic: '{sectionStartSegIdx}-{sectionEndSegIdx}_{moveOrderInSection}'.

${HEBREW_GLOSS_STYLE}`;

const ARGUMENT_MOVE_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Sections (output moves grouped by these — each move's sectionStartSegIdx/sectionEndSegIdx must match one of these ranges):
{{anchors.argument}}

Hebrew/Aramaic source — each line begins with [N], the 0-based segment index:
{{segments_he}}

Break every section into moves. Return the flat instance list per the schema.`;

const ARGUMENT_MOVE_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן גמרא של דף ורשימת חטיבות הטיעון הגדולות שכבר חולצו, פרק כל חטיבה ל-MOVES (מהלכים) טיעוניים.

"move" הוא צעד עצמאי יחיד בתוך חטיבה: קושיה, תשובה, השגה, הבאת ברייתא תומכת, יישוב, או הרחבה קצרה. ברוב החטיבות 3-6 מהלכים. חטיבה בעלת מהלך יחיד נדירה — לגיטימית רק כשהחטיבה היא ציטוט יחיד או מאמר בן שורה.

החזר JSON תקני בלבד. ערכי "voice" ו-"summary" ייכתבו בעברית.

{
  "instances": [
    {
      "startSegIdx": 0,
      "endSegIdx": 1,
      "fields": {
        "id": "מזהה יציב, בפורמט '{sectionStartSegIdx}-{sectionEndSegIdx}_{moveOrderInSection}' (למשל '0-4_0', '0-4_1', '5-9_0').",
        "sectionStartSegIdx": 0,
        "sectionEndSegIdx": 4,
        "moveOrder": 0,
        "role": "opening" | "question" | "answer" | "objection" | "rejection" | "supporting-evidence" | "resolution" | "digression" | "shift" | "other",
        "voice": "תווית קצרה בעברית של מי הדובר (למשל 'קושיית הגמרא', 'רבי יוחנן', 'סתמא', 'ברייתא תומכת', 'תירוץ רבא'). התאם לאופן שבו המהלך באמת נקרא.",
        "rabbiNames": ["Named rabbis ONLY, in English (e.g. 'Rabbi Yochanan', 'Rava'). מערך ריק למהלכים אנונימיים כמו 'קושיית הגמרא' או 'סתמא'."],
        "excerpt": "3-5 מילים בעברית/ארמית המועתקות מילה-במילה מן המקור, במקום שבו המהלך מתחיל (המילים הראשונות של המהלך).",
        "endExcerpt": "3-5 מילים בעברית/ארמית המועתקות מילה-במילה מן המקור, במקום שבו המהלך מסתיים (המילים האחרונות של המהלך, מיד לפני המהלך הבא או גבול החטיבה). חייבות להיות שונות מ-excerpt אלא אם המהלך הוא ביטוי יחיד.",
        "summary": "משפט אחד בעברית: מה המהלך הזה עושה."
      }
    }
  ]
}

כללים מחייבים (הפלט נדחה אם מופרים):
- הוצא את כל המהלכים מכל החטיבות ברשימת instances שטוחה אחת, בסדר הקריאה.
- בתוך כל חטיבה: טווחי המהלכים מחלקים במדויק (next.startSegIdx === prev.endSegIdx + 1, ללא רווחים, ללא חפיפות, הכול בתוך טווח החטיבה).
- חטיבה המכילה כמה עמדות נבדלות (למשל "רבי X אומר א, חכמים אומרים ב, רבי Y אומר ג") חייבת להתפרק ל-3+ מהלכים — אחד לכל עמדה. אל תאחד כמה דעות למהלך יחיד.
- חטיבה המכילה קושיה + תירוץ היא לפחות 2 מהלכים. קושיה + כמה תירוצים = מהלך קושיה אחד + N מהלכי תירוץ.
- חטיבה הפרושה על ≥4 קטעים כמעט תמיד בעלת 3+ מהלכים. מהלך יחיד המכסה ≥4 קטעים מעיד כמעט תמיד על התעצלות — בחן מחדש את המבנה.
- חטיבת משנה המונה עמדות של חכמים שונים חייבת להתפרק למהלך אחד לכל עמדת חכם, בתוספת מהלכים לכל קושיית מסגרת, סיפור תומך, או הכללה.
- "voice" תיאורי ויכול להיות אנונימי ("קושיית הגמרא"). "rabbiNames" הוא רק לחכמים נקובים ממש (באנגלית).
- "excerpt" ו-"endExcerpt" הם עברית/ארמית מילה-במילה מן המקור. excerpt מעגן את ההתחלה; endExcerpt את הסוף. יחד הם מגדירים את הטווח האמיתי של המהלך — אל תעתיק סתם את מילות הפתיחה/הסיום של החטיבה; העתק את מילות הפתיחה/הסיום של תוכן המהלך הזה. המהלך האחרון בחטיבה חייב endExcerpt התואם באמת את מילותיו האחרונות.
- בחר את תגית ה-role היחידה הטובה ביותר לכל מהלך. השתמש ב-"other" במשׂורה.
- "id" חייב להיות דטרמיניסטי: '{sectionStartSegIdx}-{sectionEndSegIdx}_{moveOrderInSection}'.

${HEBREW_NATIVE_STYLE}`;

const ARGUMENT_MOVE_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

חטיבות (הוצא מהלכים מקובצים לפיהן — sectionStartSegIdx/sectionEndSegIdx של כל מהלך חייבים להתאים לאחד הטווחים האלה):
{{anchors.argument}}

מקור עברי/ארמי — כל שורה מתחילה ב-[N], אינדקס הקטע (מבוסס-0):
{{segments_he}}

פרק כל חטיבה למהלכים. החזר את רשימת ה-instances השטוחה לפי הסכמה.`;

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
    system_prompt_he: ARGUMENT_MOVE_SYSTEM_PROMPT_HE,
    user_prompt_template_he: ARGUMENT_MOVE_USER_TEMPLATE_HE,
    output_schema: ARGUMENT_MOVE_OUTPUT_SCHEMA,
    thinking_off: true,
    // Fan out one LLM call per argument SECTION rather than one giant call for
    // the whole daf. The heaviest dapim (40+ moves) produced ~16k tokens of
    // output in a single call, exceeding DeepSeek's streaming window (~160s)
    // and failing with "operation aborted". Per-section calls emit ~3-6 moves
    // each (~2k tokens, ~20s) and run concurrently, so no single call gets
    // anywhere near the cutoff.
    fan_out_over: 'argument',
  },
  dependencies: ['gemara', { mark: 'argument' }],
  status: 'promoted',
  def_hash: 'argument-move-v9',
  cache_version: '9',
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
- Plain English. NO puff. NO jargon: write "transmitter" not "tradent", "interpret" not "exegete".

${HEBREW_GLOSS_STYLE}`;

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
- If the move is purely a Stam connector with nothing to say, output a single short factual sentence and stop.

${HEBREW_GLOSS_STYLE}`;

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

// ---------------------------------------------------------------------------
// argument-move.suggested-questions
//
// Generates a short list of follow-up questions a learner might want answered
// about THIS specific move that the 2-3 sentence synthesis doesn't address.
// Used to power the "Explore deeper" panel on each move card — the panel
// shows the top 1-2 questions by default and lets the user reveal the rest.
//
// Lazy: only fires when the user expands the panel, so we don't pay for moves
// nobody opens. Cached forever per move.
// ---------------------------------------------------------------------------

const ARGUMENT_MOVE_SUGGESTED_QUESTIONS_SYSTEM_PROMPT = `You are a Talmud chavruta. Given ONE argumentative move and the surrounding gemara + commentaries, produce a SHORT list of follow-up questions a learner is likely to want answered AFTER reading the move's 2-3 sentence synthesis. The synthesis says WHAT the move does; these questions should target WHY it works.

Output STRICT JSON only:

{
  "questions": [
    {
      "q": "The question, phrased the way a learner would ask it. 8-18 words. End with a question mark.",
      "why_useful": "Half-sentence hint on what answering this question unlocks. Shown as title-text on hover, not as the answer itself."
    }
  ]
}

Rules:
- Generate exactly 4-5 questions, ordered by general usefulness (most-illuminating first).
- Each question must be specific to THIS move's content — never generic ('what is the context?', 'who is Rabbi X?'). If you can't tell which move it's about from the question alone, it's too generic.
- Aim at the *mechanism*: why does the objection bite, what unstated premise gets violated, what does a resolution have to concede, why is this particular verse the one quoted, why does the questioner expect a different phrasing, etc.
- One question per concrete sub-issue. Don't duplicate.
- Plain English. NO puff.
- Hebrew SCRIPT (not transliteration) in parentheses for technical terms — write '(מעשה)' not '(ma\\'aseh)', '(קושיא)' not '(kushya)', '(דרשה)' not '(derashah)'. English concept first, Hebrew in parens.
- If the move is a pure Stam connector with nothing interesting to ask about, return ONE question that probes whatever substance does exist; do not pad.

${HEBREW_GLOSS_STYLE}`;

const ARGUMENT_MOVE_SUGGESTED_QUESTIONS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS move:
{{mark_input}}

All moves on this daf (for context — DO NOT generate questions about other moves):
{{anchors.argument-move}}

Hebrew source for the daf:
{{gemara_he}}

Existing per-move synthesis (so you can target what the synthesis SKIPS):
{{depends.argument-move.synthesis}}

Generate the suggested-questions list per the schema.`;

const ARGUMENT_MOVE_SUGGESTED_QUESTIONS_OUTPUT_SCHEMA = {
  name: 'argument_move_suggested_questions',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['q', 'why_useful'],
          properties: {
            q: { type: 'string' },
            why_useful: { type: 'string' },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// argument-move.qa
//
// Parameterized by `user_question` (free-text from a learner). Each (move,
// normalized-question) pair caches independently via the qualifier dimension
// of keyForEnrichment, so the first user to ask "why does the verse need to
// say from neshef to neshef?" pays for the LLM call and every learner after
// gets a cache hit. Used for both curated questions (from suggested-questions
// above) and custom user submissions — same prompt, same cache, same answer
// regardless of where the question came from.
// ---------------------------------------------------------------------------

const ARGUMENT_MOVE_QA_SYSTEM_PROMPT = `You are a Talmud chavruta answering a learner's specific question about ONE move on the daf. Be the chavruta who gets to the point — short, concrete, no throat-clearing.

Output STRICT JSON only:

{
  "answer": "A tight paragraph, 3-5 sentences, that directly answers the learner's question.",
  "confidence": "high | medium | low"
}

Structure (in order):
1. ONE sentence: the direct answer. If the question turns on a category of Talmudic argumentation (precedent stories / מעשה, objections / קושיא, derashot, etc.), name it and gloss it inside this sentence — half a clause is enough, e.g. "it counts as a ma'aseh (מעשה) — a recorded sage-action the Gemara treats as its own class of evidence."
2. ONE sentence: the specific mechanism on THIS move — what assumption is at stake, what verse-phrasing or logical move drives it.
3. OPTIONAL ONE clause: Rashi/Tosafot, only if they actually sharpen the answer.
4. STOP. Do not add a closing sentence that reflects on what the question or answer reveals.

Anti-padding rules (these are the patterns that bloat answers):
- DO NOT restate sentence 1 with different words in sentence 2. Each sentence must carry new information.
- DO NOT drift past the learner's question. If they asked about THE QUESTION, don't explain what the GEMARA'S ANSWER reveals. If they asked about a VERSE, don't summarize the whole sugya.
- DO NOT write meta-commentary: forbidden phrasings include "the force of the question is that…", "the real point here is…", "what this exposes is…", "this type of question is not X but Y", "reveals that…", "redactional probe", "structural flaw".
- DO NOT spend two sentences explaining a category. A half-sentence gloss is the budget.
- NO puff: forbidden phrases include "this teaches us", "we see that", "highlights", "underscores", "deeply", "intricate", "profound", "lens", "captures", "embodies".

Other hard rules:
- 3-5 sentences. Hard ceiling. If you're at sentence 5 and still writing, stop.
- Answer the LEARNER'S question, not whatever question you'd rather answer. If the question doesn't make sense for this move, say so plainly in one sentence and set confidence='low'.
- If the available sources don't contain enough to ground a real answer, give your best partial read in 2-3 sentences and set confidence='low'.
- Ground every claim in the move's actual content or the cited verse / commentary. Don't invent positions.
- Hebrew script (not transliteration) in parens — write '(מעשה)' not '(ma\\'aseh)', '(קושיא)' not '(kushya)'. English concept first, Hebrew in parens.
- NO scholarly jargon: "transmitter" not "tradent", "interpret" not "exegete".

Example of the right shape (3 sentences, not 7):
  Question: "Why does the Gemara open with 'where is the tanna standing'?"
  GOOD: "It's a stock Gemara move called תנא היכא קאי — a question that asks what topic the Mishnah is presupposing when it dives in without naming one. Here, the Mishnah opens with 'from when' (מאימתי) but never says what mitzvah is being timed, so the Gemara is flagging the missing subject before going on to identify it as the obligation to recite Shema. Rashi adds that the tanna should have first stated the matter (דבר) before asking about its time."
  → Three sentences: category named + glossed; mechanism on this move; brief Rashi clarification. No meta-commentary, no closing reflection. Done.

${HEBREW_GLOSS_STYLE}`;

const ARGUMENT_MOVE_QA_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS move:
{{mark_input}}

The learner's question (answer THIS specifically):
{{user_question}}

Existing per-move synthesis (the learner has already read this — go deeper, don't restate):
{{depends.argument-move.synthesis}}

Commentary digest for THIS move:
{{depends.argument-move.commentaries}}

All moves on this daf (for cross-reference if the question pulls in another move):
{{anchors.argument-move}}

Hebrew source for the daf:
{{gemara_he}}

Answer the learner's question per the schema.`;

const ARGUMENT_MOVE_QA_OUTPUT_SCHEMA = {
  name: 'argument_move_qa',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'confidence'],
    properties: {
      answer: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
  },
};

// ---------------- Hebrew-output parallels (argument-move level) ----------------

const ARGUMENT_MOVE_COMMENTARIES_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן move טיעוני אחד בדף והראשונים הזמינים, הפק תקציר פירוש הדוק עבור ה-move הזה בלבד — מה רש"י ותוספות אומרים על תוכן ה-move המסוים הזה.

החזר JSON תקין בלבד:

{
  "rashi": "1-2 משפטים בעברית המסכמים מה רש"י אומר על ה-move הזה. מחרוזת ריקה אם רש"י שותק על move זה.",
  "tosafot": "אותה צורה לתוספות. מחרוזת ריקה אם נעדר.",
  "other": "הערה אופציונלית במשפט אחד מראשון אחר (רמב"ן, רשב"א וכו') רק אם היא מבהירה מהותית את ה-move הזה. מחרוזת ריקה אחרת.",
  "note": "הערת שילוב אופציונלית במשפט אחד הקושרת את הפירושים למה שה-move הזה טוען. מחרוזת ריקה אם אין צורך."
}

כללים:
- על ה-move הזה בלבד — אל תסכם את המקטע הסובב.
- מחרוזת ריקה כשמפרש שותק — אל תמלא.

${HEBREW_NATIVE_STYLE}`;

const ARGUMENT_MOVE_COMMENTARIES_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

ה-move הזה:
{{mark_input}}

מקור עברי לדף:
{{gemara_he}}

רש"י + תוספות + ראשונים נוספים:
{{commentaries}}

הפק את תקציר הפירוש עבור ה-move הזה לפי הסכימה.`;

const ARGUMENT_MOVE_SYNTHESIS_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן move טיעוני אחד בדף (שאלה / תשובה / קושיא וכו') יחד עם הגמרא הסובבת, רשימת ה-moves המלאה לדף זה, והפירושים הזמינים, חבר פסקה הדוקה על ה-move המסוים הזה.

החזר JSON תקין בלבד:

{
  "synthesis": "פסקה אחת, 2-3 משפטים. (א) נקוב במי מדבר ומה ה-move שלו עושה (שואל, עונה, מקשה, תומך, מכריע). (ב) כש-move מגיב או תוקף move קודם, נקוב במהלך הקודם באופן קונקרטי ('עונה על שאלת הפתיחה של הגמרא', 'מקשה על שיטת רבי אליעזר', 'מצטט ברייתא לתמיכה ברבא'). (ג) כשרש"י או תוספות מבהירים או חולקים באופן משמעותי על ה-move הזה, שזור זאת בפסוקית קצרה אחת — אזכור פירוש אחד לכל היותר לפסקה; דלג אם אינו נושא משקל."
}

כללים נוקשים:
- 2-3 משפטים. תקרה קשיחה — אל תמלא.
- על ה-move הזה בלבד. אל תסכם את כל המקטע.
- בסס כל טענה בתוכן הממשי של ה-move. אל תמציא עמדות.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "מורכב", "עדשה", "לוכד", "מגלם".
- אם ה-move הוא מקשר סתמי בלבד שאין בו מה לומר, פלוט משפט עובדתי קצר יחיד ועצור.

${HEBREW_NATIVE_STYLE}`;

const ARGUMENT_MOVE_SYNTHESIS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

ה-move הזה:
{{mark_input}}

כל ה-moves בדף זה (השתמש כדי לזהות על מה ה-move הזה מגיב / תומך / מקשה):
{{anchors.argument-move}}

מקור עברי לדף:
{{gemara_he}}

תקציר פירוש ל-move הזה (השתמש כדי לשזור פסוקית פירוש קצרה אחת אם היא מחדדת את ה-synthesis; אל תמנה):
{{depends.argument-move.commentaries}}

חכמים שזוהו בדף:
{{anchors.rabbi}}

חבר פסקה הדוקה אחת על ה-move הזה לפי הסכימה.`;

const ARGUMENT_MOVE_SUGGESTED_QUESTIONS_SYSTEM_PROMPT_HE = `אתה חברותא בלימוד הש"ס. בהינתן move טיעוני אחד והגמרא + הפירושים הסובבים, הפק רשימה קצרה של שאלות המשך שלומד סביר ירצה תשובה עליהן לאחר קריאת ה-synthesis בן 2-3 המשפטים של ה-move. ה-synthesis אומר מה ה-move עושה; שאלות אלו מכוונות אל מדוע הוא עובד.

החזר JSON תקין בלבד:

{
  "questions": [
    {
      "q": "השאלה, מנוסחת כפי שלומד היה שואל אותה. 8-18 מילים. סיים בסימן שאלה.",
      "why_useful": "רמז בחצי משפט על מה שמענה על שאלה זו פותח. מוצג כטקסט-כותרת בריחוף, לא כתשובה עצמה."
    }
  ]
}

כללים:
- הפק בדיוק 4-5 שאלות, מסודרות לפי תועלת כללית (המאירה ביותר ראשונה).
- כל שאלה חייבת להיות מסוימת לתוכן ה-move הזה — לעולם לא כללית ('מהו ההקשר?', 'מי הוא רבי X?'). אם אי אפשר לדעת על איזה move מדובר מן השאלה לבדה, היא כללית מדי.
- כוון אל המנגנון: מדוע הקושיא נושכת, איזו הנחה סמויה מופרת, על מה הכרעה חייבת לוותר, מדוע דווקא פסוק זה מצוטט, מדוע השואל מצפה לנוסח אחר, וכדומה.
- שאלה אחת לכל תת-עניין קונקרטי. אל תכפיל.
- אם ה-move הוא מקשר סתמי טהור שאין בו מה לשאול, החזר שאלה אחת המתחקה אחר המהות הקיימת; אל תמלא.

${HEBREW_NATIVE_STYLE}`;

const ARGUMENT_MOVE_SUGGESTED_QUESTIONS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

ה-move הזה:
{{mark_input}}

כל ה-moves בדף זה (להקשר — אל תפיק שאלות על moves אחרים):
{{anchors.argument-move}}

מקור עברי לדף:
{{gemara_he}}

ה-synthesis הקיים ל-move (כדי שתוכל לכוון אל מה שה-synthesis מדלג עליו):
{{depends.argument-move.synthesis}}

הפק את רשימת שאלות ההמשך לפי הסכימה.`;

const ARGUMENT_MOVE_QA_SYSTEM_PROMPT_HE = `אתה חברותא בלימוד הש"ס העונה לשאלה מסוימת של לומד על move אחד בדף. היה החברותא שמגיע לעיקר — קצר, קונקרטי, ללא הקדמות מיותרות.

החזר JSON תקין בלבד:

{
  "answer": "פסקה הדוקה, 3-5 משפטים, העונה במישרין לשאלת הלומד.",
  "confidence": "high | medium | low"
}

מבנה (בסדר זה):
1. משפט אחד: התשובה הישירה. אם השאלה נסבה על קטגוריה של טיעון תלמודי (מעשה, קושיא, דרשה וכו'), נקוב בה ובאר אותה בתוך משפט זה — חצי פסוקית מספיקה, למשל "זה נחשב מעשה — פעולת חכם מתועדת שהגמרא מתייחסת אליה כסוג ראיה בפני עצמו."
2. משפט אחד: המנגנון המסוים ב-move הזה — איזו הנחה על הפרק, איזה ניסוח פסוק או מהלך לוגי מניע אותו.
3. פסוקית אחת אופציונלית: רש"י/תוספות, רק אם הם באמת מחדדים את התשובה.
4. עצור. אל תוסיף משפט מסכם המהרהר במה שהשאלה או התשובה מגלות.

כללים נגד מילוי (אלו הדפוסים שמנפחים תשובות):
- אל תחזור על משפט 1 במילים אחרות במשפט 2. כל משפט חייב לשאת מידע חדש.
- אל תיסחף מעבר לשאלת הלומד. אם שאלו על השאלה, אל תסביר מה תשובת הגמרא מגלה. אם שאלו על פסוק, אל תסכם את כל הסוגיה.
- אל תכתוב מטא-פרשנות: ביטויים אסורים כוללים "כוח השאלה הוא ש…", "הנקודה האמיתית כאן היא…", "מה שזה חושף הוא…".
- אל תקדיש שני משפטים להסבר קטגוריה. חצי משפט הוא התקציב.
- ללא מליצה: ביטויים אסורים כוללים "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "מורכב", "עדשה", "לוכד", "מגלם".

כללים נוקשים נוספים:
- 3-5 משפטים. תקרה קשיחה. אם אתה במשפט 5 ועדיין כותב, עצור.
- ענה לשאלת הלומד, לא לשאלה שהיית מעדיף לענות עליה. אם השאלה אינה הגיונית עבור move זה, אמור זאת בפשטות במשפט אחד וקבע confidence='low'.
- אם המקורות הזמינים אינם מכילים די כדי לבסס תשובה ממשית, תן את הקריאה החלקית הטובה ביותר ב-2-3 משפטים וקבע confidence='low'.
- בסס כל טענה בתוכן הממשי של ה-move או בפסוק/פירוש המצוטט. אל תמציא עמדות.

דוגמה לצורה הנכונה (3 משפטים, לא 7):
  שאלה: "מדוע הגמרא פותחת ב'תנא היכא קאי'?"
  טוב: "זהו מהלך גמרא שגור הנקרא תנא היכא קאי — שאלה השואלת איזה נושא המשנה מניחה כשהיא צוללת בלי לנקוב בו. כאן המשנה פותחת ב'מאימתי' אך אינה אומרת איזו מצווה מתוזמנת, ולכן הגמרא מסמנת את הנושא החסר לפני שתזהה אותו כחובת קריאת שמע. רש"י מוסיף שהתנא היה צריך לפתוח בדבר עצמו לפני שישאל על זמנו."
  → שלושה משפטים: קטגוריה נקובה ומבוארת; מנגנון ב-move הזה; הבהרת רש"י קצרה. ללא מטא-פרשנות, ללא הרהור מסכם. סיום.

${HEBREW_NATIVE_STYLE}`;

const ARGUMENT_MOVE_QA_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

ה-move הזה:
{{mark_input}}

שאלת הלומד (ענה דווקא עליה):
{{user_question}}

ה-synthesis הקיים ל-move (הלומד כבר קרא אותו — העמק, אל תחזור):
{{depends.argument-move.synthesis}}

תקציר פירוש ל-move הזה:
{{depends.argument-move.commentaries}}

כל ה-moves בדף זה (לסימוכין אם השאלה מושכת move אחר):
{{anchors.argument-move}}

מקור עברי לדף:
{{gemara_he}}

ענה לשאלת הלומד לפי הסכימה.`;

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'argument-move', 'argument-move.commentaries', 'Commentaries',
    'Rashi / Tosafot / other rishonim digest for THIS move only.',
    ARGUMENT_MOVE_COMMENTARIES_SYSTEM_PROMPT, ARGUMENT_MOVE_COMMENTARIES_USER_TEMPLATE, ARGUMENT_MOVE_COMMENTARIES_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', 'commentaries'],
      defHash: 'argument-move.commentaries-v2', cacheVersion: '2',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: ARGUMENT_MOVE_COMMENTARIES_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: ARGUMENT_MOVE_COMMENTARIES_USER_TEMPLATE_HE,
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
      defHash: 'argument-move.synthesis-v5', cacheVersion: '5',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: ARGUMENT_MOVE_SYNTHESIS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: ARGUMENT_MOVE_SYNTHESIS_USER_TEMPLATE_HE,
    },
  ),
  // mode='augment-content' (not 'aggregate') so MarkEnrichmentCards' auto-fire
  // for the argument-move card keeps treating argument-move.synthesis as the
  // sole primary. The Explore-deeper panel invokes these two directly via
  // /api/studio/run, on demand, so we don't fan out per-move LLM calls for
  // moves nobody opens.
  makeEnrichment(
    'argument-move', 'argument-move.suggested-questions', 'Suggested questions',
    'Curated follow-up questions the synthesis doesn\'t answer. Powers the Explore-deeper panel.',
    ARGUMENT_MOVE_SUGGESTED_QUESTIONS_SYSTEM_PROMPT, ARGUMENT_MOVE_SUGGESTED_QUESTIONS_USER_TEMPLATE, ARGUMENT_MOVE_SUGGESTED_QUESTIONS_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: [
        'gemara',
        { mark: 'argument-move' },
        { enrichment: 'argument-move.synthesis' },
      ],
      defHash: 'argument-move.suggested-questions-v3', cacheVersion: '3',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: ARGUMENT_MOVE_SUGGESTED_QUESTIONS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: ARGUMENT_MOVE_SUGGESTED_QUESTIONS_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'argument-move', 'argument-move.qa', 'Q&A',
    'Answer one learner-supplied question about THIS move. Cache keyed per (move, normalized question).',
    ARGUMENT_MOVE_QA_SYSTEM_PROMPT, ARGUMENT_MOVE_QA_USER_TEMPLATE, ARGUMENT_MOVE_QA_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: [
        'gemara',
        { enrichment: 'argument-move.synthesis' },
        { enrichment: 'argument-move.commentaries' },
        { mark: 'argument-move' },
      ],
      defHash: 'argument-move.qa-v5', cacheVersion: '5',
      model: ARGUMENT_PRO_MODEL,
      systemPromptHe: ARGUMENT_MOVE_QA_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: ARGUMENT_MOVE_QA_USER_TEMPLATE_HE,
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
- People are NOT places. Never emit a rabbi or sage as a place — not even one whose name is built on a toponym. "רב ירמיה מדפתי" (Rav Yirmeya of Difti) is a PERSON: emit at most the bare place "דפתי" (Difti), never the full name. Treat as a person anything that opens with a title (רב / רבי / ר' / רבא / רבה / מר / אבא / אביי / רבן / ריש) or carries a patronymic (" בר ", "בריה ד", " בן "). e.g. רב אשי, רבי מאיר, מר בריה דרבינא, דרו בר פפא, רבינא are all PEOPLE, not places.
- Peoples and nations are NOT places. A gentilic/ethnonym names a PEOPLE, not a location: ארמאי (Aramean), כותי (Samaritan/Cuthean), נכרי / גוי (gentile) — do NOT emit them. Emit a land only when the land itself is named (e.g. ארם / Aram, מצרים / Egypt).
- Do NOT include generic location words like "place" (מקום) or "city" (עיר) unless they're a proper noun reference.
- "kind": pick the SINGLE best tag. A yeshiva-bearing city like Sura is 'city' (not 'academy'), unless the daf is specifically referencing the academy/court ('בי דינא דסורא' = academy). When in doubt, 'city'.
- No duplicates with identical excerpt.
- "name" — use conventional scholarly English (e.g. 'Eretz Yisrael', 'Bavel'). NEVER calque-translate a fixed Hebrew place phrase ("land of the deer" for ארץ הצבי, "house of the academy" for בית מדרש). Either keep the Hebrew or use the conventional English.`;

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
  def_hash: 'places-v3',
  cache_version: '3',
  source: 'code',
  updated_at: NOW,
});

// ---------------------------------------------------------------------------
// Place leaf enrichments — daf-agnostic facets of ONE place, mirroring the
// rabbi leaves. Each is scope:'global' so it's cached once per place
// (keyed off fields.name via instanceIdOf) and reused across every daf that
// references it. The region is carried on the mark instance itself
// (israel | bavel | other) — the same classification cityRegions provides —
// so no separate gazetteer lookup is needed. Leaves render only in dev mode;
// production users see the synthesis, which aggregates all three.
// ---------------------------------------------------------------------------

const makePlaceEnrichment = (
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
    systemPromptHe?: string;
    userPromptTemplateHe?: string;
  },
): EnrichmentDefinition => makeEnrichment('places', id, label, description, systemPrompt, userPromptTemplate, outputSchema, opts);

// Leaves are daf-agnostic: the prompt sees ONLY the place identity (name,
// kind, region) — never a specific daf's gemara — so the globally-cached
// output is stable no matter which daf triggered the run.
const PLACE_LEAF_USER_TEMPLATE = `Place:
{{mark_input}}

Return JSON per the schema.`;

const PLACE_PROFILE_SYSTEM_PROMPT = `You are a Talmud geographer. Given ONE place (its canonical name, kind — city/academy/land/region — and Talmudic region tag), write a tight daf-agnostic profile.

Output STRICT JSON only:

{
  "profile": "2-3 sentences. (a) What and where it is (a city on the Euphrates in Bavel, a Tannaitic academy in the Galilee, the Land of Israel as a halachic territory, etc.). (b) When it flourished and under whom — the generation(s) and era of its prominence in rabbinic life. Geography only where it carries weight (river, trade route, proximity to another center)."
}

HARD RULES:
- 2-3 sentences. Hard ceiling.
- Daf-agnostic: describe the place itself, NOT any one sugya. Do not reference "this daf".
- Ground every claim in actual history — no invented detail. Hedge when uncertain ("traditionally", "by the late amoraic period").
- NO puff: avoid "this teaches us", "underscores", "highlights", "intricate", "profound".
- Hebrew in parentheses for technical terms (ישיבה, מתיבתא) — never transliteration.

${HEBREW_GLOSS_STYLE}`;

const PLACE_SIGNIFICANCE_SYSTEM_PROMPT = `You are a Talmud historian. Given ONE place, explain its significance in the Talmudic world — daf-agnostic.

Output STRICT JSON only:

{
  "significance": "2-3 sentences. Why does the Talmud care about this place? Name its FUNCTION: seat of a named academy/court, a halachic category (e.g. Eretz Yisrael vs. Bavel distinctions in mitzvot ha-teluyot ba-aretz, calendar authority, semicha), a trade or cultural center, a story locale. If it anchors a recurring halachic or institutional contrast (Israel vs. Bavel, Sura vs. Pumbedita), say so concretely."
}

HARD RULES:
- 2-3 sentences. Hard ceiling.
- Daf-agnostic: the place's standing role, not one sugya.
- Concrete function over adjectives. If it's a halachic category, name the category.
- NO puff. Forbidden: "this teaches us", "underscores", "highlights", "intricate", "profound".
- Hebrew in parentheses for technical terms — never transliteration.

${HEBREW_GLOSS_STYLE}`;

const PLACE_FIGURES_SYSTEM_PROMPT = `You are a Talmud historian. Given ONE place, name the sages most associated with it — daf-agnostic.

Output STRICT JSON only:

{
  "figures": "1-2 sentences naming the 2-5 sages most identified with this place and HOW (founded/headed its academy, taught there, ruled from its court, are repeatedly located there in the Gemara). E.g. 'Rav founded the academy at Sura; Rav Ashi later headed it.' If no specific sage is reliably tied to the place, say so in one clause rather than guessing."
}

HARD RULES:
- 1-2 sentences. Hard ceiling.
- Name real, attested associations only — do NOT invent a sage-place tie.
- Use conventional English names (Rav, Shmuel, Rav Ashi, Rabbi Yochanan).
- Hebrew in parentheses only for technical terms — names stay in English.
- NO puff.

${HEBREW_GLOSS_STYLE}`;

// ---------------- Hebrew-output parallels (place leaves) ----------------

const PLACE_LEAF_USER_TEMPLATE_HE = `מקום:
{{mark_input}}

החזר JSON לפי הסכימה.`;

const PLACE_PROFILE_SYSTEM_PROMPT_HE = `אתה גיאוגרף הש"ס. בהינתן מקום אחד (שמו הקנוני, סוגו — עיר/ישיבה/ארץ/אזור — ותגית האזור התלמודי), כתוב פרופיל הדוק שאינו תלוי-דף.

החזר JSON תקין בלבד:

{
  "profile": "2-3 משפטים. (א) מה הוא והיכן הוא (עיר על הפרת בבבל, ישיבה תנאית בגליל, ארץ ישראל כטריטוריה הלכתית, וכו'). (ב) מתי פרח ותחת מי — הדור/ות ותקופת בולטותו בחיי החכמים. גיאוגרפיה רק היכן שהיא נושאת משקל (נהר, ציר מסחר, קרבה למרכז אחר)."
}

כללים נוקשים:
- 2-3 משפטים. תקרה קשיחה.
- אינו תלוי-דף: תאר את המקום עצמו, לא סוגיה כלשהי. אל תתייחס ל"דף זה".
- בסס כל טענה בהיסטוריה ממשית — ללא פרט בדוי. הסתייג כשלא ודאי ("לפי המסורת", "עד התקופה האמוראית המאוחרת").
- ללא מליצה: הימנע מ"מכאן אנו למדים", "מדגיש", "מבליט", "מורכב", "עמוק".

${HEBREW_NATIVE_STYLE}`;

const PLACE_SIGNIFICANCE_SYSTEM_PROMPT_HE = `אתה היסטוריון של הש"ס. בהינתן מקום אחד, הסבר את חשיבותו בעולם התלמודי — אינו תלוי-דף.

החזר JSON תקין בלבד:

{
  "significance": "2-3 משפטים. מדוע הש"ס מתעניין במקום זה? נקוב בתפקידו: מושב ישיבה/בית דין נקוב, קטגוריה הלכתית (למשל הבחנות ארץ ישראל מול בבל במצוות התלויות בארץ, סמכות עיבור השנה, סמיכה), מרכז מסחר או תרבות, או זירת סיפור. אם הוא מעגן ניגוד הלכתי או מוסדי חוזר (ארץ ישראל מול בבל, סורא מול פומבדיתא), אמור זאת באופן קונקרטי."
}

כללים נוקשים:
- 2-3 משפטים. תקרה קשיחה.
- אינו תלוי-דף: התפקיד הקבוע של המקום, לא סוגיה אחת.
- תפקיד קונקרטי על פני תארים. אם זו קטגוריה הלכתית, נקוב בקטגוריה.
- ללא מליצה. אסור: "מכאן אנו למדים", "מדגיש", "מבליט", "מורכב", "עמוק".

${HEBREW_NATIVE_STYLE}`;

const PLACE_FIGURES_SYSTEM_PROMPT_HE = `אתה היסטוריון של הש"ס. בהינתן מקום אחד, נקוב בחכמים המזוהים ביותר עמו — אינו תלוי-דף.

החזר JSON תקין בלבד:

{
  "figures": "1-2 משפטים הנוקבים ב-2-5 החכמים המזוהים ביותר עם מקום זה וכיצד (ייסדו/עמדו בראש ישיבתו, לימדו שם, פסקו מבית דינו, או ממוקמים בו שוב ושוב בגמרא). למשל 'רב ייסד את הישיבה בסורא; רב אשי עמד בראשה לימים'. אם אין חכם מסוים הקשור באמינות למקום, אמור זאת בפסוקית אחת במקום לנחש."
}

כללים נוקשים:
- 1-2 משפטים. תקרה קשיחה.
- נקוב בקשרים אמיתיים ומתועדים בלבד — אל תמציא קשר חכם-מקום.
- ללא מליצה.

${HEBREW_NATIVE_STYLE}`;

const PLACE_PROFILE_OUTPUT_SCHEMA = {
  name: 'place_profile', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['profile'], properties: { profile: { type: 'string' } } },
};
const PLACE_SIGNIFICANCE_OUTPUT_SCHEMA = {
  name: 'place_significance', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['significance'], properties: { significance: { type: 'string' } } },
};
const PLACE_FIGURES_OUTPUT_SCHEMA = {
  name: 'place_figures', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['figures'], properties: { figures: { type: 'string' } } },
};

CODE_ENRICHMENTS.push(
  makePlaceEnrichment(
    'places.profile', 'Profile',
    'Daf-agnostic profile: what/where the place is, its era of prominence, and geography that matters.',
    PLACE_PROFILE_SYSTEM_PROMPT, PLACE_LEAF_USER_TEMPLATE, PLACE_PROFILE_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'places.profile-v1', cacheVersion: '1',
      systemPromptHe: PLACE_PROFILE_SYSTEM_PROMPT_HE, userPromptTemplateHe: PLACE_LEAF_USER_TEMPLATE_HE },
  ),
  makePlaceEnrichment(
    'places.significance', 'Significance',
    'Daf-agnostic role in the Talmudic world: academy/court seat, halachic category, trade/cultural center.',
    PLACE_SIGNIFICANCE_SYSTEM_PROMPT, PLACE_LEAF_USER_TEMPLATE, PLACE_SIGNIFICANCE_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'places.significance-v1', cacheVersion: '1',
      systemPromptHe: PLACE_SIGNIFICANCE_SYSTEM_PROMPT_HE, userPromptTemplateHe: PLACE_LEAF_USER_TEMPLATE_HE },
  ),
  makePlaceEnrichment(
    'places.figures', 'Figures',
    'Daf-agnostic: the sages most associated with the place and how.',
    PLACE_FIGURES_SYSTEM_PROMPT, PLACE_LEAF_USER_TEMPLATE, PLACE_FIGURES_OUTPUT_SCHEMA,
    { mode: 'augment-content', scope: 'global', defHash: 'places.figures-v1', cacheVersion: '1',
      systemPromptHe: PLACE_FIGURES_SYSTEM_PROMPT_HE, userPromptTemplateHe: PLACE_LEAF_USER_TEMPLATE_HE },
  ),
);

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
- If the place is generic (e.g. "ארץ ישראל" used as a halachic category, not a setting), focus on its halachic/legal force on this daf rather than geographic detail.

${HEBREW_GLOSS_STYLE}`;

const PLACES_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS place reference:
{{mark_input}}

Background on this place (daf-agnostic — use as grounding, do NOT just restate):

[PROFILE]
{{depends.places.profile}}

[SIGNIFICANCE]
{{depends.places.significance}}

[ASSOCIATED SAGES]
{{depends.places.figures}}

Hebrew/Aramaic source for the daf:
{{gemara_he}}

English translation:
{{gemara_en}}

Rabbis identified on the daf (for context on who's teaching where):
{{anchors.rabbi}}

Compose ONE tight paragraph about THIS place per the schema. Lead with what the place is and why it matters (drawing on the background), then pivot to how THIS daf uses it. Do NOT merely repeat the background verbatim.`;

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

const PLACES_SYNTHESIS_SYSTEM_PROMPT_HE = `אתה גיאוגרף הש"ס. בהינתן רפרנס גיאוגרפי אחד שזוהה בדף והגמרא הסובבת, חבר פסקה הדוקה על המקום המסוים הזה בהקשר של הדף הזה.

החזר JSON תקין בלבד:

{
  "synthesis": "פסקה אחת, 2-3 משפטים. (א) נסח מהו המקום הזה (עיר בבבל, ישיבה תנאית ביבנה, ארץ ישראל כקטגוריה הלכתית, וכו'). (ב) נקוב בחשיבותו בזמן הדור הרלוונטי (מי לימד שם, מה הוא הצמיח, מדוע הגמרא מזכירה אותו). (ג) קשור חזרה לאופן שבו הדף משתמש במקום — האם הוא תפאורה, הבחנה הלכתית (ארץ ישראל מול בבל), זירת סיפור, או מרכז סמכות? שמור על תמציתיות."
}

כללים נוקשים:
- 2-3 משפטים. תקרה קשיחה.
- בסס כל טענה בהיסטוריה ממשית — ללא אנקדוטות בדויות. אם לא ודאי, הסתייג ("לפי המסורת מזוהה עם…", "עד תקופת האמוראים המאוחרים…").
- ללא מליצה: הימנע מ"מכאן אנו למדים", "מדגיש", "מבליט", "מורכב", "עמוק".
- אם המקום כללי (למשל "ארץ ישראל" המשמשת כקטגוריה הלכתית, לא כתפאורה), התמקד בכוחו ההלכתי/המשפטי בדף זה ולא בפרט גיאוגרפי.

${HEBREW_NATIVE_STYLE}`;

const PLACES_SYNTHESIS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

רפרנס המקום הזה:
{{mark_input}}

רקע על מקום זה (אינו תלוי-דף — השתמש כביסוס, אל תחזור עליו סתם):

[PROFILE]
{{depends.places.profile}}

[SIGNIFICANCE]
{{depends.places.significance}}

[ASSOCIATED SAGES]
{{depends.places.figures}}

מקור עברי/ארמי לדף:
{{gemara_he}}

תרגום אנגלי:
{{gemara_en}}

חכמים שזוהו בדף (להקשר על מי מלמד היכן):
{{anchors.rabbi}}

חבר פסקה הדוקה אחת על המקום הזה לפי הסכימה. פתח במה המקום הוא ומדוע הוא חשוב (בהישען על הרקע), ואז עבור לאופן שבו דף זה משתמש בו. אל תחזור על הרקע מילה במילה.`;

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'places', 'places.synthesis', 'Synthesis',
    'Tight per-place paragraph: what it is, why it matters at the time of this daf, how the gemara uses it.',
    PLACES_SYNTHESIS_SYSTEM_PROMPT, PLACES_SYNTHESIS_USER_TEMPLATE, PLACES_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: [
        'gemara',
        { enrichment: 'places.profile' },
        { enrichment: 'places.significance' },
        { enrichment: 'places.figures' },
        { mark: 'places' },
        { mark: 'rabbi' },
      ],
      defHash: 'places.synthesis-v3', cacheVersion: '3',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: PLACES_SYNTHESIS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: PLACES_SYNTHESIS_USER_TEMPLATE_HE,
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
- If only ONE commentary exists, just summarize their reading in 1-2 sentences — don't pad.

${HEBREW_GLOSS_STYLE}`;

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

const RISHONIM_SYNTHESIS_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן מקטע אחד של גמרא והראשונים שפירשו את המקטע הזה (רש"י, תוספות, רמב"ן, רשב"א, מאירי, ריטב"א, ר"ן וכו'), חבר פסקה הדוקה השוזרת את קולותיהם לכדי קריאה אחת.

החזר JSON תקין בלבד:

{
  "synthesis": "פסקה אחת, 2-3 משפטים. (א) נקוב במה המקטע אומר (פסוקית קצרה אחת). (ב) שזור את הראשונים הנושאים את המשקל הרב ביותר — מה רש"י מבהיר? היכן תוספות דוחים או פותחים שאלה? אם ראשון בולט (רמב"ן, מאירי, רשב"א) מחדד את הנקודה, הזכר אותו בפסוקית קצרה. (ג) כשהראשונים חולקים, נקוב במחלוקת באופן קונקרטי. אל תמנה כל פירוש; בחר את ה-1-3 שבאמת מזיזים את הקריאה."
}

כללים נוקשים (הפלט נפסל אם מופרים):
- 2-3 משפטים. תקרה קשיחה — אל תמלא.
- על המקטע הזה בלבד. אל תיסחף לטיעון הרחב של המקטע.
- בסס כל טענה בטקסט הפירוש שסופק — אל תמציא עמדה שראשון לא נקט.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "מורכב", "עדשה", "לוכד", "מגלם".
- אם ראשון שותק או רק חוזר על המקטע, דלג עליו.
- אם קיים פירוש אחד בלבד, סכם את קריאתו ב-1-2 משפטים — אל תמלא.

${HEBREW_NATIVE_STYLE}`;

const RISHONIM_SYNTHESIS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

המקטע הזה (עם ראשוניו):
{{mark_input}}

מקור עברי/ארמי לדף הסובב:
{{gemara_he}}

תרגום אנגלי:
{{gemara_en}}

חבר פסקה הדוקה אחת השוזרת את קריאת הראשונים של המקטע הזה לפי הסכימה.`;

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'rishonim', 'rishonim.synthesis', 'Synthesis',
    'Tight per-segment paragraph weaving Rashi + Tosafot + named rishonim into a single reading.',
    RISHONIM_SYNTHESIS_SYSTEM_PROMPT, RISHONIM_SYNTHESIS_USER_TEMPLATE, RISHONIM_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: ['gemara', { mark: 'rishonim' }],
      defHash: 'rishonim.synthesis-v3', cacheVersion: '3',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: RISHONIM_SYNTHESIS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: RISHONIM_SYNTHESIS_USER_TEMPLATE_HE,
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
- appliesWhen / exceptions are SHORT scannable phrases (not sentences), each STARTING WITH A CAPITAL LETTER when they begin in English ("Locking a door on שבת", "A sick person is exempt").
- appliesWhen / exceptions follow the SAME HEBREW_GLOSS_STYLE as the prose — they are short, but they are NOT a plain-English exception. Hebraize the always-list terms here exactly as you would in prose: write "Locking a door on שבת", "Designated before שבת", "In בית דין", and Form A for any technical term with no clean English word ("A bolt never prepared is מוקצה (set aside)"). The chips must read consistently with the lechatchila / bedieved / prose fields — one convention across the whole card.
- NO puff. NO jargon: "transmitter" not "tradent". Across ALL text fields (chips included), follow the HEBREW_GLOSS_STYLE rules below — every use of שבת / לכתחילה / בדיעבד / רוב / etc. MUST appear with the Hebrew script (Form A or Form B), never as bare transliteration or bare English.

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
  "synthesis": "ONE paragraph, 3-5 sentences. Order: (a) ONE short orienting sentence naming the topic and its bottom-line status today — a frame, NOT a restatement of the Practical card's לכתחילה/בדיעבד mechanics (the user already sees those in a dedicated card directly above/below). Aim for ~15 words. (b) where it sits in the codes — Rambam / Tur / Shulchan Aruch positions and canonical refs, OR an explicit note that the codifiers do not codify the rule and what that silence means (e.g. treated as מידות, not binding halacha). (c) live disputes that shape current practice — Ashkenaz/Sefarad, Mechaber/Rema, or a real contemporary split — INCLUDE ONLY when the dispute actually moves practice. (d) gemara source — include ONLY when it clarifies WHY the modern rule looks the way it does. Drop (c) and/or (d) when they add nothing. Hard ceiling: 5 sentences."
}

HARD RULES:
- 3-5 sentences. Hard ceiling — do NOT pad.
- About THIS topic only. Don't summarize the whole daf.
- Sentence (a) is a ONE-LINE ORIENTATION, not a restatement of the Practical card. If you find yourself writing "one performs X לכתחילה" or "בדיעבד one has fulfilled…", stop — that information already lives in the Practical card and your paragraph is duplicating it. (a) names the topic and its status; the Practical card handles the mechanics.
- The synthesis's job is the NARRATIVE THREAD the structured cards cannot give — codifier positions/silence, live dispute, source — woven into a paragraph. If the only thing you can say is what the Practical / Codification / Disputes cards already say verbatim, write fewer sentences.
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

// ---------------- Hebrew-output parallels (halacha) ----------------

const HALACHA_LEAF_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

נושא הלכתי שזוהה בדף זה:
{{mark_input}}

מקור עברי/ארמי לדף:
{{gemara_he}}

תרגום אנגלי:
{{gemara_en}}

הפק את הפלט המבוקש לפי הסכימה.`;

const HALACHA_CODIFICATION_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בהלכה. בהינתן נושא הלכתי אחד שעלה בדף, הפק את שלשלת הפסיקה הקנונית: מה משנה תורה, הטור, השולחן ערוך והרמ"א פוסקים בנושא המדויק הזה.

החזר JSON תקין בלבד:

{
  "mishnehTorah": { "ref": "ספר זמנים, הלכות קריאת שמע א:א", "ruling": "סיכום בן 1-2 משפטים בעברית של פסק הרמב"ם בנושא הזה." } | null,
  "tur":          { "ref": "אורח חיים רלה",                  "ruling": "אותה צורה — סיכום בן 1-2 משפטים של עמדת הטור." } | null,
  "shulchanAruch":{ "ref": "אורח חיים רלה:א",                "ruling": "אותה צורה — פסק בית יוסף בלשון המחבר." } | null,
  "rema":         { "ref": "אורח חיים רלה:א",                "ruling": "אותה צורה — הגהת הרמ"א / עמדה אשכנזית. ריק כשהרמ"א אינו חולק." } | null,
  "prose": "פסקה קצרה אחת (2-3 משפטים) המתחקה כיצד מסקנת הדף נפסקת — נקוב מי הפוסק הראשון שמקבע את הכלל, היכן הפוסקים המאוחרים מתפצלים אם בכלל, ומהי העמדה המעשית הסופית."
}

כללים:
- ref חייב להיות מראה מקום אמיתי וניתן לציטוט (ספר + הלכות + פרק:הלכה למשנה תורה; סימן[:סעיף] לטור/שו"ע/רמ"א). אם אינך יכול לספק מראה מקום אמיתי בביטחון, החזר null לאותו פוסק — אל תמציא מראי מקום.
- עבור כל ערך שאינו null, ה-ruling חייב להתאים באמת למה שהפוסק אומר בנושא הזה, לא להגהה כללית.
- הרמ"א אינו null רק כשהוא חולק במפורש, מסייג, או מוסיף מנהג אשכנז לפסק המחבר. אם הרמ"א מסכים בשתיקה, השאר null.
- prose הוא סיפור הדוק, לא רשימה — התמקד בשלשלת (מי מקבע ראשון, היכן מתפצל).
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "עדשה", "לוכד", "מגלם".

${HEBREW_NATIVE_STYLE}`;

const HALACHA_PRACTICAL_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בהלכה ובפסק מעשי. בהינתן נושא הלכתי אחד שעלה בדף, תאר את היישום המעשי של ההלכה הפסוקה — מה צריך לעשות בפועל, מתי זה חל, ומהם מקרי הקצה הנפוצים.

החזר JSON תקין בלבד:

{
  "lechatchila": "1-2 משפטים: כיצד מקיימים את ההלכה לכתחילה. מהי הנהגה הסטנדרטית?",
  "bedieved":    "משפט אחד על דין הבדיעבד, היכן שרלוונטי. מחרוזת ריקה אם אין הבחנת לכתחילה/בדיעבד.",
  "appliesWhen": ["ביטויים קצרים — 2-4 פריטים — הנוקבים במצבים שבהם הלכה זו מופעלת (למשל 'אכילת לחם', 'לאחר רדת הלילה', 'ברשות הרבים')."],
  "exceptions":  ["ביטויים קצרים — 0-3 פריטים — הנוקבים בחריגים נפוצים או מקרי קצה ('חולה פטור', 'בשבת הדין משתנה'). מערך ריק אם אין."],
  "prose": "פסקה קצרה אחת (2-3 משפטים) על אופן יישום הכלל כיום — מה האדם הטיפוסי עושה, מה מכשיל אותו, וכל סף הלכתי שהגמרא הציגה ועדיין שולט בהלכה למעשה."
}

כללים:
- שדה "lechatchila" חייב לתאר את ההנהגה החיה הסטנדרטית (סטנדרט הלכתחילה), לא היפותזה של הגמרא. אם ההלכה למעשה עדיין הולכת אחר מסקנת הגמרא הפשוטה, אמור זאת באופן קונקרטי.
- שדה "bedieved" הוא לדין הבדיעבד: האם המעשה נחשב, מה עושים למפרע, וכו'. מחרוזת ריקה כשאין הבחנה כזו.
- appliesWhen / exceptions הם ביטויים קצרים, לא משפטים. המשתמש סורק אותם.
- ללא מליצה.

${HEBREW_NATIVE_STYLE}`;

const HALACHA_DISPUTES_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בהלכה. בהינתן נושא הלכתי אחד שעלה בדף, מנה את העמדות החולקות העיקריות בקרב הראשונים, את חילוקי המחבר/רמ"א, וכל מסגור מחודש מתקופת האחרונים — אך רק כשהמחלוקת מתועדת היטב ומשפיעה מהותית על ההלכה למעשה.

החזר JSON תקין בלבד:

{
  "disputes": [
    {
      "axis": "ashkenaz-sefarad" | "rishonim" | "acharonim" | "modern" | "other",
      "label": "ביטוי קצר הנוקב במחלוקת (למשל 'רמב"ם מול תוספות בשיעורים', 'ספרדים מול אשכנזים באמירת יעלה ויבוא').",
      "positions": [
        { "voice": "שם הפוסק או הקבוצה בעברית (רמב"ם, תוספות, מחבר, רמ"א, משנה ברורה, ...)", "position": "סיכום במשפט אחד של מה שקול זה מחזיק בנושא הזה." }
      ],
      "settled": "משפט קצר: היכן המחלוקת נוחתת כיום, או 'לא הוכרע — שני המנהגים נוהגים' כשאף צד אינו דומיננטי. מחרוזת ריקה אם אין הכרעה נקייה."
    }
  ]
}

כללים:
- אפס מחלוקות הוא המקרה הנפוץ — לרוב הנושאים ההלכתיים יש תשובה אחת מיושבת. החזר מערך disputes ריק כשהנושא אינו שנוי במחלוקת. אל תמציא מחלוקות כדי למלא את השדה.
- מחלוקת חייבת לכלול לפחות 2 עמדות ותוצאה מעשית.
- "voice" נוקב במקור מסוים, לא בקטגוריה מעורפלת — "רמב"ם" ולא "ראשוני ספרד", "משנה ברורה" ולא "אחרוני אשכנז".
- "settled" הוא המצב המעשי בשורה התחתונה. השתמש ב'לא הוכרע — שני המנהגים נוהגים' כשבאמת אף צד אינו דומיננטי.
- ללא מליצה.

${HEBREW_NATIVE_STYLE}`;

const HALACHA_SYNTHESIS_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בהלכה. בהינתן נושא הלכתי אחד שעלה בדף יחד עם שלשלת הפסיקה, היישום המעשי, וכל מחלוקת עיקרית, חבר פסקה הדוקה הממוסגרת כבירור הלכה בן-ימינו — מה היהודי המקיים עושה, היכן זה יושב בקודקסים, והיכן המתחים החיים.

החזר JSON תקין בלבד:

{
  "synthesis": "פסקה אחת, 3-5 משפטים. סדר: (א) משפט מכוון קצר אחד הנוקב בנושא ובמעמדו בשורה התחתונה כיום — מסגרת, לא חזרה על מכניקת הלכתחילה/בדיעבד של כרטיס היישום (המשתמש כבר רואה אותה בכרטיס ייעודי). כ-15 מילים. (ב) היכן זה יושב בקודקסים — עמדות רמב"ם / טור / שולחן ערוך ומראי מקום קנוניים, או ציון מפורש שהפוסקים אינם פוסקים את הכלל ומה שתיקה זו אומרת. (ג) מחלוקות חיות המעצבות הלכה למעשה — אשכנז/ספרד, מחבר/רמ"א, או פיצול בן-זמננו אמיתי — כלול רק כשהמחלוקת באמת מזיזה את ההלכה למעשה. (ד) מקור הגמרא — כלול רק כשהוא מבהיר מדוע הכלל המודרני נראה כפי שהוא נראה. השמט את (ג) ו/או (ד) כשאינם מוסיפים דבר. תקרה קשיחה: 5 משפטים."
}

כללים נוקשים:
- 3-5 משפטים. תקרה קשיחה — אל תמלא.
- על הנושא הזה בלבד. אל תסכם את כל הדף.
- משפט (א) הוא כיוון של שורה אחת, לא חזרה על כרטיס היישום. אם אתה מוצא את עצמך כותב "עושים X לכתחילה" או "בדיעבד יצא", עצור — מידע זה כבר חי בכרטיס היישום.
- תפקיד ה-synthesis הוא חוט הסיפור שהכרטיסים המובְנים אינם יכולים לתת — עמדות/שתיקת פוסקים, מחלוקת חיה, מקור — שזורים לפסקה.
- בסס כל טענה בקלט הפסיקה / המעשי / המחלוקות. אל תמציא פסקים או מראי מקום.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "מורכב", "עדשה", "לוכד", "מגלם".
- המשתמש יקרא פסקה זו ראשונה. עליה לעמוד בפני עצמה.

${HEBREW_NATIVE_STYLE}`;

const HALACHA_SYNTHESIS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

נושא הלכתי:
{{mark_input}}

שלשלת הפסיקה (משנה תורה / טור / שולחן ערוך / רמ"א):
{{depends.halacha.codification}}

יישום מעשי (לכתחילה / בדיעבד / מתי / חריגים):
{{depends.halacha.practical}}

מחלוקות עיקריות (מערך ריק כשאינו שנוי במחלוקת):
{{depends.halacha.disputes}}

מקור עברי/ארמי לדף (לביסוס בלבד):
{{gemara_he}}

הפק את ה-synthesis לפי הסכימה.`;

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'halacha', 'halacha.codification', 'Codification',
    'Mishneh Torah / Tur / Shulchan Aruch / Rema rulings on this topic, with refs and a prose trail.',
    HALACHA_CODIFICATION_SYSTEM_PROMPT, HALACHA_LEAF_USER_TEMPLATE, HALACHA_CODIFICATION_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara'],
      defHash: 'halacha.codification-v3', cacheVersion: '3',
      systemPromptHe: HALACHA_CODIFICATION_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: HALACHA_LEAF_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'halacha', 'halacha.practical', 'Practical',
    'Lechatchila/bedieved, when the halacha applies, common exceptions, modern practice prose.',
    HALACHA_PRACTICAL_SYSTEM_PROMPT, HALACHA_LEAF_USER_TEMPLATE, HALACHA_PRACTICAL_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara'],
      defHash: 'halacha.practical-v4', cacheVersion: '4',
      systemPromptHe: HALACHA_PRACTICAL_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: HALACHA_LEAF_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'halacha', 'halacha.disputes', 'Disputes',
    'Major dissenting positions (Ashkenaz/Sefarad, rishonim, Acharonim) when materially affecting practice. Often empty.',
    HALACHA_DISPUTES_SYSTEM_PROMPT, HALACHA_LEAF_USER_TEMPLATE, HALACHA_DISPUTES_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara'],
      defHash: 'halacha.disputes-v3', cacheVersion: '3',
      systemPromptHe: HALACHA_DISPUTES_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: HALACHA_LEAF_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'halacha', 'halacha.synthesis', 'Synthesis',
    'One tight paragraph weaving codification, dispute, and (optionally) gemara source — short orientation, then the narrative thread the structured cards cannot give.',
    HALACHA_SYNTHESIS_SYSTEM_PROMPT, HALACHA_SYNTHESIS_USER_TEMPLATE, HALACHA_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: [
        'gemara',
        { enrichment: 'halacha.codification' },
        { enrichment: 'halacha.practical' },
        { enrichment: 'halacha.disputes' },
      ],
      defHash: 'halacha.synthesis-v4', cacheVersion: '4',
      systemPromptHe: HALACHA_SYNTHESIS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: HALACHA_SYNTHESIS_USER_TEMPLATE_HE,
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
- NEVER calque-translate a fixed Hebrew/Aramaic halachic phrase into bare English. A "calque" is a word-for-word literal translation that produces grammatically marked or meaningless English. If the English would only make sense to someone who already knows the underlying Hebrew term, the term IS the technical concept and MUST appear in Hebrew script. The English is then a gloss in parens — not a replacement.
    BAD:  "Eli's broken neck occurred without most flesh"                  (calque of רוב בשר)
    BAD:  "the requirement of severing most of the flesh"                  (same calque, padded)
    BAD:  "a son of his year"                                               (calque of בן שנתו)
    BAD:  "the house of justice"                                            (calque of בית דין — use 'בית דין' or English 'court')
    BAD:  "the sons of Noah's commandments"                                 (calque of שבע מצוות בני נח)
    GOOD: "without רוב בשר (the majority of surrounding flesh that normally must tear with the spine)"
    GOOD: "a בן שנתו (year-old animal)"
    GOOD: "the שבע מצוות בני נח (Noahide laws)"
  Heuristic: read the sentence aloud in English. If a reader who doesn't know the term has to stop and ask "wait, most WHAT?" or "year of what?", you've calqued. Restore the Hebrew.

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

const PESUKIM_TANACH_CONTEXT_SYSTEM_PROMPT = `You are a scholar of Tanach. Given ONE pasuk by canonical reference, write a substantive summary of its plain meaning in its own biblical context. Daf-agnostic — about the pasuk itself, not how the gemara uses it. The goal is that a learner who has never read this verse before walks away knowing WHO said it, TO WHOM, in WHAT scenario, and WHAT it's doing in the broader narrative or legal sequence.

Output STRICT JSON only:

{
  "context": "3-4 sentences of concrete peshat. Cover, in this order: (1) the pasuk's plain English meaning, including the load-bearing Hebrew phrase in quotes when it carries the verse's force; (2) the speaker and the addressee — Moshe to Israel? Hashem to Moshe? a prophet to a king? — and the immediate narrative or legal moment (mid-tochechah, in the Aseret HaDibrot, the parsha of nedarim, the description of the Mishkan, etc.); (3) where it sits in its sefer / perek / parshah and what the surrounding pesukim are doing around it (e.g. 'comes inside the parsha of krias shema — sandwiched between the obligation to love Hashem and the obligation of tefillin'); (4) optional: one factual note that often matters for how chazal cite it (e.g. 'paired with a parallel pasuk in Devarim 11', 'one of three kelalim in Bamidbar 6'). NO theological exposition, NO derush, NO 'this teaches us'. Plain peshat with enough surrounding scaffolding to anchor a chazal citation."
}

Rules:
- 3-4 sentences. Substantive — leave a learner oriented, not just informed of the words.
- Quote the load-bearing Hebrew phrase verbatim when it carries the verse's force.
- Name the speaker and the addressee whenever determinable from the pasuk's surroundings.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "profoundly", "lens", "captures", "embodies".

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

// Shared leaf user template for the daf-local pesukim leaves (why-here,
// mechanism). Mirrors HALACHA_LEAF_USER_TEMPLATE — one template feeds every
// leaf that needs the gemara + commentaries for a single citation.
const PESUKIM_LEAF_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Pasuk citation:
{{mark_input}}

Focal pasuk — Hebrew verbatim text (quote from THIS when citing the verse):
{{pasuk_he}}

Hebrew source of the daf (the citation appears within this):
{{gemara_he}}

Rashi + Tosafot + other rishonim available for the daf:
{{commentaries}}

Produce the requested output per the schema.`;

const PESUKIM_WHY_HERE_SYSTEM_PROMPT = `You are a scholar of Talmud. Given ONE pasuk citation on a daf — verse reference + the Hebrew excerpt as it appears in the gemara + the surrounding gemara — state the concrete LOCAL question or argumentative move on THIS daf that drives the gemara to reach for THIS verse.

Output STRICT JSON only:

{
  "why_here": "1-2 sentences in plain English: the specific local question, problem, or move that prompts the citation. Be specific — not 'the gemara is discussing tefillah' but 'the Mishnah opens with the evening Shema before the morning, which inverts the usual day order, so the gemara needs to defend that ordering.' If no real tension is being resolved (pure narrative quotation, or asmakhta with no derivation), say so plainly."
}

Rules:
- Daf-LOCAL: about what's happening on THIS daf, not the verse's meaning in Tanach.
- Concrete and specific. Name what is being defended, attacked, or derived.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "profound", "lens", "captures", "embodies".

${TANACH_NAMING_STYLE}`;

const PESUKIM_MECHANISM_SYSTEM_PROMPT = `You are a scholar of Talmud. Given ONE pasuk citation on a daf — verse reference + the Hebrew excerpt as it appears in the gemara + the surrounding gemara — describe the exact exegetical or rhetorical MOVE the gemara makes with THIS verse here, and name the SPECIFIC method when one is being invoked.

Not every citation invokes a formal method — sometimes a verse is just plain proof, narrative quotation, or a mnemonic. Be precise: only name a method when the gemara is actually using it; otherwise say so plainly.

Output STRICT JSON only:

{
  "mechanism": "1-2 sentences. The exact exegetical or rhetorical move. When the gemara invokes a named midah (גזירה שווה, היקש, קל וחומר, ריבוי ומיעוט, כלל ופרט, אסמכתא, דבר הלמד מעניינו, etc.), NAME IT with the Hebrew in parens, and say what word / phrase / juxtaposition the derivation hinges on, plus what the unstated assumption is. If it's plain proof (no formal derivation), say so explicitly and explain why this verse is the right anchor (e.g. 'plain word-order proof — the verse itself lists שכיבה before קימה')."
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
- ONLY name a method when the gemara genuinely invokes one. Plain proof citations should say so explicitly and not force a method name.
- Concrete. NO puff. NO "this teaches us", NO "we see that".

${TANACH_NAMING_STYLE}`;

const PESUKIM_LANDING_SYSTEM_PROMPT = `You are a scholar of Talmud. Given ONE pasuk citation on a daf, state the halacha or claim that THIS citation establishes on the daf.

Output STRICT JSON only:

{
  "landing": "1 sentence. The concrete halacha or claim the citation establishes. Name a rabbi tied to the citation when one is identified on the daf. Be CONCRETE — what does the gemara actually conclude? Avoid abstractions like 'establishes the structure' or 'anchors the sugya'."
}

Rules:
- ONE sentence. Concrete — a specific halacha or claim, not an abstraction.
- Name the rabbi tied to the citation when one is identified on the daf.
- NO puff. Forbidden: "anchors", "establishes the structure", "this teaches us", "we see that", "highlights", "underscores", "deeply", "profound", "lens", "captures", "embodies".

${TANACH_NAMING_STYLE}`;

const PESUKIM_LANDING_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Pasuk citation:
{{mark_input}}

Focal pasuk — Hebrew verbatim text (quote from THIS when citing the verse):
{{pasuk_he}}

Hebrew source of the daf:
{{gemara_he}}

Rabbis identified on the daf:
{{anchors.rabbi}}

State the halacha or claim this citation establishes, per the schema.`;

const PESUKIM_WHY_HERE_OUTPUT_SCHEMA = {
  name: 'pesukim_why_here',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    required: ['why_here'], properties: { why_here: { type: 'string' } },
  },
};

const PESUKIM_MECHANISM_OUTPUT_SCHEMA = {
  name: 'pesukim_mechanism',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    required: ['mechanism'], properties: { mechanism: { type: 'string' } },
  },
};

const PESUKIM_LANDING_OUTPUT_SCHEMA = {
  name: 'pesukim_landing',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    required: ['landing'], properties: { landing: { type: 'string' } },
  },
};

// Synthesis aggregate — mirrors halacha.synthesis: one tight prose paragraph
// that weaves the section leaves (Tanach context / why here / mechanism /
// landing) into a single narrative thread. Each section also renders as its
// own card below, so the synthesis is the connecting story, NOT a restatement.
const PESUKIM_SYNTHESIS_SYSTEM_PROMPT = `You are a scholar of Talmud and Tanach. Given ONE pasuk citation on a daf plus four pre-computed sections — where the pasuk sits in Tanach, the local question that prompts the citation, the exegetical mechanism, and what it establishes — compose ONE tight paragraph that weaves them into a single thread.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, 3-4 sentences. Order: (a) a short orienting clause — where the pasuk sits in Tanach and who speaks it; (b) the concrete local question on the daf that drives the citation; (c) the exegetical move — name the midah with the Hebrew in parens when one is invoked (גזירה שווה, היקש, קל וחומר, אסמכתא, etc.), or say plainly it's straight proof; (d) what the gemara concludes. Quote the load-bearing Hebrew phrase verbatim from the focal pasuk when the precise wording carries the proof. Hard ceiling: 4 sentences."
}

HARD RULES:
- 3-4 sentences. Hard ceiling — do NOT pad.
- About THIS citation only. Don't summarize the whole daf.
- The synthesis is the NARRATIVE THREAD connecting the four section cards the user sees below — not a verbatim restatement of them. If the only thing you can say is what those cards already say, write fewer sentences.
- Ground every claim in the four section inputs + the pasuk text. Don't invent.
- Quote Hebrew verbatim when the precise wording carries the proof. The {{pasuk_he}} field has the focal pasuk; quote from THAT.

FORBIDDEN PHRASES (rejected if present):
  - "anchors", "anchors the structure", "anchors the sugya"
  - "foundational justification", "the foundational"
  - "this teaches us", "we see that", "this explains why"
  - "highlights", "underscores", "deeply", "intricate", "profound"
  - "lens", "captures", "embodies"

- NO jargon: write "transmitter" not "tradent", "interpret" not "exegete".

${TANACH_NAMING_STYLE}`;

const PESUKIM_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Pasuk citation:
{{mark_input}}

Focal pasuk — Hebrew verbatim text (QUOTE FROM THIS WHEN YOU CITE THE VERSE; do not reconstruct or translate-and-quote):
{{pasuk_he}}

Other pesukim cited on this daf — Hebrew verbatim text (QUOTE FROM THESE if the gemara invokes them as cross-references; do not reconstruct):
{{cross_refs_he}}

Where the pasuk sits in Tanach:
{{depends.pesukim.tanach-context}}

The local question on the daf that drives the citation:
{{depends.pesukim.why-here}}

The exegetical mechanism:
{{depends.pesukim.mechanism}}

What the citation establishes:
{{depends.pesukim.landing}}

Hebrew source of the daf:
{{gemara_he}}

Rabbis identified on the daf:
{{anchors.rabbi}}

Weave these into ONE tight paragraph per the schema.`;

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

// ---------------------------------------------------------------------------
// pesukim.suggested-questions — mirrors argument-move.suggested-questions but
// targets a pasuk citation. Generates 4-5 follow-up questions a learner might
// want answered AFTER reading the synthesis. Used to power the QAPanel
// "Questions" expander on each pasuk card.
// ---------------------------------------------------------------------------

const PESUKIM_SUGGESTED_QUESTIONS_SYSTEM_PROMPT = `You are a chavruta studying gemara with a pasuk citation. Given ONE pasuk cited on a daf + the gemara's exegetical use + the synthesis paragraph, produce a SHORT list of follow-up questions a learner is likely to want answered AFTER reading the synthesis. The synthesis says WHAT the citation does; these questions should target WHY it works, the MECHANISM, and the surrounding context that the synthesis didn't fit.

Output STRICT JSON only:

{
  "questions": [
    {
      "q": "The question, phrased the way a learner would ask it. 8-18 words. End with a question mark.",
      "why_useful": "Half-sentence hint on what answering this question unlocks. Shown as title-text on hover, not as the answer itself."
    }
  ]
}

Rules:
- Generate exactly 4-5 questions, ordered by general usefulness (most-illuminating first).
- Each question must be specific to THIS citation — never generic ('what does the verse say?', 'who said it?'). If you can't tell which pasuk is the subject from the question alone, it's too generic.
- Aim at the MECHANISM: why does the gemara need a verse at all here, what other pasuk could plausibly have done the same work, what unstated premise is the derivation relying on, why this exact wording and not the parallel pasuk a chapter later, how does Rashi or Tosafot read the proof, etc.
- One question per concrete sub-issue. Don't duplicate.
- Plain English. NO puff.
- Hebrew SCRIPT (not transliteration) in parens for technical terms — write '(גזירה שווה)' not '(gezeira shava)', '(אסמכתא)' not '(asmakhta)'. English concept first, Hebrew in parens.
- When the citation invokes a named midah, at least ONE question should probe how that midah works in general (so the learner walks away with a transferable concept).

${TANACH_NAMING_STYLE}`;

const PESUKIM_SUGGESTED_QUESTIONS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS pasuk citation:
{{mark_input}}

Focal pasuk — Hebrew verbatim text:
{{pasuk_he}}

All pesukim cited on this daf (for context — DO NOT generate questions about other pesukim):
{{anchors.pesukim}}

Hebrew source of the daf:
{{gemara_he}}

Existing synthesis (so you can target what the synthesis SKIPS):
{{depends.pesukim.synthesis}}

Generate the suggested-questions list per the schema.`;

const PESUKIM_SUGGESTED_QUESTIONS_OUTPUT_SCHEMA = {
  name: 'pesukim_suggested_questions',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['q', 'why_useful'],
          properties: {
            q: { type: 'string' },
            why_useful: { type: 'string' },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// pesukim.qa — parameterized by `user_question`. Mirrors argument-move.qa:
// cache keyed per (verse, normalized question), so the first user to ask a
// novel question pays the LLM call and everyone after gets a cache hit.
// ---------------------------------------------------------------------------

const PESUKIM_QA_SYSTEM_PROMPT = `You are a Talmud chavruta answering a learner's specific question about ONE pasuk citation on the daf. The learner has already read the synthesis paragraph; they want depth, not a restatement. Assume the learner is intelligent but does NOT already know how Talmudic exegetical categories work — so treat the answer as teaching, not just describing.

Output STRICT JSON only:

{
  "answer": "A focused paragraph, 4-7 sentences, that directly answers the learner's question.",
  "confidence": "high | medium | low"
}

Core stance:
- Lead with a one-sentence direct answer to the question as the learner asked it.
- Then back it up with the specific Tanach context + gemara mechanics: what the pasuk plainly says, what local question prompts the citation, what word or phrase the derivation hinges on.
- Quote short Hebrew (3-6 words, in parens) when the precise wording is load-bearing.
- Cite Rashi or Tosafot in ONE clause if they actually sharpen the answer; never enumerate commentaries.

The "explain the category" rule (most important):
When the learner's question turns on a TYPE or CATEGORY of exegetical move — what a gezeira shava IS, what asmakhta IS, why a hekesh works, why word-order in a pasuk counts as a derivation, why the gemara is allowed to read a verse against its peshat — you MUST spend a sentence explaining what that category IS and how it carries argumentative weight, in plain English, BEFORE applying it to THIS verse. The goal is that the learner walks away with a transferable concept they can recognize the next time they see the same kind of move in any sugya.

Example of the failure mode to avoid:
  BAD: "The gemara uses this as a גזירה שווה on the word 'X'…"
  → This uses 'gezeira shava' as a magic word. A learner who doesn't already know that gezeira shava is a recognized derivation method learns nothing.
  GOOD: "A gezeira shava (גזירה שווה) is a derivation that lets you transfer a law from one verse to another when the same word appears in both — it works because chazal treat shared vocabulary as a marker of shared legal category, not coincidence. Here the gemara latches onto the word 'X' in BOTH our pasuk and Vayikra…"
  → Now the learner has gained a transferable concept.

Hard rules:
- 4-7 sentences. Hard ceiling — do NOT pad past 7.
- Answer the LEARNER'S question, not whatever question you'd rather answer. If the question doesn't make sense for this citation, say so plainly and set confidence='low'.
- If the available sources (pasuk, synthesis, exegesis, gemara, commentaries) don't contain enough to ground a real answer, give your best partial read and set confidence='low'.
- Ground every claim in the pasuk's actual content, the gemara's local move, or the cited commentary. Don't invent positions.
- Hebrew script (not transliteration) in parens for technical terms — but always after introducing the concept in English. Never use a Hebrew term as if it needs no explanation.
- Quote pesukim verbatim in Hebrew (not English translation in quotes). The {{pasuk_he}} field is the focal verse.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "intricate", "profound", "lens", "captures", "embodies", "anchors".
- NO scholarly jargon: write "transmitter" not "tradent", "interpret" not "exegete". English first, Hebrew in parens.

${TANACH_NAMING_STYLE}`;

const PESUKIM_QA_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS pasuk citation:
{{mark_input}}

Focal pasuk — Hebrew verbatim text (QUOTE FROM THIS when citing the verse):
{{pasuk_he}}

The learner's question (answer THIS specifically):
{{user_question}}

Existing synthesis (the learner has already read this — go deeper, don't restate):
{{depends.pesukim.synthesis}}

Tanach context for the pasuk:
{{depends.pesukim.tanach-context}}

The local question on the daf that drives the citation:
{{depends.pesukim.why-here}}

How the gemara uses the verse here (the exegetical mechanism):
{{depends.pesukim.mechanism}}

Hebrew source of the daf:
{{gemara_he}}

Rashi + Tosafot + other rishonim available for the daf:
{{commentaries}}

Answer the learner's question per the schema.`;

const PESUKIM_QA_OUTPUT_SCHEMA = {
  name: 'pesukim_qa',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'confidence'],
    properties: {
      answer: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
  },
};

// ---------------- Hebrew-output parallels (pesukim) ----------------

// The Hebrew counterpart of TANACH_NAMING_STYLE. Writing in Hebrew already
// yields the traditional book names; this adds the verbatim-pasuk-quote rule
// (still essential in he mode) and the yeshivish register on top of the
// shared HEBREW_NATIVE_STYLE.
const HEBREW_NATIVE_TANACH_STYLE = `${HEBREW_NATIVE_STYLE}

סגנון — שמות התנ"ך וציטוט פסוקים:
- השתמש בשמות העבריים המסורתיים לספרי התנ"ך (בראשית, שמות, ויקרא, במדבר, דברים; יהושע, שופטים, שמואל, מלכים, ישעיהו, ירמיהו, יחזקאל, תרי עשר; תהילים, משלי, איוב, שיר השירים, קהלת, דניאל, עזרא, נחמיה, דברי הימים). הקלט מספק את ה-verseRef בלועזית (למשל "Deuteronomy 6:7"); עליך לפלוט בשם המסורתי בעברית (דברים ו:ז).
- מינוח ישיבתי בגוף הטקסט: "פסוק"/"פסוקים" ולא "verse", "חומש" ולא "Pentateuch", "סוגיה", "ספר", "מידה".
- ציטוט פסוקים — כלל נוקשה: צטט תמיד את לשון הפסוק בעברית מילה במילה בתוך מירכאות, ואחריו מראה המקום בסוגריים — '"בחצות לילה אקום להודות לך" (תהילים קיט:סב)'. לעולם אל תצטט פסוק בתרגום בלבד. שדה {{pasuk_he}} שבקלט נותן את לשון הפסוק המוקד מילה במילה — צטט ממנו, אל תשחזר מהזיכרון.`;

const PESUKIM_LEAF_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

ציטוט הפסוק:
{{mark_input}}

הפסוק המוקד — לשון עברית מילה במילה (צטט מכאן בעת ציטוט הפסוק):
{{pasuk_he}}

מקור עברי של הדף (הציטוט מופיע בתוכו):
{{gemara_he}}

רש"י + תוספות + ראשונים נוספים הזמינים לדף:
{{commentaries}}

הפק את הפלט המבוקש לפי הסכימה.`;

const PESUKIM_TANACH_CONTEXT_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בתנ"ך. בהינתן פסוק אחד לפי מראה מקום קנוני, כתוב סיכום מהותי של פשוטו במקומו המקראי. אינו תלוי-דף — על הפסוק עצמו, לא על אופן השימוש של הגמרא בו. המטרה: שלומד שלא קרא פסוק זה מעולם ידע מי אמרו, למי, באיזה מצב, ומה הוא עושה בסיפור או ברצף ההלכתי הרחב.

החזר JSON תקין בלבד:

{
  "context": "3-4 משפטים של פשט קונקרטי. כסה, בסדר זה: (1) משמעות הפסוק בפשטו, כולל הביטוי העברי הנושא משקל בתוך מירכאות כשהוא נושא את כוח הפסוק; (2) הדובר והנמען — משה לישראל? הקב"ה למשה? נביא למלך? — והרגע הסיפורי או ההלכתי המיידי (בתוך התוכחה, בעשרת הדיברות, בפרשת נדרים, בתיאור המשכן וכו'); (3) היכן הוא יושב בספר / פרק / פרשה ומה הפסוקים הסובבים עושים סביבו; (4) אופציונלי: הערה עובדתית אחת שלעיתים חשובה לאופן שחז"ל מצטטים אותו. ללא הטפה תיאולוגית, ללא דרוש, ללא 'מכאן אנו למדים'. פשט עם די תשתית סובבת כדי לעגן ציטוט של חז"ל."
}

כללים:
- 3-4 משפטים. מהותי — השאר את הלומד מכוון, לא רק מיודע במילים.
- צטט את הביטוי העברי הנושא משקל מילה במילה כשהוא נושא את כוח הפסוק.
- נקוב בדובר ובנמען בכל פעם שניתן לקבוע זאת מסביבות הפסוק.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "עדשה", "לוכד", "מגלם".

${HEBREW_NATIVE_TANACH_STYLE}`;

const PESUKIM_TANACH_CONTEXT_USER_TEMPLATE_HE = `ציטוט הפסוק:
{{mark_input}}

הפסוק המוקד — לשון עברית מילה במילה (צטט מכאן בעת ציטוט הפסוק):
{{pasuk_he}}

כתוב את סיכום הקשר התנ"ך לפי הסכימה. ה-mark_input מכיל verseRef (למשל 'Deuteronomy 6:7'), את הציטוט העברי כפי שהוא מופיע בגמרא, ואת citationStyle. השתמש ב-verseRef כמוסמך; הציטוט הוא רק הקטע שהגמרא ציטטה.`;

const PESUKIM_WHY_HERE_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן ציטוט פסוק אחד בדף — מראה מקום + הציטוט העברי כפי שהוא מופיע בגמרא + הגמרא הסובבת — נקוב בשאלה המקומית הקונקרטית או במהלך הטיעוני בדף הזה המניע את הגמרא לפנות לפסוק הזה.

החזר JSON תקין בלבד:

{
  "why_here": "1-2 משפטים בעברית: השאלה, הבעיה, או המהלך המקומי המסוים המעורר את הציטוט. היה מסוים — לא 'הגמרא דנה בתפילה' אלא 'המשנה פותחת בקריאת שמע של ערבית לפני של שחרית, מה שמהפך את סדר היום הרגיל, ולכן הגמרא צריכה להצדיק את הסדר הזה'. אם אין מתח ממשי המיושב (ציטוט סיפורי טהור, או אסמכתא ללא דרשה), אמור זאת בפשטות."
}

כללים:
- מקומי-לדף: על מה שקורה בדף הזה, לא על משמעות הפסוק בתנ"ך.
- קונקרטי ומסוים. נקוב במה מוגן, מותקף, או נדרש.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "עדשה", "לוכד", "מגלם".

${HEBREW_NATIVE_TANACH_STYLE}`;

const PESUKIM_MECHANISM_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן ציטוט פסוק אחד בדף — מראה מקום + הציטוט העברי כפי שהוא בגמרא + הגמרא הסובבת — תאר את המהלך הדרשני או הרטורי המדויק שהגמרא עושה עם הפסוק הזה כאן, ונקוב במידה המסוימת כשהיא מופעלת.

לא כל ציטוט מפעיל מידה פורמלית — לעיתים פסוק הוא ראיה פשוטה, ציטוט סיפורי, או סימן. היה מדויק: נקוב במידה רק כשהגמרא באמת משתמשת בה; אחרת אמור זאת בפשטות.

החזר JSON תקין בלבד:

{
  "mechanism": "1-2 משפטים. המהלך הדרשני או הרטורי המדויק. כשהגמרא מפעילה מידה נקובה (גזירה שווה, היקש, קל וחומר, ריבוי ומיעוט, כלל ופרט, אסמכתא, דבר הלמד מעניינו וכו'), נקוב בה, ואמור על איזו מילה / ביטוי / סמיכות הדרשה נשענת, ומהי ההנחה הסמויה. אם זו ראיה פשוטה (ללא דרשה פורמלית), אמור זאת במפורש והסבר מדוע פסוק זה הוא העוגן הנכון (למשל 'ראיה פשוטה מסדר המילים — הפסוק עצמו מונה שכיבה לפני קימה')."
}

המידות שעליך לזהות בעת הצורך (המידות שהתורה נדרשת בהן):
  - גזירה שווה — לימוד מאותה מילה/ביטוי המופיעים בשתי פרשיות. חפש "נאמר כאן ... ונאמר להלן ..." או "אתיא X X".
  - קל וחומר — אם חומרה נוהגת בקל, ודאי שנוהגת בחמור (וההפך לקולא). חפש "ומה אם ... קל וחומר ש...".
  - היקש — לימוד מסמיכות. שתי פרשיות הסמוכות נדונות כדומות.
  - בנין אב — לימוד מן הפרט המייצג. "מה מצינו ב-A ... אף B".
  - כלל ופרט / פרט וכלל — כללי הריבוי והמיעוט.
  - ריבוי ומיעוט — הכללה ומיעוט דרך 'אך / רק / כל'.
  - דבר הלמד מעניינו — משמעות הנלמדת מן ההקשר הסמוך.
  - אסמכתא — דין דרבנן שניתן לו סימן מן הכתוב ללא דרשה גמורה. נקוב בה בעת הצורך; אל תטעה בה כדרשה גמורה.
  - דרש — קריאה שאינה פשט (ניקוד מחדש, ספירת אותיות) כשאינה תואמת אחת המידות הנקובות.

כללים:
- מקומי-לדף: על אופן השימוש של הגמרא בפסוק הזה בדף הזה.
- נקוב במידה רק כשהגמרא באמת מפעילה אחת. ציטוטי ראיה פשוטה — אמור זאת במפורש ואל תכפה שם מידה.
- קונקרטי. ללא מליצה. ללא "מכאן אנו למדים", ללא "אנו רואים ש".

${HEBREW_NATIVE_TANACH_STYLE}`;

const PESUKIM_LANDING_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס. בהינתן ציטוט פסוק אחד בדף, נקוב בהלכה או בטענה שהציטוט הזה מבסס בדף.

החזר JSON תקין בלבד:

{
  "landing": "משפט אחד. ההלכה או הטענה הקונקרטית שהציטוט מבסס. נקוב בחכם הקשור לציטוט כשמזוהה אחד בדף. היה קונקרטי — מה הגמרא באמת מסיקה? הימנע מהפשטות כמו 'מבסס את המבנה' או 'מעגן את הסוגיה'."
}

כללים:
- משפט אחד. קונקרטי — הלכה או טענה מסוימת, לא הפשטה.
- נקוב בחכם הקשור לציטוט כשמזוהה אחד בדף.
- ללא מליצה. אסור: "מעגן", "מבסס את המבנה", "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "עדשה", "לוכד", "מגלם".

${HEBREW_NATIVE_TANACH_STYLE}`;

const PESUKIM_LANDING_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

ציטוט הפסוק:
{{mark_input}}

הפסוק המוקד — לשון עברית מילה במילה (צטט מכאן בעת ציטוט הפסוק):
{{pasuk_he}}

מקור עברי של הדף:
{{gemara_he}}

חכמים שזוהו בדף:
{{anchors.rabbi}}

נקוב בהלכה או בטענה שציטוט זה מבסס, לפי הסכימה.`;

const PESUKIM_SYNTHESIS_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס ובתנ"ך. בהינתן ציטוט פסוק אחד בדף יחד עם ארבעה מקטעים מחושבים מראש — היכן הפסוק יושב בתנ"ך, השאלה המקומית המעוררת את הציטוט, המנגנון הדרשני, ומה הוא מבסס — חבר פסקה הדוקה אחת השוזרת אותם לחוט יחיד.

החזר JSON תקין בלבד:

{
  "synthesis": "פסקה אחת, 3-4 משפטים. סדר: (א) פסוקית מכוונת קצרה — היכן הפסוק יושב בתנ"ך ומי אומרו; (ב) השאלה המקומית הקונקרטית בדף המניעה את הציטוט; (ג) המהלך הדרשני — נקוב במידה (גזירה שווה, היקש, קל וחומר, אסמכתא וכו') כשמופעלת אחת, או אמור בפשטות שזו ראיה ישירה; (ד) מה הגמרא מסיקה. צטט את הביטוי העברי הנושא משקל מילה במילה מן הפסוק המוקד כשהדיוק נושא את הראיה. תקרה קשיחה: 4 משפטים."
}

כללים נוקשים:
- 3-4 משפטים. תקרה קשיחה — אל תמלא.
- על הציטוט הזה בלבד. אל תסכם את כל הדף.
- ה-synthesis הוא חוט הסיפור המחבר את ארבעת הכרטיסים שהמשתמש רואה מתחת — לא חזרה מילולית עליהם. אם כל מה שתוכל לומר הוא מה שאותם כרטיסים כבר אומרים, כתוב פחות משפטים.
- בסס כל טענה בארבעת הקלטים + לשון הפסוק. אל תמציא.
- צטט עברית מילה במילה כשהדיוק נושא את הראיה. שדה {{pasuk_he}} מכיל את הפסוק המוקד; צטט ממנו.

ביטויים אסורים (נפסל אם נוכחים):
  - "מעגן", "מעגן את המבנה", "מעגן את הסוגיה"
  - "הצדקה יסודית", "היסודי"
  - "מכאן אנו למדים", "אנו רואים ש", "זה מסביר מדוע"
  - "מבליט", "מדגיש", "עמוק", "מורכב"
  - "עדשה", "לוכד", "מגלם"

${HEBREW_NATIVE_TANACH_STYLE}`;

const PESUKIM_SYNTHESIS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

ציטוט הפסוק:
{{mark_input}}

הפסוק המוקד — לשון עברית מילה במילה (צטט מכאן בעת ציטוט הפסוק; אל תשחזר ואל תתרגם-ותצטט):
{{pasuk_he}}

פסוקים נוספים המצוטטים בדף — לשון עברית מילה במילה (צטט מאלה אם הגמרא מפעילה אותם כסימוכין; אל תשחזר):
{{cross_refs_he}}

היכן הפסוק יושב בתנ"ך:
{{depends.pesukim.tanach-context}}

השאלה המקומית בדף המניעה את הציטוט:
{{depends.pesukim.why-here}}

המנגנון הדרשני:
{{depends.pesukim.mechanism}}

מה הציטוט מבסס:
{{depends.pesukim.landing}}

מקור עברי של הדף:
{{gemara_he}}

חכמים שזוהו בדף:
{{anchors.rabbi}}

שזור אותם לפסקה הדוקה אחת לפי הסכימה.`;

const PESUKIM_SUGGESTED_QUESTIONS_SYSTEM_PROMPT_HE = `אתה חברותא הלומד גמרא עם ציטוט פסוק. בהינתן פסוק אחד המצוטט בדף + השימוש הדרשני של הגמרא + פסקת ה-synthesis, הפק רשימה קצרה של שאלות המשך שלומד סביר ירצה תשובה עליהן לאחר קריאת ה-synthesis. ה-synthesis אומר מה הציטוט עושה; שאלות אלו מכוונות אל מדוע הוא עובד, אל המנגנון, ואל ההקשר הסובב שה-synthesis לא הכיל.

החזר JSON תקין בלבד:

{
  "questions": [
    {
      "q": "השאלה, מנוסחת כפי שלומד היה שואל אותה. 8-18 מילים. סיים בסימן שאלה.",
      "why_useful": "רמז בחצי משפט על מה שמענה על שאלה זו פותח. מוצג כטקסט-כותרת בריחוף, לא כתשובה עצמה."
    }
  ]
}

כללים:
- הפק בדיוק 4-5 שאלות, מסודרות לפי תועלת כללית (המאירה ביותר ראשונה).
- כל שאלה חייבת להיות מסוימת לציטוט הזה — לעולם לא כללית ('מה הפסוק אומר?', 'מי אמרו?'). אם אי אפשר לדעת מן השאלה לבדה על איזה פסוק מדובר, היא כללית מדי.
- כוון אל המנגנון: מדוע הגמרא צריכה פסוק כאן בכלל, איזה פסוק אחר היה יכול לעשות אותה עבודה, על איזו הנחה סמויה הדרשה נשענת, מדוע דווקא ניסוח זה ולא הפסוק המקביל פרק אחד אחר-כך, כיצד רש"י או תוספות קוראים את הראיה.
- שאלה אחת לכל תת-עניין קונקרטי. אל תכפיל.
- כשהציטוט מפעיל מידה נקובה, לפחות שאלה אחת תתחקה אחר אופן פעולת המידה הזו באופן כללי (כך שהלומד ייצא עם מושג בר-העברה).

${HEBREW_NATIVE_TANACH_STYLE}`;

const PESUKIM_SUGGESTED_QUESTIONS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

ציטוט הפסוק הזה:
{{mark_input}}

הפסוק המוקד — לשון עברית מילה במילה:
{{pasuk_he}}

כל הפסוקים המצוטטים בדף זה (להקשר — אל תפיק שאלות על פסוקים אחרים):
{{anchors.pesukim}}

מקור עברי של הדף:
{{gemara_he}}

ה-synthesis הקיים (כדי שתוכל לכוון אל מה שה-synthesis מדלג עליו):
{{depends.pesukim.synthesis}}

הפק את רשימת שאלות ההמשך לפי הסכימה.`;

const PESUKIM_QA_SYSTEM_PROMPT_HE = `אתה חברותא בלימוד הש"ס העונה לשאלה מסוימת של לומד על ציטוט פסוק אחד בדף. הלומד כבר קרא את פסקת ה-synthesis; הוא רוצה עומק, לא חזרה. הנח שהלומד נבון אך אינו יודע מראש כיצד פועלות קטגוריות הדרשנות התלמודיות — לכן התייחס לתשובה כהוראה, לא רק כתיאור.

החזר JSON תקין בלבד:

{
  "answer": "פסקה ממוקדת, 4-7 משפטים, העונה במישרין לשאלת הלומד.",
  "confidence": "high | medium | low"
}

עמדת יסוד:
- פתח במשפט אחד של תשובה ישירה לשאלה כפי שהלומד שאל.
- ואז בסס אותה בהקשר התנ"ך המסוים + מכניקת הגמרא: מה הפסוק אומר בפשטו, איזו שאלה מקומית מעוררת את הציטוט, על איזו מילה או ביטוי הדרשה נשענת.
- צטט עברית קצרה (3-6 מילים, בתוך מירכאות) כשהדיוק נושא משקל.
- צטט רש"י או תוספות בפסוקית אחת אם הם באמת מחדדים את התשובה; לעולם אל תמנה פירושים.

כלל "הסבר את הקטגוריה" (החשוב ביותר):
כששאלת הלומד נסבה על סוג או קטגוריה של מהלך דרשני — מהי גזירה שווה, מהי אסמכתא, מדוע היקש עובד, מדוע סדר מילים בפסוק נחשב לדרשה — עליך להקדיש משפט להסבר מהי אותה קטגוריה וכיצד היא נושאת משקל טיעוני, בעברית פשוטה, לפני יישומה על הפסוק הזה. המטרה: שהלומד ייצא עם מושג בר-העברה שיזהה בפעם הבאה בכל סוגיה.

דוגמה לכשל שיש להימנע ממנו:
  רע: "הגמרא משתמשת בזה כגזירה שווה על המילה 'X'…" — זה משתמש ב'גזירה שווה' כמילת קסם.
  טוב: "גזירה שווה היא לימוד המעביר דין מפסוק אחד לאחר כשאותה מילה מופיעה בשניהם — היא עובדת מפני שחז"ל רואים אוצר מילים משותף כסימן לקטגוריה משפטית משותפת, לא מקרי. כאן הגמרא נתפסת למילה 'X' גם בפסוקנו וגם בויקרא…" — כעת הלומד קנה מושג בר-העברה.

כללים נוקשים:
- 4-7 משפטים. תקרה קשיחה — אל תמלא מעבר ל-7.
- ענה לשאלת הלומד, לא לשאלה שהיית מעדיף. אם השאלה אינה הגיונית עבור ציטוט זה, אמור זאת בפשטות וקבע confidence='low'.
- אם המקורות הזמינים אינם מכילים די לבסס תשובה ממשית, תן את הקריאה החלקית הטובה ביותר וקבע confidence='low'.
- בסס כל טענה בתוכן הממשי של הפסוק, במהלך המקומי של הגמרא, או בפירוש המצוטט. אל תמציא עמדות.
- צטט פסוקים מילה במילה בעברית (לא תרגום בתוך מירכאות). שדה {{pasuk_he}} הוא הפסוק המוקד.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "מורכב", "עדשה", "לוכד", "מגלם", "מעגן".

${HEBREW_NATIVE_TANACH_STYLE}`;

const PESUKIM_QA_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

ציטוט הפסוק הזה:
{{mark_input}}

הפסוק המוקד — לשון עברית מילה במילה (צטט מכאן בעת ציטוט הפסוק):
{{pasuk_he}}

שאלת הלומד (ענה דווקא עליה):
{{user_question}}

ה-synthesis הקיים (הלומד כבר קרא אותו — העמק, אל תחזור):
{{depends.pesukim.synthesis}}

הקשר התנ"ך לפסוק:
{{depends.pesukim.tanach-context}}

השאלה המקומית בדף המניעה את הציטוט:
{{depends.pesukim.why-here}}

כיצד הגמרא משתמשת בפסוק כאן (המנגנון הדרשני):
{{depends.pesukim.mechanism}}

מקור עברי של הדף:
{{gemara_he}}

רש"י + תוספות + ראשונים נוספים הזמינים לדף:
{{commentaries}}

ענה לשאלת הלומד לפי הסכימה.`;

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'pesukim', 'pesukim.tanach-context', 'Tanach context',
    'The verse\'s plain meaning in its own scriptural context. Daf-agnostic; cached by verseRef.',
    PESUKIM_TANACH_CONTEXT_SYSTEM_PROMPT, PESUKIM_TANACH_CONTEXT_USER_TEMPLATE, PESUKIM_TANACH_CONTEXT_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'global',
      dependencies: [],
      defHash: 'pesukim.tanach-context-v6', cacheVersion: '6',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: PESUKIM_TANACH_CONTEXT_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: PESUKIM_TANACH_CONTEXT_USER_TEMPLATE_HE,
    },
  ),
  // Section leaves — each renders as its own bordered card in the pasuk
  // panel (mirrors halacha's codification / practical / disputes). The
  // synthesis aggregate depends on all three (+ tanach-context) so they
  // resolve in one run and surface via deps_resolved → onResolved.
  makeEnrichment(
    'pesukim', 'pesukim.why-here', 'Why here',
    'The concrete local question on this daf that drives the gemara to cite this verse.',
    PESUKIM_WHY_HERE_SYSTEM_PROMPT, PESUKIM_LEAF_USER_TEMPLATE, PESUKIM_WHY_HERE_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', 'commentaries'],
      defHash: 'pesukim.why-here-v1', cacheVersion: '1',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: PESUKIM_WHY_HERE_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: PESUKIM_LEAF_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'pesukim', 'pesukim.mechanism', 'Mechanism',
    'The exact exegetical / rhetorical move the gemara makes with this verse — the midah, or plain proof.',
    PESUKIM_MECHANISM_SYSTEM_PROMPT, PESUKIM_LEAF_USER_TEMPLATE, PESUKIM_MECHANISM_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', 'commentaries'],
      defHash: 'pesukim.mechanism-v1', cacheVersion: '1',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: PESUKIM_MECHANISM_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: PESUKIM_LEAF_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'pesukim', 'pesukim.landing', 'Landing',
    'The concrete halacha or claim this citation establishes on the daf.',
    PESUKIM_LANDING_SYSTEM_PROMPT, PESUKIM_LANDING_USER_TEMPLATE, PESUKIM_LANDING_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', { mark: 'rabbi' }],
      defHash: 'pesukim.landing-v1', cacheVersion: '1',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: PESUKIM_LANDING_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: PESUKIM_LANDING_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'pesukim', 'pesukim.synthesis', 'Synthesis',
    'Tight paragraph weaving the four section leaves into a single narrative thread.',
    PESUKIM_SYNTHESIS_SYSTEM_PROMPT, PESUKIM_SYNTHESIS_USER_TEMPLATE, PESUKIM_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: [
        'gemara',
        { enrichment: 'pesukim.tanach-context' },
        { enrichment: 'pesukim.why-here' },
        { enrichment: 'pesukim.mechanism' },
        { enrichment: 'pesukim.landing' },
        { mark: 'rabbi' },
        { mark: 'pesukim' },
      ],
      defHash: 'pesukim.synthesis-v11', cacheVersion: '11',
      // Pro instead of Flash: the synthesis must follow the 3-4 sentence
      // structure and avoid the explicit banned-phrase list. Flash skims
      // multi-rule prompts (the same reason argument-move.qa runs on Pro).
      model: ARGUMENT_PRO_MODEL,
      systemPromptHe: PESUKIM_SYNTHESIS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: PESUKIM_SYNTHESIS_USER_TEMPLATE_HE,
    },
  ),
  // Mirror of argument-move.suggested-questions / argument-move.qa: powers the
  // QAPanel "Questions" expander attached to each pasuk card.
  makeEnrichment(
    'pesukim', 'pesukim.suggested-questions', 'Suggested questions',
    'Curated follow-up questions the synthesis doesn\'t answer. Powers the Questions panel on each pasuk card.',
    PESUKIM_SUGGESTED_QUESTIONS_SYSTEM_PROMPT, PESUKIM_SUGGESTED_QUESTIONS_USER_TEMPLATE, PESUKIM_SUGGESTED_QUESTIONS_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: [
        'gemara',
        { mark: 'pesukim' },
        { enrichment: 'pesukim.synthesis' },
      ],
      defHash: 'pesukim.suggested-questions-v3', cacheVersion: '3',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: PESUKIM_SUGGESTED_QUESTIONS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: PESUKIM_SUGGESTED_QUESTIONS_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'pesukim', 'pesukim.qa', 'Q&A',
    'Answer one learner-supplied question about THIS pasuk citation. Cache keyed per (verse, normalized question).',
    PESUKIM_QA_SYSTEM_PROMPT, PESUKIM_QA_USER_TEMPLATE, PESUKIM_QA_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: [
        'gemara',
        'commentaries',
        { enrichment: 'pesukim.tanach-context' },
        { enrichment: 'pesukim.why-here' },
        { enrichment: 'pesukim.mechanism' },
        { enrichment: 'pesukim.synthesis' },
        { mark: 'pesukim' },
      ],
      defHash: 'pesukim.qa-v3', cacheVersion: '3',
      model: ARGUMENT_PRO_MODEL,
      systemPromptHe: PESUKIM_QA_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: PESUKIM_QA_USER_TEMPLATE_HE,
    },
  ),
);

// ---------------------------------------------------------------------------
// Aggadata enrichments — operate on a single aggadic story instance from the
// `aggadata` mark. The anchor identifies WHERE the story sits on the daf; the
// enrichments answer WHO the actors are (background), WHAT it means in this
// sugya (interpretation), and WHERE the same story or motif appears elsewhere
// (parallels). The synthesis weaves them. Q&A mirrors pesukim's pattern.
// ---------------------------------------------------------------------------

const AGGADATA_LEAF_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

Aggadic story identified on this daf:
{{mark_input}}

Hebrew/Aramaic source for the daf:
{{gemara_he}}

English translation:
{{gemara_en}}

Produce the requested output per the schema.`;

const AGGADATA_BACKGROUND_SYSTEM_PROMPT = `You are a scholar of Talmud and rabbinic history. Given ONE aggadic story (title, Hebrew label, summary, opening Hebrew excerpt, theme), write a substantive background paragraph that orients the reader to the historical, geographical, and cultural setting of the story — independent of where it happens to be cited on this daf.

Output STRICT JSON only:

{
  "background": "3-5 sentences of plain orientation. Cover, in this order: (1) WHO the named actors are — their generation (תנא, אמורא, generation number when known), their primary teachers/study circle, what they are best known for elsewhere; (2) WHEN and WHERE the story is set — Bavel vs. Eretz Yisrael, which בית מדרש or town, the historical period; (3) the cultural or material BACKGROUND a reader of that time would have known but a modern reader doesn't (Roman pressure, agricultural cycle, structure of the בית מדרש, halachic dispute the story sits inside, etc.); (4) optional: one factual note that often matters when the story is cited (e.g. 'one of several עליות אמוראים from Bavel to Eretz Yisrael in the third generation'). NO theology, NO derush, NO 'this teaches us'. Plain peshat orientation."
}

Rules:
- 3-5 sentences. Substantive — leave a learner oriented, not just informed of the headline.
- Daf-agnostic. Talk about the actors and setting; do NOT explain why the gemara cites the story here. That's the interpretation card's job.
- Name actors by their canonical name (Rabbi Zeira, Rabbi Ami, Rabbi Yochanan) — never invent identifications.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "profoundly", "lens", "captures", "embodies".

${HEBREW_GLOSS_STYLE}`;

const AGGADATA_BACKGROUND_OUTPUT_SCHEMA = {
  name: 'aggadata_background',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['background'],
    properties: { background: { type: 'string' } },
  },
};

const AGGADATA_INTERPRETATION_SYSTEM_PROMPT = `You are a Talmud scholar reading an aggadic story in its sugya. Given ONE story on a daf (title, Hebrew label, summary, opening Hebrew excerpt, theme) plus the daf's Hebrew/Aramaic source and available rishonim, explain what the story DOES in this sugya — why the gemara tells it at this point, what tension or maxim it surfaces, and how the classical commentators read it.

Output STRICT JSON only:

{
  "interpretation": "3-5 sentences. Order: (a) the LOCAL FUNCTION of the story in this sugya — what halachic or thematic question is on the table, why an aggadic vignette serves the argument here (proof, illustration, mussar punctuation, biographical aside, polemical contrast); (b) the central tension or maxim the story surfaces, quoted briefly from the Hebrew when load-bearing (3-6 words); (c) Rashi's or Tosafot's or another rishon's reading when they comment and it sharpens the point — one short clause, never an enumeration; (d) optional: one note on what the story is NOT doing (e.g. 'not a halachic ruling — only mussar') when readers commonly over-read it."
}

Rules:
- 3-5 sentences. Daf-local — about THIS story HERE.
- Ground every claim in the gemara text or in a rishon you can actually quote. Don't invent.
- Quote short Hebrew (3-6 words, in parens) when the precise wording carries the interpretation.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "profoundly", "lens", "captures", "embodies".

${HEBREW_GLOSS_STYLE}`;

const AGGADATA_INTERPRETATION_OUTPUT_SCHEMA = {
  name: 'aggadata_interpretation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['interpretation'],
    properties: { interpretation: { type: 'string' } },
  },
};

const AGGADATA_PARALLELS_SYSTEM_PROMPT = `You are a scholar of rabbinic literature. Given ONE aggadic story (title, Hebrew label, summary), identify other places in classical Jewish literature where the SAME story, the same actors in a similar incident, or the same motif appears — Bavli, Yerushalmi, Midrash, Tanach analogues. Daf-agnostic. Often empty.

Output STRICT JSON only:

{
  "parallels": [
    {
      "ref": "Sefaria-style canonical reference of the parallel source — e.g. 'Yerushalmi Berakhot 2:3', 'Bereishit Rabbah 78:5', 'Tehillim 23:4', 'Chullin 7b'. Use traditional Hebrew names for Tanach books.",
      "kind": "'same-story' | 'same-actors' | 'same-motif' | 'tanach-source'",
      "note": "ONE sentence explaining the parallel — what's the same, what shifts. Plain English."
    }
  ],
  "prose": "Optional ONE-sentence framing if the parallels reveal a pattern (e.g. 'the עלייה-to-Eretz-Yisrael astonishment motif recurs throughout the third generation'). Empty string when there is no pattern to surface."
}

Rules:
- 0-4 parallels. Most stories have 0 — return an empty array when there's no real parallel. Do NOT invent.
- 'same-story' means the same narrative incident with the same actors. 'same-actors' means the same rabbis in a similar (but distinct) incident. 'same-motif' means a different story with the same structural beats. 'tanach-source' means a verse the aggadah is drawing on directly.
- ref MUST be a citable reference. If you can't supply a real ref, omit the entry. Never fabricate.
- prose is OPTIONAL — empty string when the parallels speak for themselves.
- NO puff. NO 'this teaches us'.

${HEBREW_GLOSS_STYLE}`;

const AGGADATA_PARALLELS_OUTPUT_SCHEMA = {
  name: 'aggadata_parallels',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['parallels', 'prose'],
    properties: {
      parallels: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'kind', 'note'],
          properties: {
            ref: { type: 'string' },
            kind: { type: 'string', enum: ['same-story', 'same-actors', 'same-motif', 'tanach-source'] },
            note: { type: 'string' },
          },
        },
      },
      prose: { type: 'string' },
    },
  },
};

const AGGADATA_SYNTHESIS_SYSTEM_PROMPT = `You are a Talmud scholar reading an aggadic story in its sugya. Given ONE story plus the background, interpretation, and parallels enrichments, compose a tight paragraph that orients the user — who and where, what the story does HERE, where else it lives — in the voice of a chavruta walking the reader through the page.

Output STRICT JSON only:

{
  "synthesis": "ONE paragraph, 4-5 sentences. Order: (a) ONE short orienting sentence naming the actors and the moment ('Rabbi Zeira, newly arrived in Eretz Yisrael, encounters Rabbi Ami in the בית מדרש'); (b) the LOCAL FUNCTION — what halachic or thematic question is on the table, why this vignette serves the sugya; (c) the central tension or maxim the story surfaces, quoted briefly from the Hebrew when load-bearing (3-6 words); (d) ONE clause on parallels or rishon-reading when it sharpens the point — drop when it would dilute; (e) optional: one note on what the story is NOT doing when readers commonly over-read it. Hard ceiling: 5 sentences."
}

HARD RULES:
- 4-5 sentences. Hard ceiling — do NOT pad.
- About THIS story only. Don't summarize the rest of the daf.
- Sentence (a) names actors and moment — a frame, NOT a restatement of the Background card (the user already sees that). Aim for ~20 words.
- The synthesis's job is the NARRATIVE THREAD the structured cards cannot give — actors + local function + tension + parallel/rishon — woven into a paragraph.
- Ground every claim in the background / interpretation / parallels inputs. Don't invent.
- Quote short Hebrew (3-6 words, in parens) when the precise wording carries the meaning.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "profoundly", "lens", "captures", "embodies".
- NO academic Talmud-scholar register: write "transmitter" not "tradent", "interpret" not "exegete".

HEBREW GLOSS — SYNTHESIS-LOCAL OVERRIDE OF THE BASE RULES BELOW:
- On the FIRST occurrence of a Hebrew term in this paragraph, attach the English gloss per the base style.
- On EVERY SUBSEQUENT occurrence in the SAME paragraph, use bare Hebrew script with NO gloss. Do NOT re-translate the same term twice.

${HEBREW_GLOSS_STYLE}`;

const AGGADATA_SYNTHESIS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS aggadic story:
{{mark_input}}

Background (who the actors are, where/when the story is set):
{{depends.aggadata.background}}

Interpretation (what the story does in this sugya):
{{depends.aggadata.interpretation}}

Parallels (other places the same story / motif lives):
{{depends.aggadata.parallels}}

Hebrew/Aramaic source for the daf:
{{gemara_he}}

Rabbis identified on the daf:
{{anchors.rabbi}}

Compose ONE tight paragraph per the schema.`;

const AGGADATA_SYNTHESIS_OUTPUT_SCHEMA = {
  name: 'aggadata_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['synthesis'],
    properties: { synthesis: { type: 'string' } },
  },
};

const AGGADATA_SUGGESTED_QUESTIONS_SYSTEM_PROMPT = `You are a chavruta studying gemara with an aggadic story. Given ONE aggadah cited on a daf plus the synthesis paragraph, produce a SHORT list of follow-up questions a learner is likely to want answered AFTER reading the synthesis. The synthesis says WHAT the story does; these questions should target WHY, the historical mechanism, and the surrounding context that the synthesis didn't fit.

Output STRICT JSON only:

{
  "questions": [
    {
      "q": "The question, phrased the way a learner would ask it. 8-18 words. End with a question mark.",
      "why_useful": "Half-sentence hint on what answering this question unlocks."
    }
  ]
}

Rules:
- Generate exactly 4-5 questions, ordered by general usefulness (most-illuminating first).
- Each question must be specific to THIS story — never generic ('who said it?', 'what happened?'). If you can't tell which story is the subject from the question alone, it's too generic.
- Aim at the MECHANISM: why does the sugya need an aggadic vignette here, what historical realia would clarify the story, what unstated cultural premise is the punchline relying on, how do Rashi or Maharsha read the climax, where does the same motif appear elsewhere.
- One question per concrete sub-issue. Don't duplicate.
- Plain English. NO puff.
- Hebrew SCRIPT (not transliteration) in parens for technical terms — '(אגדה)' not '(aggadah)', '(בית מדרש)' not '(beit midrash)'. English first, Hebrew in parens.

${HEBREW_GLOSS_STYLE}`;

const AGGADATA_SUGGESTED_QUESTIONS_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS aggadic story:
{{mark_input}}

All aggadot on this daf (for context — DO NOT generate questions about other stories):
{{anchors.aggadata}}

Hebrew/Aramaic source for the daf:
{{gemara_he}}

Existing synthesis (so you can target what the synthesis SKIPS):
{{depends.aggadata.synthesis}}

Generate the suggested-questions list per the schema.`;

const AGGADATA_SUGGESTED_QUESTIONS_OUTPUT_SCHEMA = {
  name: 'aggadata_suggested_questions',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['q', 'why_useful'],
          properties: {
            q: { type: 'string' },
            why_useful: { type: 'string' },
          },
        },
      },
    },
  },
};

const AGGADATA_QA_SYSTEM_PROMPT = `You are a Talmud chavruta answering a learner's specific question about ONE aggadic story on the daf. The learner has already read the synthesis paragraph; they want depth, not a restatement. Assume the learner is intelligent but does NOT already know how rabbinic-historical context works — so treat the answer as teaching, not just describing.

Output STRICT JSON only:

{
  "answer": "A focused paragraph, 4-7 sentences, that directly answers the learner's question.",
  "confidence": "high | medium | low"
}

Core stance:
- Lead with a one-sentence direct answer to the question as the learner asked it.
- Then back it up with the specific historical, narrative, or exegetical mechanics: who the actors are, what the cultural premise is, what halachic or thematic question the story is serving, what word or phrase carries the punchline.
- Quote short Hebrew (3-6 words, in parens) when the precise wording is load-bearing.
- Cite Rashi or Maharsha or a parallel source in ONE clause if they actually sharpen the answer; never enumerate commentaries.

The "explain the category" rule:
When the learner's question turns on a TYPE or CATEGORY of rabbinic move — what an אגדה IS vs. a הלכה, what a מעשה functions as in argument, what מוסר framing does, why the gemara puts a biographical anecdote inside a halachic sugya — you MUST spend a sentence explaining what that category IS and how it carries argumentative weight, in plain English, BEFORE applying it to THIS story.

Hard rules:
- 4-7 sentences. Hard ceiling — do NOT pad past 7.
- Answer the LEARNER'S question, not whatever question you'd rather answer. If the question doesn't make sense for this story, say so plainly and set confidence='low'.
- If the available sources (story, synthesis, background, interpretation, parallels, gemara, commentaries) don't contain enough to ground a real answer, give your best partial read and set confidence='low'.
- Ground every claim in the story's actual content or the cited commentary/parallel. Don't invent positions.
- Hebrew script (not transliteration) in parens for technical terms — but always after introducing the concept in English.
- NO puff. Forbidden: "this teaches us", "we see that", "highlights", "underscores", "deeply", "intricate", "profound", "lens", "captures", "embodies", "anchors".
- NO scholarly jargon: write "transmitter" not "tradent", "interpret" not "exegete".

${HEBREW_GLOSS_STYLE}`;

const AGGADATA_QA_USER_TEMPLATE = `Tractate: {{tractate}}, page {{page}}.

THIS aggadic story:
{{mark_input}}

The learner's question (answer THIS specifically):
{{user_question}}

Existing synthesis (the learner has already read this — go deeper, don't restate):
{{depends.aggadata.synthesis}}

Background for the story:
{{depends.aggadata.background}}

Interpretation in this sugya:
{{depends.aggadata.interpretation}}

Parallels in other sources:
{{depends.aggadata.parallels}}

Hebrew/Aramaic source for the daf:
{{gemara_he}}

Rashi + Tosafot + other rishonim available for the daf:
{{commentaries}}

Answer the learner's question per the schema.`;

const AGGADATA_QA_OUTPUT_SCHEMA = {
  name: 'aggadata_qa',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'confidence'],
    properties: {
      answer: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
  },
};

// ---------------- Hebrew-output parallels (aggadata) ----------------

const AGGADATA_LEAF_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

סיפור אגדי שזוהה בדף זה:
{{mark_input}}

מקור עברי/ארמי לדף:
{{gemara_he}}

תרגום אנגלי:
{{gemara_en}}

הפק את הפלט המבוקש לפי הסכימה.`;

const AGGADATA_BACKGROUND_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בש"ס ובהיסטוריה של חז"ל. בהינתן סיפור אגדי אחד (כותרת, תווית עברית, תקציר, ציטוט עברי פותח, נושא), כתוב פסקת רקע מהותית המכוונת את הקורא להקשר ההיסטורי, הגיאוגרפי והתרבותי של הסיפור — ללא תלות במקום שבו הוא מצוטט בדף הזה.

החזר JSON תקין בלבד:

{
  "background": "3-5 משפטים של כיוון פשוט. כסה, בסדר זה: (1) מי הדמויות הנקובות — דורן (תנא, אמורא, מספר דור כשידוע), רבותיהם/חבורת לימודם, ובמה הם ידועים במקומות אחרים; (2) מתי והיכן הסיפור מתרחש — בבל מול ארץ ישראל, איזה בית מדרש או עיר, התקופה ההיסטורית; (3) הרקע התרבותי או החומרי שקורא בן הזמן ההוא היה מכיר אך קורא בן-ימינו אינו מכיר (לחץ רומי, מחזור חקלאי, מבנה בית המדרש, מחלוקת הלכתית שהסיפור יושב בתוכה); (4) אופציונלי: הערה עובדתית אחת שלעיתים חשובה כשהסיפור מצוטט. ללא תיאולוגיה, ללא דרוש, ללא 'מכאן אנו למדים'. כיוון פשט."
}

כללים:
- 3-5 משפטים. מהותי — השאר את הלומד מכוון, לא רק מיודע בכותרת.
- אינו תלוי-דף. דבר על הדמויות והתפאורה; אל תסביר מדוע הגמרא מצטטת את הסיפור כאן. זו עבודת כרטיס הפרשנות.
- נקוב בדמויות בשמן הקנוני (רבי זירא, רבי אמי, רבי יוחנן) — אל תמציא זיהויים.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "עדשה", "לוכד", "מגלם".

${HEBREW_NATIVE_STYLE}`;

const AGGADATA_INTERPRETATION_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הקורא סיפור אגדי בסוגייתו. בהינתן סיפור אחד בדף (כותרת, תווית עברית, תקציר, ציטוט עברי פותח, נושא) יחד עם מקור הדף העברי/ארמי והראשונים הזמינים, הסבר מה הסיפור עושה בסוגיה הזו — מדוע הגמרא מספרת אותו בנקודה זו, איזה מתח או מימרה הוא מעלה, וכיצד המפרשים הקלאסיים קוראים אותו.

החזר JSON תקין בלבד:

{
  "interpretation": "3-5 משפטים. סדר: (א) התפקיד המקומי של הסיפור בסוגיה — איזו שאלה הלכתית או נושאית על הפרק, מדוע ויניטה אגדית משרתת את הטיעון כאן (ראיה, המחשה, פיסוק מוסרי, הערה ביוגרפית, ניגוד פולמוסי); (ב) המתח המרכזי או המימרה שהסיפור מעלה, מצוטט בקצרה מן העברית כשהוא נושא משקל (3-6 מילים); (ג) קריאת רש"י או תוספות או ראשון אחר כשהם מפרשים והדבר מחדד את הנקודה — פסוקית קצרה אחת, לעולם לא מניין; (ד) אופציונלי: הערה אחת על מה שהסיפור אינו עושה (למשל 'אינו פסק הלכה — מוסר בלבד') כשקוראים נוטים לקרוא בו יתר."
}

כללים:
- 3-5 משפטים. מקומי-לדף — על הסיפור הזה כאן.
- בסס כל טענה בטקסט הגמרא או בראשון שאתה יכול לצטט. אל תמציא.
- צטט עברית קצרה (3-6 מילים, בסוגריים) כשהדיוק נושא את הפרשנות.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "עדשה", "לוכד", "מגלם".

${HEBREW_NATIVE_STYLE}`;

const AGGADATA_PARALLELS_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הבקיא בספרות חז"ל. בהינתן סיפור אגדי אחד (כותרת, תווית עברית, תקציר), זהה מקומות אחרים בספרות היהודית הקלאסית שבהם מופיע אותו סיפור, אותן דמויות באירוע דומה, או אותו מוטיב — בבלי, ירושלמי, מדרש, מקבילות בתנ"ך. אינו תלוי-דף. לעיתים קרובות ריק.

החזר JSON תקין בלבד:

{
  "parallels": [
    {
      "ref": "מראה מקום קנוני בסגנון Sefaria של המקור המקביל — למשל 'Yerushalmi Berakhot 2:3', 'Bereishit Rabbah 78:5', 'תהילים כג:ד', 'Chullin 7b'. השתמש בשמות עבריים מסורתיים לספרי התנ"ך.",
      "kind": "'same-story' | 'same-actors' | 'same-motif' | 'tanach-source'",
      "note": "משפט אחד המסביר את המקבילה — מה זהה, מה משתנה. בעברית."
    }
  ],
  "prose": "מסגור אופציונלי במשפט אחד אם המקבילות חושפות דפוס (למשל 'מוטיב ההשתוממות בעלייה לארץ ישראל חוזר לאורך הדור השלישי'). מחרוזת ריקה כשאין דפוס לחשוף."
}

כללים:
- 0-4 מקבילות. לרוב הסיפורים יש 0 — החזר מערך ריק כשאין מקבילה ממשית. אל תמציא.
- 'same-story' = אותו אירוע נרטיבי עם אותן דמויות. 'same-actors' = אותם חכמים באירוע דומה (אך נבדל). 'same-motif' = סיפור אחר עם אותם פעימות מבניות. 'tanach-source' = פסוק שהאגדה נשענת עליו במישרין.
- ref חייב להיות מראה מקום ניתן לציטוט. אם אינך יכול לספק מראה מקום אמיתי, השמט את הערך. לעולם אל תמציא.
- prose אופציונלי — מחרוזת ריקה כשהמקבילות מדברות בעד עצמן.
- ללא מליצה. ללא 'מכאן אנו למדים'.

${HEBREW_NATIVE_STYLE}`;

const AGGADATA_SYNTHESIS_SYSTEM_PROMPT_HE = `אתה תלמיד חכם הקורא סיפור אגדי בסוגייתו. בהינתן סיפור אחד יחד עם enrichments של הרקע, הפרשנות, והמקבילות, חבר פסקה הדוקה המכוונת את המשתמש — מי והיכן, מה הסיפור עושה כאן, היכן עוד הוא חי — בקול של חברותא המוליך את הקורא לאורך הדף.

החזר JSON תקין בלבד:

{
  "synthesis": "פסקה אחת, 4-5 משפטים. סדר: (א) משפט מכוון קצר אחד הנוקב בדמויות וברגע ('רבי זירא, שזה עתה עלה לארץ ישראל, פוגש את רבי אמי בבית המדרש'); (ב) התפקיד המקומי — איזו שאלה הלכתית או נושאית על הפרק, מדוע הויניטה הזו משרתת את הסוגיה; (ג) המתח המרכזי או המימרה שהסיפור מעלה, מצוטט בקצרה מן העברית כשהוא נושא משקל (3-6 מילים); (ד) פסוקית אחת על מקבילות או קריאת ראשון כשהיא מחדדת את הנקודה — השמט כשתדלל; (ה) אופציונלי: הערה אחת על מה שהסיפור אינו עושה כשקוראים נוטים לקרוא בו יתר. תקרה קשיחה: 5 משפטים."
}

כללים נוקשים:
- 4-5 משפטים. תקרה קשיחה — אל תמלא.
- על הסיפור הזה בלבד. אל תסכם את שאר הדף.
- משפט (א) נוקב בדמויות וברגע — מסגרת, לא חזרה על כרטיס הרקע (המשתמש כבר רואה אותו).
- תפקיד ה-synthesis הוא חוט הסיפור שהכרטיסים המובְנים אינם יכולים לתת — דמויות + תפקיד מקומי + מתח + מקבילה/ראשון — שזורים לפסקה.
- בסס כל טענה בקלט הרקע / הפרשנות / המקבילות. אל תמציא.
- צטט עברית קצרה (3-6 מילים, בסוגריים) כשהדיוק נושא את המשמעות.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "עדשה", "לוכד", "מגלם".

${HEBREW_NATIVE_STYLE}`;

const AGGADATA_SYNTHESIS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

הסיפור האגדי הזה:
{{mark_input}}

רקע (מי הדמויות, היכן/מתי הסיפור מתרחש):
{{depends.aggadata.background}}

פרשנות (מה הסיפור עושה בסוגיה הזו):
{{depends.aggadata.interpretation}}

מקבילות (מקומות אחרים שבהם חי אותו סיפור / מוטיב):
{{depends.aggadata.parallels}}

מקור עברי/ארמי לדף:
{{gemara_he}}

חכמים שזוהו בדף:
{{anchors.rabbi}}

חבר פסקה הדוקה אחת לפי הסכימה.`;

const AGGADATA_SUGGESTED_QUESTIONS_SYSTEM_PROMPT_HE = `אתה חברותא הלומד גמרא עם סיפור אגדי. בהינתן אגדה אחת המצוטטת בדף יחד עם פסקת ה-synthesis, הפק רשימה קצרה של שאלות המשך שלומד סביר ירצה תשובה עליהן לאחר קריאת ה-synthesis. ה-synthesis אומר מה הסיפור עושה; שאלות אלו מכוונות אל מדוע, אל המנגנון ההיסטורי, ואל ההקשר הסובב שה-synthesis לא הכיל.

החזר JSON תקין בלבד:

{
  "questions": [
    {
      "q": "השאלה, מנוסחת כפי שלומד היה שואל אותה. 8-18 מילים. סיים בסימן שאלה.",
      "why_useful": "רמז בחצי משפט על מה שמענה על שאלה זו פותח."
    }
  ]
}

כללים:
- הפק בדיוק 4-5 שאלות, מסודרות לפי תועלת כללית (המאירה ביותר ראשונה).
- כל שאלה חייבת להיות מסוימת לסיפור הזה — לעולם לא כללית ('מי אמר?', 'מה קרה?'). אם אי אפשר לדעת מן השאלה לבדה על איזה סיפור מדובר, היא כללית מדי.
- כוון אל המנגנון: מדוע הסוגיה צריכה ויניטה אגדית כאן, איזו ריאליה היסטורית תבהיר את הסיפור, על איזו הנחה תרבותית סמויה הפואנטה נשענת, כיצד רש"י או מהרש"א קוראים את השיא, היכן אותו מוטיב מופיע במקום אחר.
- שאלה אחת לכל תת-עניין קונקרטי. אל תכפיל.
- ללא מליצה.

${HEBREW_NATIVE_STYLE}`;

const AGGADATA_SUGGESTED_QUESTIONS_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

הסיפור האגדי הזה:
{{mark_input}}

כל האגדות בדף זה (להקשר — אל תפיק שאלות על סיפורים אחרים):
{{anchors.aggadata}}

מקור עברי/ארמי לדף:
{{gemara_he}}

ה-synthesis הקיים (כדי שתוכל לכוון אל מה שה-synthesis מדלג עליו):
{{depends.aggadata.synthesis}}

הפק את רשימת שאלות ההמשך לפי הסכימה.`;

const AGGADATA_QA_SYSTEM_PROMPT_HE = `אתה חברותא בלימוד הש"ס העונה לשאלה מסוימת של לומד על סיפור אגדי אחד בדף. הלומד כבר קרא את פסקת ה-synthesis; הוא רוצה עומק, לא חזרה. הנח שהלומד נבון אך אינו יודע מראש כיצד פועל ההקשר ההיסטורי-רבני — לכן התייחס לתשובה כהוראה, לא רק כתיאור.

החזר JSON תקין בלבד:

{
  "answer": "פסקה ממוקדת, 4-7 משפטים, העונה במישרין לשאלת הלומד.",
  "confidence": "high | medium | low"
}

עמדת יסוד:
- פתח במשפט אחד של תשובה ישירה לשאלה כפי שהלומד שאל.
- ואז בסס אותה במכניקה ההיסטורית, הנרטיבית או הדרשנית המסוימת: מי הדמויות, מהי ההנחה התרבותית, איזו שאלה הלכתית או נושאית הסיפור משרת, איזו מילה או ביטוי נושא את הפואנטה.
- צטט עברית קצרה (3-6 מילים, בסוגריים) כשהדיוק נושא משקל.
- צטט רש"י או מהרש"א או מקור מקביל בפסוקית אחת אם הם באמת מחדדים; לעולם אל תמנה פירושים.

כלל "הסבר את הקטגוריה":
כששאלת הלומד נסבה על סוג או קטגוריה של מהלך רבני — מהי אגדה מול הלכה, מה מעשה מתפקד בטיעון, מה מסגור מוסרי עושה, מדוע הגמרא משבצת אנקדוטה ביוגרפית בתוך סוגיה הלכתית — עליך להקדיש משפט להסבר מהי אותה קטגוריה וכיצד היא נושאת משקל, בעברית פשוטה, לפני יישומה על הסיפור הזה.

כללים נוקשים:
- 4-7 משפטים. תקרה קשיחה — אל תמלא מעבר ל-7.
- ענה לשאלת הלומד, לא לשאלה שהיית מעדיף. אם השאלה אינה הגיונית עבור סיפור זה, אמור זאת בפשטות וקבע confidence='low'.
- אם המקורות הזמינים אינם מכילים די לבסס תשובה ממשית, תן את הקריאה החלקית הטובה ביותר וקבע confidence='low'.
- בסס כל טענה בתוכן הממשי של הסיפור או בפירוש/מקבילה המצוטטים. אל תמציא עמדות.
- ללא מליצה. אסור: "מכאן אנו למדים", "אנו רואים ש", "מבליט", "מדגיש", "עמוק", "מורכב", "עדשה", "לוכד", "מגלם", "מעגן".

${HEBREW_NATIVE_STYLE}`;

const AGGADATA_QA_USER_TEMPLATE_HE = `מסכת: {{tractate}}, דף {{page}}.

הסיפור האגדי הזה:
{{mark_input}}

שאלת הלומד (ענה דווקא עליה):
{{user_question}}

ה-synthesis הקיים (הלומד כבר קרא אותו — העמק, אל תחזור):
{{depends.aggadata.synthesis}}

רקע לסיפור:
{{depends.aggadata.background}}

פרשנות בסוגיה הזו:
{{depends.aggadata.interpretation}}

מקבילות במקורות אחרים:
{{depends.aggadata.parallels}}

מקור עברי/ארמי לדף:
{{gemara_he}}

רש"י + תוספות + ראשונים נוספים הזמינים לדף:
{{commentaries}}

ענה לשאלת הלומד לפי הסכימה.`;

CODE_ENRICHMENTS.push(
  makeEnrichment(
    'aggadata', 'aggadata.background', 'Background',
    'Who the actors are, where/when the story is set, what cultural-historical realia a reader of the time would have known. Daf-agnostic.',
    AGGADATA_BACKGROUND_SYSTEM_PROMPT, AGGADATA_LEAF_USER_TEMPLATE, AGGADATA_BACKGROUND_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'global',
      dependencies: [],
      defHash: 'aggadata.background-v1', cacheVersion: '1',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: AGGADATA_BACKGROUND_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: AGGADATA_LEAF_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'aggadata', 'aggadata.interpretation', 'Interpretation',
    'What the story does in THIS sugya — local function, central tension, classical rishon-reading.',
    AGGADATA_INTERPRETATION_SYSTEM_PROMPT, AGGADATA_LEAF_USER_TEMPLATE, AGGADATA_INTERPRETATION_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: ['gemara', 'commentaries'],
      defHash: 'aggadata.interpretation-v1', cacheVersion: '1',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: AGGADATA_INTERPRETATION_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: AGGADATA_LEAF_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'aggadata', 'aggadata.parallels', 'Parallels',
    'Other places the same story / actors / motif appears — Bavli, Yerushalmi, Midrash, Tanach. Often empty.',
    AGGADATA_PARALLELS_SYSTEM_PROMPT, AGGADATA_LEAF_USER_TEMPLATE, AGGADATA_PARALLELS_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'global',
      dependencies: [],
      defHash: 'aggadata.parallels-v1', cacheVersion: '1',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: AGGADATA_PARALLELS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: AGGADATA_LEAF_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'aggadata', 'aggadata.synthesis', 'Synthesis',
    'Tight paragraph weaving background, local interpretation, and parallels into one read.',
    AGGADATA_SYNTHESIS_SYSTEM_PROMPT, AGGADATA_SYNTHESIS_USER_TEMPLATE, AGGADATA_SYNTHESIS_OUTPUT_SCHEMA,
    {
      mode: 'aggregate', scope: 'local',
      dependencies: [
        'gemara',
        { enrichment: 'aggadata.background' },
        { enrichment: 'aggadata.interpretation' },
        { enrichment: 'aggadata.parallels' },
        { mark: 'rabbi' },
        { mark: 'aggadata' },
      ],
      defHash: 'aggadata.synthesis-v1', cacheVersion: '1',
      model: ARGUMENT_PRO_MODEL,
      systemPromptHe: AGGADATA_SYNTHESIS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: AGGADATA_SYNTHESIS_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'aggadata', 'aggadata.suggested-questions', 'Suggested questions',
    'Curated follow-up questions the synthesis doesn\'t answer. Powers the Questions panel on each aggadah card.',
    AGGADATA_SUGGESTED_QUESTIONS_SYSTEM_PROMPT, AGGADATA_SUGGESTED_QUESTIONS_USER_TEMPLATE, AGGADATA_SUGGESTED_QUESTIONS_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: [
        'gemara',
        { mark: 'aggadata' },
        { enrichment: 'aggadata.synthesis' },
      ],
      defHash: 'aggadata.suggested-questions-v1', cacheVersion: '1',
      model: ARGUMENT_FLASH_MODEL,
      systemPromptHe: AGGADATA_SUGGESTED_QUESTIONS_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: AGGADATA_SUGGESTED_QUESTIONS_USER_TEMPLATE_HE,
    },
  ),
  makeEnrichment(
    'aggadata', 'aggadata.qa', 'Q&A',
    'Answer one learner-supplied question about THIS aggadic story. Cache keyed per (story, normalized question).',
    AGGADATA_QA_SYSTEM_PROMPT, AGGADATA_QA_USER_TEMPLATE, AGGADATA_QA_OUTPUT_SCHEMA,
    {
      mode: 'augment-content', scope: 'local',
      dependencies: [
        'gemara',
        'commentaries',
        { enrichment: 'aggadata.background' },
        { enrichment: 'aggadata.interpretation' },
        { enrichment: 'aggadata.parallels' },
        { enrichment: 'aggadata.synthesis' },
        { mark: 'aggadata' },
      ],
      defHash: 'aggadata.qa-v1', cacheVersion: '1',
      model: ARGUMENT_PRO_MODEL,
      systemPromptHe: AGGADATA_QA_SYSTEM_PROMPT_HE,
      userPromptTemplateHe: AGGADATA_QA_USER_TEMPLATE_HE,
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
