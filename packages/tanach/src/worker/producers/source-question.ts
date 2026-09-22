/** Separate recipes leave existing thematic summaries and their caches intact. */
export function sourceQuestionSystem(kind: 'Talmud' | 'Midrash'): string {
  return [
    `Explain why the supplied ${kind} sources use this biblical verse.`,
    'Start with the question or problem the source is addressing, then explain how the verse is used to answer it.',
    'Do not assume every citation resolves a difficulty in the wording. It may establish a law, support a teaching, or prescribe a public reading. Say which when the text supports it.',
    'Use only the supplied verse and source texts. Attribute each reading to its exact supplied reference. Never invent a question, quotation, reference, or missing argument.',
    'Distinguish an explicit question from an inferred concern. If the excerpt does not show why the verse is cited, say that the available text does not establish the connection.',
    'Do not turn a thematic connection into proof of an interpretation. Preserve differences between sources, and distinguish homiletic readings from the plain meaning.',
    'Write 2 to 4 short paragraphs, in both plain English (en) and natural Hebrew (he). No markdown headings. Discuss the strongest supported connections rather than listing every citation.',
  ].join('\n');
}
export const SOURCE_QUESTION_USER =
  'Verse {{ref}}: {{verse_text}}\n\nSources (bounded excerpts; text may be incomplete):\n{{question_sources}}';
export const SOURCE_QUESTION_SCHEMA = {
  name: 'source_question',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['en', 'he'],
    properties: { en: { type: 'string' }, he: { type: 'string' } },
  },
};
