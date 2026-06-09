/**
 * Word / phrase translation. The reader selects Hebrew in the text (double-click
 * a word, or drag across a phrase) and gets a concise English gloss. Context
 * (the surrounding verse) is passed so a word is translated in the sense it has
 * here. Cached per normalized selection.
 */

import { type LLMEnv, runLLM } from '@corpus/core/llm/llm';
import { costUsd } from '@corpus/core/llm/pricing';

export interface TranslateResult {
  translation: string;
  model: string;
  costUsd: number | null;
  inTokens: number;
  outTokens: number;
}

const SYSTEM = [
  'You translate Biblical Hebrew into concise, plain English.',
  '',
  'You are given a word or short phrase (it may carry niqqud and cantillation)',
  'and, when available, the verse it comes from for context. Return ONLY the',
  'English translation — a word or short phrase, in the sense it carries in this',
  'context. No explanation, no transliteration, no notes.',
].join('\n');

const SCHEMA = {
  name: 'translation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['translation'],
    properties: { translation: { type: 'string' } },
  },
};

export async function translateHebrew(
  env: LLMEnv,
  q: string,
  context: string,
): Promise<TranslateResult> {
  const res = await runLLM(env, {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Hebrew: ${q}${context ? `\n\nFrom this verse: ${context}` : ''}` },
    ],
    max_tokens: 120,
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    tag: 'tanach:translate',
  });

  let translation = '';
  try {
    translation = String(
      (JSON.parse(res.content) as { translation?: string }).translation ?? '',
    ).trim();
  } catch {
    /* leave empty */
  }

  return {
    translation,
    model: res.model,
    costUsd: costUsd(res.model, res.usage),
    inTokens: res.usage?.prompt_tokens ?? 0,
    outTokens: res.usage?.completion_tokens ?? 0,
  };
}
