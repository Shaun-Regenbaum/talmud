/**
 * The "perek overview" enrichment — a whole-chapter smart-note.
 *
 * Given a chapter of the Hebrew Bible, an LLM writes a short orienting overview
 * for a reader who just arrived: a descriptive title for the chapter and a few
 * sentences on what it is about — the narrative arc (for narrative books) or
 * the theme and structure (for poetry / law / wisdom) — and where it sits in
 * the book's larger story. Bilingual (English + Hebrew). The reader opens it
 * from a perek-level "Overview" pill, the tanach analogue of the Talmud reader's
 * whole-daf Overview card.
 *
 * Strictly p'shat (plain, contextual sense) — the same discipline the events
 * and note producers keep. Interesting against-the-grain readings drawn from
 * midrash and the commentators belong to the (forthcoming) tidbit pill, not
 * here; this pill is the plain orientation.
 *
 * This module carries the producer's RECIPE (prompts + schema); the run goes
 * through the corpus-agnostic runProducer (producers/defs.ts assembles the
 * Producer, run-ports.ts wires the ports). It is chapter-scoped, so its cache
 * key (overview:v1:{book}:{chapter}) ignores any instance — see run-ports.ts.
 */

export interface PerekOverview {
  /** Short descriptive title for the chapter, e.g. "The Binding of Isaac". */
  titleEn: string;
  titleHe: string;
  /** A 3-5 sentence orienting overview of the chapter. */
  en: string;
  he: string;
}

export const OVERVIEW_SYSTEM = [
  'You write a short orienting overview of a whole chapter of the Hebrew Bible,',
  "on the p'shat (plain, contextual) level — for a reader who just opened it.",
  '',
  'Give the chapter a short descriptive TITLE and a few sentences of OVERVIEW.',
  '',
  'Rules:',
  '- Title: 2 to 6 words naming what the chapter is (a scene, a theme, a law, a',
  '  psalm\'s subject) — "The Binding of Isaac", "The Plague of Hail", "A Psalm',
  '  of Refuge". Not a full sentence.',
  '- Overview: 3 to 5 sentences. For a narrative chapter, the arc of what',
  '  happens and how it moves. For poetry, law, wisdom, or prophecy, the theme,',
  '  the structure, and what the chapter is doing. Orient the reader — say where',
  "  this sits in the book's larger story when that helps.",
  "- Strictly p'shat. No midrash, no homily, no theology, no commentary debates,",
  '  no quoting commentators. Plain and concrete.',
  '- Do not just list the verses or restate them one by one — synthesize.',
  '- Give BOTH English ("titleEn"/"en") and natural, fluent Hebrew',
  '  ("titleHe"/"he"). The Hebrew is real Hebrew, not a transliteration of the',
  '  English.',
].join('\n');

/** Rendered with vars from the 'chapter-verses' source resolver (the same
 *  resolver the events producer uses): {{ref}}, {{max_verse}}, {{verses_text}}. */
export const OVERVIEW_USER_TEMPLATE = 'Chapter: {{ref}} ({{max_verse}} verses)\n\n{{verses_text}}';

export const OVERVIEW_SCHEMA = {
  name: 'perek_overview',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['titleEn', 'titleHe', 'en', 'he'],
    properties: {
      titleEn: { type: 'string' },
      titleHe: { type: 'string' },
      en: { type: 'string' },
      he: { type: 'string' },
    },
  },
};
