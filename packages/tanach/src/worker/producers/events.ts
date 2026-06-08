/**
 * The "events" anchor producer — the first Tanach smart-note.
 *
 * Given a chapter, an LLM identifies its natural narrative units (a scene, a
 * speech, a day of creation, a journey leg, a law) and returns a SHORT plain
 * label for each, pinned to the verse where it begins. The reader renders these
 * as small margin anchors beside the text ("Day One", "The Burning Bush", "The
 * Spies Return"). Plain p'shat only — no interpretation, no midrash.
 *
 * This is a mark in the framework sense: it identifies WHERE things are. The
 * anchor is an exact verse (Sefaria gives us that), so there is no placement
 * risk — only the labelling is the model's job.
 */

import { runLLM, type LLMEnv } from '@corpus/core/llm/llm';
import { costUsd } from '@corpus/core/llm/pricing';

export interface EventSection {
  /** 1-based verse number where this unit begins. */
  verse: number;
  /** Short plain-English label, 1-4 words. */
  label: string;
}

export interface EventsResult {
  sections: EventSection[];
  model: string;
  costUsd: number | null;
  inTokens: number;
  outTokens: number;
}

const SYSTEM = [
  'You divide a chapter of the Hebrew Bible into its natural narrative units and',
  'give each a short, plain English label.',
  '',
  'A unit is where a distinct thing begins: a new scene, a speech, a day of',
  'creation, a leg of a journey, a law, a genealogy, a song. A chapter usually',
  'has between 1 and 8 of them — do NOT label every verse.',
  '',
  'Rules:',
  '- Label = 1 to 4 words, plain and concrete ("Day One", "The Burning Bush",',
  '  "The Spies Return", "Laws of the Sabbath"). No sentences.',
  '- Strictly p\'shat: describe what plainly happens. No interpretation, no',
  '  midrash, no theology, no commentary.',
  '- "verse" is the verse number where the unit begins (the first unit is',
  '  almost always verse 1).',
  '- Return them in order. Use English for the label.',
].join('\n');

const SCHEMA = {
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
          required: ['verse', 'label'],
          properties: {
            verse: { type: 'integer', minimum: 1 },
            label: { type: 'string' },
          },
        },
      },
    },
  },
};

/** Render the chapter's verses as a compact numbered English+Hebrew prompt. */
export function versesForPrompt(verses: { n: number; en: string; he: string }[]): string {
  return verses
    .map((v) => `${v.n}. ${(v.en || '').replace(/<[^>]+>/g, '').trim()}`)
    .join('\n');
}

export async function eventSections(
  env: LLMEnv,
  ref: string,
  verses: { n: number; en: string; he: string }[],
): Promise<EventsResult> {
  const maxVerse = verses.length;
  const res = await runLLM(env, {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Chapter: ${ref} (${maxVerse} verses)\n\n${versesForPrompt(verses)}` },
    ],
    max_tokens: 700,
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    tag: 'tanach:events',
  });

  let sections: EventSection[] = [];
  try {
    const parsed = JSON.parse(res.content) as { sections?: EventSection[] };
    sections = (parsed.sections ?? [])
      .filter((s) => Number.isInteger(s.verse) && s.verse >= 1 && s.verse <= maxVerse && s.label)
      .map((s) => ({ verse: s.verse, label: String(s.label).trim().slice(0, 40) }))
      .sort((a, b) => a.verse - b.verse);
  } catch {
    sections = [];
  }

  const inTokens = res.usage?.prompt_tokens ?? 0;
  const outTokens = res.usage?.completion_tokens ?? 0;
  return {
    sections,
    model: res.model,
    costUsd: costUsd(res.model, res.usage),
    inTokens,
    outTokens,
  };
}
