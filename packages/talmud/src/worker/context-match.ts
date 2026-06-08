/**
 * @fileoverview Worker side of the AI segment-matcher: wires the pure prompt
 * builder/parser to runLLM. Given a daf's segments and a batch of whole-daf
 * context items, returns SegMatches placing each on the segment(s) it
 * discusses. On-demand (token cost) — the deterministic matchers in
 * collectContext stay free and always-on.
 *
 * Items are CHUNKED across several small LLM calls rather than sent as one big
 * prompt. The matcher localizes confidently on small batches (~0.9 confidence
 * at <=8 items) but degrades badly on large ones — handed ~16+ items it dumps
 * everything to "whole-daf, ~0 confidence" instead of localizing, and a batch
 * full of localized entries + Hebrew quotes can also overrun max_tokens and
 * truncate. Chunking keeps each call in the quality sweet spot; results merge.
 */

import { runLLM, type LLMEnv } from '@corpus/core/llm/llm';
import { buildMatchPrompt, parseMatchResponse, type MatchInput } from '../lib/context/anchor/ai-prompt';
import type { SegMatch } from '@corpus/core/context/match';

/** Items per LLM call — kept small to stay in the matcher's accurate range. */
export const MATCH_CHUNK_SIZE = 8;
/** Overall ceiling on items matched per request, so a pathological caller can't
 *  fan out unbounded LLM calls. Items beyond this are left unplaced (not
 *  silently mis-placed). */
export const MAX_ITEMS = 160;
/** Concurrent chunk calls — bounds wall-clock without bursting the LLM gateway. */
const CHUNK_CONCURRENCY = 4;

export async function aiMatchToSegments(
  env: LLMEnv,
  segmentsHe: string[],
  segmentsEn: string[],
  items: MatchInput[],
  /** Daf this alignment is for — attributes the matcher's spend to a page in
   *  the cost ledger ('source alignment' on daf X). Omitted by callers that
   *  don't have it (spend then lands under kind='match', no daf). */
  daf?: { tractate: string; page: string },
): Promise<SegMatch[]> {
  if (segmentsHe.length === 0 || items.length === 0) return [];

  const batch = items.slice(0, MAX_ITEMS);
  const chunks: MatchInput[][] = [];
  for (let i = 0; i < batch.length; i += MATCH_CHUNK_SIZE) {
    chunks.push(batch.slice(i, i + MATCH_CHUNK_SIZE));
  }

  // Bounded-concurrency worker pool over the chunks; preserve chunk order in
  // the merged output.
  const results: SegMatch[][] = new Array(chunks.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const idx = next++;
      if (idx >= chunks.length) return;
      results[idx] = await matchChunk(env, segmentsHe, segmentsEn, chunks[idx], daf);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker),
  );
  return results.flat();
}

/** One LLM call for a single small chunk of items. */
async function matchChunk(
  env: LLMEnv,
  segmentsHe: string[],
  segmentsEn: string[],
  batch: MatchInput[],
  daf?: { tractate: string; page: string },
): Promise<SegMatch[]> {
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
    attribution: { kind: 'match', ...(daf ? { tractate: daf.tractate, page: daf.page } : {}) },
  });
  const validKeys = new Set(batch.map((b) => b.key));
  return parseMatchResponse(result.content, validKeys, segmentsHe.length);
}
