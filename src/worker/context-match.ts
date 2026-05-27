/**
 * @fileoverview Worker side of the AI segment-matcher: wires the pure prompt
 * builder/parser to runLLM. Given a daf's segments and a batch of whole-daf
 * context items, returns AnchorPromotions placing each on the segment(s) it
 * discusses. On-demand (token cost) — the deterministic matchers in
 * collectContext stay free and always-on.
 */

import { runLLM, type LLMEnv } from './llm';
import { buildMatchPrompt, parseMatchResponse, type MatchInput } from '../lib/context/anchor/ai-prompt';
import type { SegMatch } from '../lib/context/match';

/** Cap items per call so the prompt stays bounded; callers can batch. */
const MAX_ITEMS = 40;

export async function aiMatchToSegments(
  env: LLMEnv,
  segmentsHe: string[],
  segmentsEn: string[],
  items: MatchInput[],
): Promise<SegMatch[]> {
  if (segmentsHe.length === 0 || items.length === 0) return [];
  const batch = items.slice(0, MAX_ITEMS);
  const { system, user } = buildMatchPrompt(segmentsHe, segmentsEn, batch);
  const result = await runLLM(env, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 2000,
    temperature: 0,
    response_format: { type: 'json_object' },
    tag: 'context-match',
  });
  const validKeys = new Set(batch.map((b) => b.key));
  return parseMatchResponse(result.content, validKeys, segmentsHe.length);
}
