/**
 * Midrash synthesis — a verse can have dozens of midrashim (Genesis 1:1 has
 * ~140), so dumping them is useless. This distills the midrashic material on a
 * verse into a short thematic overview (what the midrashim draw out, the main
 * directions), bilingual, so the reader gets the gist before the source list.
 *
 * Composes on the midrash fetch (the Midrash-category links for the verse).
 *
 * This module carries the producer's RECIPE (prompts + schema); the run goes
 * through the corpus-agnostic runProducer (producers/defs.ts + run-ports.ts).
 * NOTE the id/key split: the producer id is 'midrash-synthesis' but its legacy
 * key family is `midrash-synth:v1:*` — the key template owns those bytes.
 */

export const MIDRASH_SYNTH_SYSTEM = [
  'You summarize the midrashic material on a verse of the Hebrew Bible for a',
  'reader — what the midrashim draw out of it.',
  '',
  'You are given the verse and excerpts from several midrashim (aggadic /',
  'homiletic traditions). Write a short thematic overview: the main directions',
  'the midrashim take, recurring motifs, notable readings.',
  '',
  'Rules:',
  '- 2 to 4 sentences. Group by theme rather than listing each midrash.',
  '- Only summarize what the given excerpts say; invent nothing.',
  "- This is aggada — narrative/homiletic. Do not present it as plain p'shat or",
  '  as halacha.',
  '- Give it in BOTH English ("en") and natural, fluent Hebrew ("he").',
].join('\n');

/** Rendered with vars from the 'verse-text' + 'midrash-passages' resolvers.
 *  Byte-equal to the legacy hand-built user prompt:
 *  `Verse ${ref}: ${verseText}\n\nMidrashim:\n${midrashText}`. */
export const MIDRASH_SYNTH_USER_TEMPLATE =
  'Verse {{ref}}: {{verse_text}}\n\nMidrashim:\n{{midrash_text}}';

export const MIDRASH_SYNTH_SCHEMA = {
  name: 'midrash_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['en', 'he'],
    properties: { en: { type: 'string' }, he: { type: 'string' } },
  },
};
