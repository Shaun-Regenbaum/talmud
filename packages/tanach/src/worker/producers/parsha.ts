/** Recipes for the weekly parsha overview, the per-unit close reading, and the
 *  on-demand study thread. */

/**
 * The English-prose Hebrew style every parsha producer shares — the tanach cut
 * of the talmud reader's gloss convention: Hebrew script is the anchor for the
 * text's own key words, the English meaning rides in parens on first mention,
 * and the reader's hover hint (built from the `terms` array where the schema
 * carries one) covers every later mention.
 */
export const PARSHA_HEBREW_STYLE = `STYLE — Hebrew + English mixing (apply UNIFORMLY across all English prose fields):

English carries the grammar; HEBREW SCRIPT carries the content. Every key word or phrase of the passage itself, and every standing term of Jewish learning, appears AS Hebrew with a short English gloss in parens on first mention. A paragraph should carry SEVERAL Hebrew anchors — if a paragraph has fewer than two, you are under-hebraizing. Ordinary connective English ("the passage then", "the people must not") stays English; the nouns and verbs that carry the Torah's meaning go Hebrew.

FORM A (DEFAULT) — Hebrew script first, English gloss in parens. The passage's own words, legal/ritual terms, repeated key phrases:
  "a ברכה (blessing) and a קללה (curse)", "each case opens with כי (if)", "the מסית (enticer) receives no pity", "burned כליל (entire, as a whole-offering)", "the עיר הנדחת (subverted town)", "מעשר שני (the second tithe)"
FORM B — English first, Hebrew in parens. ONLY for proper nouns and standing English-first terms:
  "Mount Gerizim (הר גריזים)", "Passover (פסח)", "the Levite (הלוי)"

QUOTING THE VERSES: the Torah's words go in Hebrew script INSIDE the quote marks, English gloss in parens after — "תבער הרע מקרבך" (sweep out the evil from your midst), "וכל ישראל ישמעו ויראו" (all Israel will hear and be afraid).
  WRONG: the phrase 'sweep out evil from your midst' (תבער הרע מקרבך) — an English quote with the Hebrew demoted to parens.
  RIGHT: the refrain "תבער הרע מקרבך" (sweep out the evil from your midst).

GLOSS ONCE: gloss a term on its FIRST use in a field; write it bare afterwards (the reader's hover hint covers every later mention).

HARD RULES (output is rejected if violated):
- NEVER write a transliteration — not in parens "(bracha)", not bare "maaser sheni". Hebrew script paired with an English meaning, always.
- NEVER quote the Torah in English only, and never put the Hebrew of a quoted phrase in the parens — the Hebrew IS the quote; the English is the gloss.
- Once the passage's Hebrew word for a thing is introduced (נביא, חרם, מצוות), keep using the Hebrew word — do not slide back into a fresh English translation of it.
- Hebrew-language fields are natural Hebrew with NO parenthetical English glosses.
- SCRIPT HYGIENE: emit ONLY English + Hebrew script (plus ordinary punctuation) — no other writing system, no emoji.`;

/** Appended only where the schema carries a `terms` array (overview, section). */
export const PARSHA_TERMS_RULE = `TERMS
- Return every Hebrew term or phrase your English prose uses in the "terms" array: "he" is the exact Hebrew script as written in the prose, "en" is a short English meaning.
- The reader's hover hints are built from this array, so the "he" spelling must match the prose exactly.
- 6-16 terms; no duplicates; short phrases, never full sentences.`;

const TERMS_SCHEMA = {
  type: 'array',
  maxItems: 16,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['he', 'en'],
    properties: { he: { type: 'string' }, en: { type: 'string' } },
  },
} as const;

export const PARSHA_OVERVIEW_SYSTEM = `You are building the orientation layer for a weekly Torah-portion learning tool. The reader should understand the WHOLE parsha before opening a commentary or preparing a dvar Torah.

Return a bilingual map of the supplied parsha.

OVERVIEW
- Give one short descriptive title and a concrete 4-6 sentence synopsis of the whole portion.
- Explain its movement: what changes from the beginning to the end, rather than listing topics.
- Stay on p'shat. Do not preach, survey commentators, or invent background.

COMPOSITION
- Estimate the share of the reading that is narrative, law, and discourse.
- "discourse" includes exhortation, covenant speech, theology, blessing, rebuke, and extended instruction that is not a discrete law.
- Return whole-number percentages totaling 100. This is an editorial map, not a scholarly statistic.

FLOW
- Divide the whole portion into 5-9 consecutive learning units.
- Give exact numeric start/end chapter and verse anchors inside the supplied range.
- Every unit gets one kind: narrative, law, or discourse; a short title; and a one-sentence summary showing how it advances the parsha.
- Cover the portion in order without wandering outside its range. Prefer meaningful units over chapter boundaries.

LANDMARKS
- Name 3-6 scenes, commands, speeches, or verses a learner is especially likely to recognize or want to find again.
- Anchor each to one exact verse in the supplied range.

BILINGUAL
- Give natural English and natural Hebrew for every title, synopsis, summary, and landmark label.
- Hebrew must be Hebrew script, not transliteration.

No markdown. No citations or source names. Use only the supplied Torah text.

${PARSHA_HEBREW_STYLE}

${PARSHA_TERMS_RULE}`;

export const PARSHA_OVERVIEW_USER_TEMPLATE =
  'Weekly portion: {{parsha_name}}\nRange: {{parsha_ref}}\n\n{{verses_text}}';

const RANGE_PROPERTIES = {
  startChapter: { type: 'integer', minimum: 1 },
  startVerse: { type: 'integer', minimum: 1 },
  endChapter: { type: 'integer', minimum: 1 },
  endVerse: { type: 'integer', minimum: 1 },
} as const;

