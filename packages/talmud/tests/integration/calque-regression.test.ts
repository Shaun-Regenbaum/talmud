import { beforeAll, describe, expect, it } from 'vitest';
import { lintCalques } from '../../src/lib/synthesisLint';
import { BASE_URL, postJson } from './helpers';

/**
 * Regression guard for the Chulin 21a "most flesh" calque incident.
 *
 * Background: argument-move.synthesis on Chulin 21a was emitting
 *   "Eli's broken neck occurred without most flesh"
 * — a word-for-word calque of רוב בשר that reads as nonsense to a learner.
 * HEBREW_GLOSS_STYLE was updated with an explicit anti-calque rule and wired
 * into argument-move.synthesis + neighbors; this test makes a real LLM call
 * to verify the rule survives prompt drift.
 *
 * What this test does (end-to-end against ${BASE_URL}):
 *   1. Runs the argument-move mark extractor on Chulin 21a (cached by the
 *      deployed worker — fast on second run).
 *   2. Finds moves whose summary mentions Eli / neck / רוב בשר. The Eli
 *      sugya is on Chulin 21a so at least one such move must exist; we
 *      assert that.
 *   3. For up to MAX_MOVES_TO_TEST of those moves, fires argument-move.synthesis
 *      with bypass_cache=true so the LLM regenerates from the current prompt.
 *   4. Lints every synthesis with lintCalques. Empty => pass.
 *
 * Cost notes: bypass_cache=true on the synthesis means each move pays one
 * LLM call. Cap is MAX_MOVES_TO_TEST so the bill is bounded. The upstream
 * argument-move extractor is NOT bypass-cached — the first time we run this
 * after a cache_version bump it will pay one extractor call too.
 *
 * Skip behavior: if TALMUD_URL points at localhost and dev isn't running, the
 * helpers will throw a clear network error on the first fetch. To run against
 * production: `TALMUD_URL=https://talmud.shaunregenbaum.com pnpm test:int`.
 */

const TRACTATE = 'Chulin';
const PAGE = '21a';
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 600_000;
const MAX_MOVES_TO_TEST = 2;

interface RunOkResponse {
  status: 'ok';
  result: { parsed: unknown };
}
interface RunPendingResponse {
  status: 'pending';
  runId: string;
}
interface RunErrorResponse {
  status: 'error';
  error: string;
}
type RunResponse = RunOkResponse | RunPendingResponse | RunErrorResponse;

async function pollJob(runId: string): Promise<unknown> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${BASE_URL}/api/run-status/${encodeURIComponent(runId)}`);
    const j = (await res.json()) as RunResponse;
    if (j.status === 'ok') return j.result.parsed;
    if (j.status === 'error') throw new Error(`run failed: ${j.error}`);
  }
  throw new Error(`job ${runId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

async function runMark(markId: string, bypassCache = false): Promise<unknown> {
  const j = await postJson<RunResponse>('/api/run', {
    mark_id: markId,
    tractate: TRACTATE,
    page: PAGE,
    bypass_cache: bypassCache,
  });
  if (j.status === 'ok') return j.result.parsed;
  if (j.status === 'error') throw new Error(`mark run failed: ${j.error}`);
  return pollJob(j.runId);
}

async function runEnrichment(
  enrichmentId: string,
  markInput: unknown,
  bypassCache = false,
): Promise<unknown> {
  const j = await postJson<RunResponse>('/api/run', {
    enrichment_id: enrichmentId,
    tractate: TRACTATE,
    page: PAGE,
    mark_input: markInput,
    bypass_cache: bypassCache,
  });
  if (j.status === 'ok') return j.result.parsed;
  if (j.status === 'error') throw new Error(`enrichment run failed: ${j.error}`);
  return pollJob(j.runId);
}

// The move's `fields` shape is determined by ARGUMENT_MOVE_OUTPUT_SCHEMA in
// src/worker/code-marks.ts. Only the bits we need to find + identify Eli moves.
interface MoveFields {
  id: string;
  summary: string;
  voice: string;
  rabbiNames: string[];
  excerpt: string;
}
interface MoveInstance {
  startSegIdx: number;
  endSegIdx: number;
  fields: MoveFields;
}
interface MarkOutput {
  instances?: MoveInstance[];
}

describe(`integration: argument-move.synthesis calque regression on Chulin 21a (against ${BASE_URL})`, () => {
  let eliMoves: MoveInstance[] = [];

  beforeAll(async () => {
    const out = (await runMark('argument-move')) as MarkOutput;
    expect(
      out?.instances?.length ?? 0,
      'expected argument-move instances on Chulin 21a',
    ).toBeGreaterThan(0);
    // Forgiving keyword match — the LLM's English summary is non-deterministic,
    // so we cast a wide net for anything that smells like the Eli sugya. The
    // Hebrew excerpt is the most reliable signal (מפרקת, רוב בשר are stable
    // tokens on the daf).
    eliMoves = (out.instances ?? []).filter((m) => {
      const en = (m.fields.summary ?? '').toLowerCase();
      const he = m.fields.excerpt ?? '';
      return (
        /\beli\b|neck|spine|broken|flesh|elderly|aged/.test(en) || /מפרקת|רוב בשר|זקנה|עלי/.test(he)
      );
    });
  }, POLL_TIMEOUT_MS);

  it('finds at least one argument-move related to the Eli / רוב בשר sugya', () => {
    expect(eliMoves.length, 'no Eli-related moves found on Chulin 21a').toBeGreaterThan(0);
  });

  it(
    'argument-move.synthesis output for those moves contains no calque phrases',
    async () => {
      const failures: string[] = [];
      const sampled = eliMoves.slice(0, MAX_MOVES_TO_TEST);
      for (const move of sampled) {
        const out = (await runEnrichment(
          'argument-move.synthesis',
          move,
          /* bypassCache */ true,
        )) as { synthesis?: string } | null;
        const synth = out?.synthesis ?? '';
        expect(synth.length, `move ${move.fields.id} returned empty synthesis`).toBeGreaterThan(20);
        const issues = lintCalques(synth);
        if (issues.length > 0) {
          const details = issues.map((i) => `"${i.match}" → ${i.hebrew} (${i.meaning})`).join('; ');
          failures.push(`move ${move.fields.id}: ${details}\n  full synthesis: ${synth}`);
        }
      }
      expect(
        failures,
        `calques detected in fresh argument-move.synthesis output:\n${failures.join('\n\n')}`,
      ).toEqual([]);
    },
    POLL_TIMEOUT_MS,
  );
});
