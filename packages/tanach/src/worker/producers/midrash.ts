/**
 * Midrash synthesis — a verse can have dozens of midrashim (Genesis 1:1 has
 * ~140), so dumping them is useless. This distills the midrashic material on a
 * verse into a short thematic overview (what the midrashim draw out, the main
 * directions), bilingual, so the reader gets the gist before the source list.
 *
 * Composes on the midrash fetch (the Midrash-category links for the verse).
 */

import { runLLM, type LLMEnv } from '@corpus/core/llm/llm';
import { costUsd } from '@corpus/core/llm/pricing';

export interface MidrashSynthResult {
  en: string;
  he: string;
  model: string;
  costUsd: number | null;
  inTokens: number;
  outTokens: number;
}

const SYSTEM = [
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
  '- This is aggada — narrative/homiletic. Do not present it as plain p\'shat or',
  '  as halacha.',
  '- Give it in BOTH English ("en") and natural, fluent Hebrew ("he").',
].join('\n');

const SCHEMA = {
  name: 'midrash_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['en', 'he'],
    properties: { en: { type: 'string' }, he: { type: 'string' } },
  },
};

export async function midrashSynthesis(env: LLMEnv, ref: string, verseText: string, midrashText: string): Promise<MidrashSynthResult> {
  const res = await runLLM(env, {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Verse ${ref}: ${verseText}\n\nMidrashim:\n${midrashText}` },
    ],
    max_tokens: 800,
    temperature: 0.35,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    tag: 'tanach:midrash-synthesis',
  });

  let en = '';
  let he = '';
  try {
    const p = JSON.parse(res.content) as { en?: string; he?: string };
    en = String(p.en ?? '').trim();
    he = String(p.he ?? '').trim();
  } catch {
    /* leave empty */
  }

  return {
    en,
    he,
    model: res.model,
    costUsd: costUsd(res.model, res.usage),
    inTokens: res.usage?.prompt_tokens ?? 0,
    outTokens: res.usage?.completion_tokens ?? 0,
  };
}
