/**
 * Commentary synthesis — distills the several classic commentators on a verse
 * into one short, balanced overview ("Rashi reads X; Ramban counters Y; Ibn
 * Ezra stays with the plain sense Z"). Shown only on verses where many comment
 * (the reader gates this by the source index), so it isn't generated per pasuk.
 *
 * Composes on the commentary fetch: its input is the per-verse Rishonim.
 *
 * This module carries the producer's RECIPE (prompts + schema); the run goes
 * through the corpus-agnostic runProducer (producers/defs.ts + run-ports.ts).
 */

export const SYNTHESIS_SYSTEM = [
  'You summarize how the classic Jewish commentators read a verse of the Hebrew',
  'Bible, for a reader deciding what to dig into.',
  '',
  "You are given the verse and several commentators' notes. Write a short",
  'overview of the MAIN lines of interpretation: what they broadly agree on, and',
  'where — and how — they differ.',
  '',
  'Rules:',
  '- 2 to 4 sentences. Name the commentators you refer to (Rashi, Ramban, ...).',
  '- Only summarize what the given commentators say; add no interpretation of',
  '  your own and nothing not present in the notes.',
  '- If they mostly agree, say so plainly rather than inventing a dispute.',
  '- Give it in BOTH English ("en") and natural, fluent Hebrew ("he").',
].join('\n');

/** Rendered with vars from the 'verse-text' + 'commentaries' source resolvers.
 *  Byte-equal to the legacy hand-built user prompt:
 *  `Verse ${ref}: ${verseText}\n\nCommentators:\n${commentatorsText}`. */
export const SYNTHESIS_USER_TEMPLATE =
  'Verse {{ref}}: {{verse_text}}\n\nCommentators:\n{{commentators_text}}';

export const SYNTHESIS_SCHEMA = {
  name: 'commentary_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['en', 'he'],
    properties: { en: { type: 'string' }, he: { type: 'string' } },
  },
};
