/**
 * Commentary synthesis — distills the several classic commentators on a verse
 * into one short, balanced overview ("Rashi reads X; Ramban counters Y; Ibn
 * Ezra stays with the plain sense Z"). Shown only on verses where many comment
 * (the reader gates this by the source index), so it isn't generated per pasuk.
 *
 * Composes on the commentary fetch: its input is the per-verse Rishonim.
 */

import { runLLM, type LLMEnv } from '@corpus/core/llm/llm';
import { costUsd } from '@corpus/core/llm/pricing';

export interface SynthesisResult {
  en: string;
  he: string;
  model: string;
  costUsd: number | null;
  inTokens: number;
  outTokens: number;
}

const SYSTEM = [
  'You summarize how the classic Jewish commentators read a verse of the Hebrew',
  'Bible, for a reader deciding what to dig into.',
  '',
  'You are given the verse and several commentators\' notes. Write a short',
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

const SCHEMA = {
  name: 'commentary_synthesis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['en', 'he'],
    properties: { en: { type: 'string' }, he: { type: 'string' } },
  },
};

export async function synthesize(env: LLMEnv, ref: string, verseText: string, commentatorsText: string): Promise<SynthesisResult> {
  const res = await runLLM(env, {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Verse ${ref}: ${verseText}\n\nCommentators:\n${commentatorsText}` },
    ],
    max_tokens: 800,
    temperature: 0.3,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    tag: 'tanach:synthesis',
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
