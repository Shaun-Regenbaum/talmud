/**
 * Worker wiring of the segment matcher's Jev path (src/worker/context-match.ts):
 * chunking by JEV_MATCH_CHUNK_SIZE when the key is present, answers → matches,
 * and the per-chunk fallback to the LLM prompt path when Jev fails. Both
 * transports are mocked; nothing hits the network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runJev = vi.fn();
const runLLM = vi.fn();
vi.mock('@corpus/core/llm/jev', () => ({ runJev: (...a: unknown[]) => runJev(...a) }));
vi.mock('@corpus/core/llm/llm', () => ({ runLLM: (...a: unknown[]) => runLLM(...a) }));

import { JEV_MATCH_CHUNK_SIZE, segId } from '../src/lib/context/anchor/jev-match';
import { aiMatchToSegments, MATCH_CHUNK_SIZE } from '../src/worker/context-match';

const segHe = Array.from({ length: 20 }, (_, i) => `seg ${i}`);
const segEn = segHe.map((s) => `en ${s}`);
const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    key: `k${i}`,
    label: 'Insights',
    title: `t${i}`,
    text: 'x',
  }));
const env = { TYPESAFE_API_KEY: 'k' } as never;

/** Answer every note in the request on segment 3 with p=0.9. */
function jevAnswers(req: { questions: Record<string, { type: string }> }) {
  const answers: Record<string, unknown> = {};
  for (const [id, q] of Object.entries(req.questions)) {
    if (q.type === 'choice') {
      const probs: Record<string, number> = {};
      for (let i = 0; i < segHe.length; i++) probs[segId(i)] = i === 3 ? 0.9 : 0.1 / 19;
      answers[id] = { type: 'choice', choice: 's3', probabilities: probs, confidence: 0.88 };
    } else {
      answers[id] = { type: 'noul', noul: 0.05 };
    }
  }
  return {
    answers,
    model: 'jev-1.13.0',
    usage: { input_tokens: 1, output_tokens: 1 },
    elapsed_ms: 1,
    transport: 'typesafe',
  };
}

beforeEach(() => {
  runJev.mockReset();
  runLLM.mockReset();
  runJev.mockImplementation(async (_env, req) => jevAnswers(req));
  runLLM.mockImplementation(async (_env, opts: { messages: { content: string }[] }) => {
    const keys = [...opts.messages[1].content.matchAll(/key=(k\d+)/g)].map((m) => m[1]);
    return {
      content: JSON.stringify({
        matches: keys.map((key) => ({ key, segStart: 1, segEnd: 1, confidence: 0.9, quote: '' })),
      }),
    };
  });
});

describe('aiMatchToSegments on Jev', () => {
  it('chunks by JEV_MATCH_CHUNK_SIZE and places every item without touching the LLM', async () => {
    const n = 40;
    const out = await aiMatchToSegments(env, segHe, segEn, items(n));
    expect(runJev).toHaveBeenCalledTimes(Math.ceil(n / JEV_MATCH_CHUNK_SIZE));
    expect(runLLM).not.toHaveBeenCalled();
    expect(out).toHaveLength(n);
    expect(new Set(out.map((m) => m.key)).size).toBe(n);
    expect(out.every((m) => m.segs.length === 1 && m.segs[0] === 3 && m.confidence === 0.9)).toBe(
      true,
    );
  });

  it('each Jev request carries at most JEV_MATCH_CHUNK_SIZE notes and the whole daf once', async () => {
    await aiMatchToSegments(env, segHe, segEn, items(37));
    for (const call of runJev.mock.calls) {
      const req = call[1] as { state: { notes: unknown[]; daf_segments: unknown[] } };
      expect(req.state.notes.length).toBeGreaterThan(0);
      expect(req.state.notes.length).toBeLessThanOrEqual(JEV_MATCH_CHUNK_SIZE);
      expect(req.state.daf_segments).toHaveLength(segHe.length);
    }
  });

  it('tags the spend and attributes it to the daf', async () => {
    await aiMatchToSegments(env, segHe, segEn, items(2), { tractate: 'Chullin', page: '76a' });
    const opts = runJev.mock.calls[0][1] as { tag: string; attribution: Record<string, string> };
    expect(opts.tag).toBe('context-match');
    expect(opts.attribution).toEqual({ kind: 'match', tractate: 'Chullin', page: '76a' });
  });

  it('falls back to the LLM prompt path, in its own chunk size, when a Jev request fails', async () => {
    runJev.mockRejectedValueOnce(new Error('Jev HTTP 402: no credits'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await aiMatchToSegments(env, segHe, segEn, items(JEV_MATCH_CHUNK_SIZE));
    expect(runJev).toHaveBeenCalledTimes(1);
    expect(runLLM).toHaveBeenCalledTimes(Math.ceil(JEV_MATCH_CHUNK_SIZE / MATCH_CHUNK_SIZE));
    expect(out).toHaveLength(JEV_MATCH_CHUNK_SIZE);
    expect(out.every((m) => m.segs[0] === 1)).toBe(true); // the LLM mock's placement
    warn.mockRestore();
  });

  it('uses the LLM path directly when no TypeSafe key is set', async () => {
    const out = await aiMatchToSegments({} as never, segHe, segEn, items(10));
    expect(runJev).not.toHaveBeenCalled();
    expect(runLLM).toHaveBeenCalledTimes(Math.ceil(10 / MATCH_CHUNK_SIZE));
    expect(out).toHaveLength(10);
  });
});
