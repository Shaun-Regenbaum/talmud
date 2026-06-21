/**
 * The "perek geography" enrichment — names the places a chapter is set in or
 * mentions, so the reader's Geography pill can map them.
 *
 * Strict division of labour (the grounding principle): the LLM only NAMES the
 * places (English canonical spelling + the Hebrew as the text has it). It does
 * NOT supply coordinates — those come deterministically from the bundled
 * OpenBible gazetteer (worker/gazetteer.ts), joined in the route. A wrong
 * coordinate is worse than a missing pin, so a named place the gazetteer can't
 * locate is simply omitted (place-or-omit).
 *
 * This module carries the producer's RECIPE (prompts + schema); the run goes
 * through the corpus-agnostic runProducer (producers/defs.ts + run-ports.ts).
 * Chapter-scoped — key geography:v1:{book}:{chapter}.
 */

export interface PerekPlace {
  /** English canonical name — the gazetteer lookup key. */
  en: string;
  /** Hebrew name as it appears in the text (for the map label). */
  he: string;
  /** Verse number(s) in the chapter where the place is named — so clicking the
   *  map pin can highlight the text it came from. */
  verses: number[];
}

export const GEOGRAPHY_SYSTEM = [
  'You identify the geographic PLACES of a chapter of the Hebrew Bible — the',
  'settlements, regions, mountains, rivers, and lands it is set in or names —',
  'so a reader can see them on a map.',
  '',
  'Rules:',
  '- List only places that are actually NAMED in the chapter, or that are',
  '  unmistakably its setting. Precision over recall: when unsure, leave it out.',
  '- "en" is the place\'s common English biblical name in its CANONICAL form',
  '  (e.g. "Hebron", "Beersheba", "Ur", "Haran", "Bethel", "Egypt", "Shechem").',
  '  Use the standard spelling, not a variant — it is used to look the place up.',
  '- "he" is the Hebrew name AS IT APPEARS in the text (with nikud if present):',
  '  "חֶבְרוֹן", "בְּאֵר שֶׁבַע", "אוּר", "חָרָן", "מִצְרַיִם".',
  '- "verses" is the verse NUMBER(s) in this chapter where the place is named',
  '  (the leading numbers in the supplied text). Usually one; list every verse',
  '  it is named in if more than one.',
  '- Do NOT include people, tribes, or peoples — only physical places.',
  '- Do NOT invent coordinates or places not in the text.',
  '- Return them in the order they first appear.',
].join('\n');

/** Rendered with vars from the 'chapter-verses' source resolver (same as the
 *  events / overview producers): {{ref}}, {{max_verse}}, {{verses_text}}. */
export const GEOGRAPHY_USER_TEMPLATE = 'Chapter: {{ref}} ({{max_verse}} verses)\n\n{{verses_text}}';

export const GEOGRAPHY_SCHEMA = {
  name: 'perek_geography',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['places'],
    properties: {
      places: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['en', 'he', 'verses'],
          properties: {
            en: { type: 'string' },
            he: { type: 'string' },
            verses: { type: 'array', items: { type: 'integer', minimum: 1 } },
          },
        },
      },
    },
  },
};
