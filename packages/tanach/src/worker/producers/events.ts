/**
 * The "events" anchor producer — the first Tanach smart-note.
 *
 * Given a chapter, an LLM identifies its natural narrative units (a scene, a
 * speech, a day of creation, a journey leg, a law) and returns a SHORT label in
 * both English and Hebrew, pinned to the verse where it begins. The reader
 * renders these as small margin anchors beside the text ("Day One" / "יום
 * ראשון", "The Burning Bush" / "הסנה הבוער"). Plain p'shat only — no midrash.
 *
 * This is a mark in the framework sense: it identifies WHERE things are. The
 * anchor is an exact verse (Sefaria gives us that), so there is no placement
 * risk — only the labelling is the model's job.
 *
 * This module carries the producer's RECIPE (prompts + schema); the run itself
 * goes through the corpus-agnostic runProducer (producers/defs.ts assembles
 * the Producer, run-ports.ts wires the ports). Output normalization (the
 * verse-range filter, the 40-char label caps, ordering) lives in the
 * markPostParse hook in run-ports.ts — byte-for-byte the filtering the old
 * eventSections wrapper applied.
 */

export interface EventSection {
  /** 1-based verse number where this unit begins. */
  verse: number;
  /** Short plain English label, 1-4 words. */
  en: string;
  /** Short plain Hebrew label, 1-4 words. */
  he: string;
}

export const EVENTS_SYSTEM = [
  'You divide a chapter of the Hebrew Bible into its natural narrative units and',
  'give each a short label in BOTH English and Hebrew.',
  '',
  'A unit is where a distinct thing begins: a new scene, a speech, a day of',
  'creation, a leg of a journey, a law, a genealogy, a song. A chapter usually',
  'has between 1 and 8 of them — do NOT label every verse.',
  '',
  'Rules:',
  '- "en" and "he" are each 1 to 4 words, plain and concrete ("Day One" / "יום',
  '  ראשון", "The Burning Bush" / "הסנה הבוער"). No sentences.',
  '- The Hebrew label is natural Hebrew, not a transliteration of the English.',
  "- Strictly p'shat: describe what plainly happens. No interpretation, no",
  '  midrash, no theology, no commentary.',
  '- "verse" is the verse number where the unit begins (the first unit is',
  '  almost always verse 1).',
  '- Return them in order.',
].join('\n');

/** Rendered with vars from the 'chapter-verses' source resolver. Byte-equal to
 *  the legacy hand-built user prompt:
 *  `Chapter: ${ref} (${maxVerse} verses)\n\n${versesForPrompt(verses)}`. */
export const EVENTS_USER_TEMPLATE = 'Chapter: {{ref}} ({{max_verse}} verses)\n\n{{verses_text}}';

export const EVENTS_SCHEMA = {
  name: 'event_sections',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['sections'],
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['verse', 'en', 'he'],
          properties: {
            verse: { type: 'integer', minimum: 1 },
            en: { type: 'string' },
            he: { type: 'string' },
          },
        },
      },
    },
  },
};

/** Render the chapter's verses as a compact numbered English prompt. */
export function versesForPrompt(verses: { n: number; en: string; he: string }[]): string {
  return verses.map((v) => `${v.n}. ${(v.en || '').replace(/<[^>]+>/g, '').trim()}`).join('\n');
}
