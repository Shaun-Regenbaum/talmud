/**
 * The "section note" enrichment — the second Tanach smart-note.
 *
 * Composes on the events mark: given a section (a verse range the events
 * producer delimited) it writes a short plain-language p'shat note about what
 * happens there, in both English and Hebrew. Rendered when the reader clicks a
 * margin anchor. Strictly plain sense — no midrash, no homily.
 *
 * This module carries the producer's RECIPE (prompts + schema); the run goes
 * through the corpus-agnostic runProducer (producers/defs.ts + run-ports.ts).
 */

export const NOTE_SYSTEM = [
  'You write a short note explaining what happens in a passage of the Hebrew',
  "Bible, on the p'shat (plain, contextual) level — for a reader who just",
  'arrived at this section.',
  '',
  'Rules:',
  '- 2 to 3 sentences. Plain and concrete: what plainly happens, and what the',
  '  text means in its own context.',
  "- Strictly p'shat. No midrash, no homily, no theology, no commentary debates,",
  '  no quoting commentators.',
  '- Do not just restate the verses — orient and explain plainly.',
  '- Give the note in BOTH English ("en") and natural, fluent Hebrew ("he").',
].join('\n');

/** Rendered with vars from the 'section-verses' source resolver. Byte-equal to
 *  the legacy hand-built user prompt:
 *  `Passage: ${ref}${label ? ` — "${label}"` : ''}\n\n${versesText}`. */
export const NOTE_USER_TEMPLATE = 'Passage: {{passage_header}}\n\n{{verses_text}}';

export const NOTE_SCHEMA = {
  name: 'section_note',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['en', 'he'],
    properties: { en: { type: 'string' }, he: { type: 'string' } },
  },
};
