/**
 * @fileoverview Worker side of the AI segment-matcher: wires the pure prompt
 * builders/parsers to the model transports. Given a daf's segments and a batch
 * of whole-daf context items, returns SegMatches placing each on the segment(s)
 * it discusses. On-demand (token cost) — the deterministic matchers in
 * collectContext stay free and always-on.
 *
 * Two paths, Jev first:
 *   - Jev (TypeSafe System One, ../lib/context/anchor/jev-match.ts): one
 *     request per chunk of JEV_MATCH_CHUNK_SIZE notes, the daf text sent once
 *     as state, a Choice over the segment ids + a whole-daf Noul per note.
 *     Every question is answered independently, so there is no batch-size
 *     degradation to tune around.
 *   - LLM prompt (../lib/context/anchor/ai-prompt.ts): the fallback when the
 *     TypeSafe key is unset or a Jev request fails. Items are CHUNKED into
 *     small calls because this matcher localizes confidently on small batches
 *     (~0.9 confidence at <=8 items) but, handed ~16+ items, dumps everything
 *     to "whole-daf, ~0 confidence".
 */

import type { SegMatch } from '@corpus/core/context/match';
import { isBudgetPaused } from '@corpus/core/llm/budget';
import { runJev } from '@corpus/core/llm/jev';
import { type LLMEnv, runLLM } from '@corpus/core/llm/llm';
import {
  buildMatchPrompt,
  type MatchInput,
  parseMatchResponse,
} from '../lib/context/anchor/ai-prompt';
import {
  buildMatchJevRequest,
  JEV_MATCH_CHUNK_SIZE,
  matchesFromJevAnswers,
} from '../lib/context/anchor/jev-match';

/** Items per LLM call — kept small to stay in the prompt matcher's accurate range. */
export const MATCH_CHUNK_SIZE = 8;
/** Overall ceiling on items matched per request, so a pathological caller can't
 *  fan out unbounded model calls. Items beyond this are left unplaced (not
 *  silently mis-placed). */
export const MAX_ITEMS = 160;
/** Concurrent chunk calls — bounds wall-clock without bursting the gateway. */
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

  const useJev = !!env.TYPESAFE_API_KEY;
  const batch = items.slice(0, MAX_ITEMS);
  const size = useJev ? JEV_MATCH_CHUNK_SIZE : MATCH_CHUNK_SIZE;
  const chunks: MatchInput[][] = [];
  for (let i = 0; i < batch.length; i += size) chunks.push(batch.slice(i, i + size));

  // Bounded-concurrency worker pool over the chunks; preserve chunk order in
  // the merged output.
  const results: SegMatch[][] = new Array(chunks.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const idx = next++;
      if (idx >= chunks.length) return;
      results[idx] = useJev
        ? await matchChunkJev(env, segmentsHe, segmentsEn, chunks[idx], daf)
        : await matchChunkLLM(env, segmentsHe, segmentsEn, chunks[idx], daf);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker));
  return results.flat();
}

/** One Jev request for a chunk of notes. On failure (key rejected, outage,
 *  invalid answers) the same chunk goes through the LLM prompt path — split
 *  down to that path's own chunk size — so a Jev problem degrades to exactly
 *  the pre-Jev behavior. A budget pause is not retried on the other path. */
async function matchChunkJev(
  env: LLMEnv,
  segmentsHe: string[],
  segmentsEn: string[],
  batch: MatchInput[],
  daf?: { tractate: string; page: string },
): Promise<SegMatch[]> {
  try {
    const req = buildMatchJevRequest(segmentsHe, segmentsEn, batch);
    const res = await runJev(env, {
      ...req,
      tag: 'context-match',
      attribution: { kind: 'match', ...(daf ? { tractate: daf.tractate, page: daf.page } : {}) },
    });
    return matchesFromJevAnswers(res.answers, batch, segmentsHe.length);
  } catch (err) {
    if (isBudgetPaused(err)) throw err;
    console.warn(
      `[context-match] jev failed, falling back to LLM: ${String((err as Error)?.message ?? err).slice(0, 200)}`,
    );
    const out: SegMatch[] = [];
    for (let i = 0; i < batch.length; i += MATCH_CHUNK_SIZE) {
      out.push(
        ...(await matchChunkLLM(
          env,
          segmentsHe,
          segmentsEn,
          batch.slice(i, i + MATCH_CHUNK_SIZE),
          daf,
        )),
      );
    }
    return out;
  }
}

/** One LLM call for a single small chunk of items. */
async function matchChunkLLM(
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