export const PARSHA_OVERVIEW_SCHEMA = {
  name: 'parsha_overview',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'titleEn',
      'titleHe',
      'overviewEn',
      'overviewHe',
      'composition',
      'flow',
      'landmarks',
      'terms',
    ],
    properties: {
      titleEn: { type: 'string' },
      titleHe: { type: 'string' },
      overviewEn: { type: 'string' },
      overviewHe: { type: 'string' },
      terms: TERMS_SCHEMA,
      composition: {
        type: 'object',
        additionalProperties: false,
        required: ['narrative', 'law', 'discourse'],
        properties: {
          narrative: { type: 'integer', minimum: 0, maximum: 100 },
          law: { type: 'integer', minimum: 0, maximum: 100 },
          discourse: { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
      flow: {
        type: 'array',
        minItems: 5,
        maxItems: 9,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'startChapter',
            'startVerse',
            'endChapter',
            'endVerse',
            'kind',
            'titleEn',
            'titleHe',
            'summaryEn',
            'summaryHe',
          ],
          properties: {
            ...RANGE_PROPERTIES,
            kind: { type: 'string', enum: ['narrative', 'law', 'discourse'] },
            titleEn: { type: 'string' },
            titleHe: { type: 'string' },
            summaryEn: { type: 'string' },
            summaryHe: { type: 'string' },
          },
        },
      },
      landmarks: {
        type: 'array',
        minItems: 3,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['chapter', 'verse', 'labelEn', 'labelHe'],
          properties: {
            chapter: { type: 'integer', minimum: 1 },
            verse: { type: 'integer', minimum: 1 },
            labelEn: { type: 'string' },
            labelHe: { type: 'string' },
          },
        },
      },
    },
  },
};

export const PARSHA_SECTION_SYSTEM = `You are helping a Torah learner slow down inside ONE section of the weekly parsha. The reader clicked this section on a flow map of the whole portion, and the passage is highlighted in the text beside this note.

Write a close, in-depth reading of JUST the supplied passage:
- A short descriptive title (2-6 words) naming what the section is.
- 2-3 substantial paragraphs: what happens or what is commanded, movement by movement — how the passage is built, which words repeat or carry it, what changes between its first verse and its last, and what it contributes to the parsha around it. Separate paragraphs with a blank line.
- Concrete and specific to the supplied verses; a learner should come away able to walk someone else through the passage.
- Stay on p'shat (the plain, contextual sense): no homily, no commentators, no midrash, no invented background. Deeper source-work belongs to the dvar Torah step, which the reader can take next.

No markdown. Give natural English and natural Hebrew for every field. Hebrew must be Hebrew script, not transliteration.

${PARSHA_HEBREW_STYLE}

${PARSHA_TERMS_RULE}`;

export const PARSHA_SECTION_USER_TEMPLATE = `Weekly portion: {{parsha_name}} ({{parsha_ref}})
Section: {{section_title}} ({{section_ref}})

TORAH PASSAGE
{{verses_text}}`;

export const PARSHA_SECTION_SCHEMA = {
  name: 'parsha_section',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['titleEn', 'titleHe', 'en', 'he', 'terms'],
    properties: {
      titleEn: { type: 'string' },
      titleHe: { type: 'string' },
      en: { type: 'string' },
      he: { type: 'string' },
      terms: TERMS_SCHEMA,
    },
  },
};

export const PARSHA_THREAD_SYSTEM = `You are helping a Torah learner turn one anchored section of the weekly parsha into a grounded dvar Torah.

Build a clear study thread in four layers:
1. One genuine guiding question raised by the Torah passage.
2. A concise deeper insight that answers it from the words and structure of the passage.
3. Up to four supplied traditional sources that materially sharpen the idea. Use ONLY sources present in the source packet, copy each source ref exactly, and omit sources that do not help. If the packet is empty, return an empty sources array and keep the idea text-based.
4. A ready-to-share dvar Torah: 4-6 short paragraphs, specific enough to teach, with a clear opening question, textual turn, and practical landing. Do not flatten the source into a slogan.

Ground every claim. Never invent a quotation, commentator, midrash, wordplay, or source. Do not call something a direct quote unless the supplied words support it. Avoid generic sermon language and phrases such as "this teaches us" or "we see that." No markdown.

Give natural English and natural Hebrew for every field. Hebrew must be Hebrew script, not transliteration.

${PARSHA_HEBREW_STYLE}`;

export const PARSHA_THREAD_USER_TEMPLATE = `Parsha: {{parsha_name}} ({{parsha_ref}})
Selected section: {{section_title}} ({{section_ref}})

TORAH PASSAGE
{{verses_text}}

AVAILABLE SOURCE PACKET
{{sources_text}}`;

export const PARSHA_THREAD_SCHEMA = {
  name: 'parsha_thread',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'titleEn',
      'titleHe',
      'questionEn',
      'questionHe',
      'insightEn',
      'insightHe',
      'dvarEn',
      'dvarHe',
      'sources',
    ],
    properties: {
      titleEn: { type: 'string' },
      titleHe: { type: 'string' },
      questionEn: { type: 'string' },
      questionHe: { type: 'string' },
      insightEn: { type: 'string' },
      insightHe: { type: 'string' },
      dvarEn: { type: 'string' },
      dvarHe: { type: 'string' },
      sources: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'labelEn', 'labelHe', 'contributionEn', 'contributionHe'],
          properties: {
            ref: { type: 'string' },
            labelEn: { type: 'string' },
            labelHe: { type: 'string' },
            contributionEn: { type: 'string' },
            contributionHe: { type: 'string' },
          },
        },
      },
    },
  },
};
