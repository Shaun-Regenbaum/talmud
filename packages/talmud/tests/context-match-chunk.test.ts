/**
 * Regression test for the AI segment-matcher chunking (src/worker/context-match.ts).
 *
 * The matcher used to send up to 40 items in ONE prompt. In practice the LLM
 * localizes well on small batches but, handed ~16+ items, dumps everything to
 * "whole-daf, ~0 confidence" — so dafyomi/Revach content never got anchored in
 * the workbench (which sends all whole-daf items at once). The fix chunks items
 * into small LLM calls and merges. These tests mock runLLM so they assert the
 * chunking contract without hitting the network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture every runLLM call and answer per-chunk: place each item on a segment
// derived from its key (so we can assert every item is covered, across chunks).
const runLLM = vi.fn();
vi.mock('@corpus/core/llm/llm', () => ({ runLLM: (...args: unknown[]) => runLLM(...args) }));

import { aiMatchToSegments, MATCH_CHUNK_SIZE, MAX_ITEMS } from '../src/worker/context-match';

const segHe = Array.from({ length: 20 }, (_, i) => `seg ${i}`);
const segEn = segHe.map((s) => `en ${s}`);
const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    key: `k${i}`,
    label: 'Insights',
    title: `t${i}`,
    text: 'x',
  }));

beforeEach(() => {
  runLLM.mockReset();
  // Echo back a localized match for each item in the chunk's prompt.
  runLLM.mockImplementation(async (_env, opts: { messages: { content: string }[] }) => {
    const user = opts.messages[1].content;
    const keys = [...user.matchAll(/key=(k\d+)/g)].map((m) => m[1]);
    return {
      content: JSON.stringify({
        matches: keys.map((key) => ({ key, segStart: 1, segEnd: 1, confidence: 0.9, quote: '' })),
      }),
    };
  });
});

describe('aiMatchToSegments chunking', () => {
  it('splits a large item set into chunks of MATCH_CHUNK_SIZE', async () => {
    const n = 20;
    const out = await aiMatchToSegments({} as never, segHe, segEn, items(n));
    expect(runLLM).toHaveBeenCalledTimes(Math.ceil(n / MATCH_CHUNK_SIZE)); // 3 calls for 20 @ 8
    // every item is placed (the old single-call path returned 0 for n>=16)
    expect(out).toHaveLength(n);
    expect(new Set(out.map((m) => m.key)).size).toBe(n);
    expect(out.every((m) => m.segs.length === 1 && m.confidence === 0.9)).toBe(true);
  });

  it('each LLM call receives at most MATCH_CHUNK_SIZE items', async () => {
    await aiMatchToSegments({} as never, segHe, segEn, items(19));
    for (const call of runLLM.mock.calls) {
      const user = (call[1] as { messages: { content: string }[] }).messages[1].content;
      const count = [...user.matchAll(/key=k\d+/g)].length;
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(MATCH_CHUNK_SIZE);
    }
  });

  it('a single small batch still makes exactly one call', async () => {
    const out = await aiMatchToSegments({} as never, segHe, segEn, items(5));
    expect(runLLM).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(5);
  });

  it('short-circuits with no LLM call when there are no items or no segments', async () => {
    expect(await aiMatchToSegments({} as never, segHe, segEn, [])).toEqual([]);
    expect(await aiMatchToSegments({} as never, [], [], items(3))).toEqual([]);
    expect(runLLM).not.toHaveBeenCalled();
  });

  it('caps total items at MAX_ITEMS (never fans out unbounded LLM calls)', async () => {
    await aiMatchToSegments({} as never, segHe, segEn, items(MAX_ITEMS + 25));
    expect(runLLM).toHaveBeenCalledTimes(Math.ceil(MAX_ITEMS / MATCH_CHUNK_SIZE));
  });
});
