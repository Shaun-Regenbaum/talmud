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
 */

import { runLLM, type LLMEnv } from '@corpus/core/llm/llm';
import { costUsd } from '@corpus/core/llm/pricing';

export interface EventSection {
  /** 1-based verse number where this unit begins. */
  verse: number;
  /** Short plain English label, 1-4 words. */
  en: string;
  /** Short plain Hebrew label, 1-4 words. */
  he: string;
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
    max_tokens: 900,
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    tag: 'tanach:events',
  });

  let sections: EventSection[] = [];
  try {
    const parsed = JSON.parse(res.content) as { sections?: EventSection[] };
    sections = (parsed.sections ?? [])
      .filter(
        (s) => Number.isInteger(s.verse) && s.verse >= 1 && s.verse <= maxVerse && (s.en || s.he),
      )
      .map((s) => ({
        verse: s.verse,
        en: String(s.en ?? '').trim().slice(0, 40),
        he: String(s.he ?? '').trim().slice(0, 40),
      }))
      .sort((a, b) => a.verse - b.verse);
  } catch {
    sections = [];
  }

  return {
    sections,
    model: res.model,
    costUsd: costUsd(res.model, res.usage),
    inTokens: res.usage?.prompt_tokens ?? 0,
    outTokens: res.usage?.completion_tokens ?? 0,
  };
}
