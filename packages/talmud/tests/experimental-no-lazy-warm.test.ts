import { describe, it, expect } from 'vitest';
import { isExperimentalLlmWarm } from '../src/worker/index';

// The /api/run gate: experimental, LLM-backed cards must never lazy-warm. Only
// an explicit trusted warm (bypass_cache / warm_experimental) enqueues their
// paid Pro-tier job. This test pins WHICH producers the gate catches, so adding
// or promoting an experimental card can't silently start auto-warming it.
describe('isExperimentalLlmWarm — experimental cards do not lazy-warm', () => {
  it('gates the experimental LLM mark (chart)', () => {
    expect(isExperimentalLlmWarm({ mark_id: 'chart' })).toBe(true);
  });

  it('gates an enrichment whose target mark is experimental (biyun.essay)', () => {
    expect(isExperimentalLlmWarm({ enrichment_id: 'biyun.essay' })).toBe(true);
  });

  it('does NOT gate the free computed biyun chip mark (no LLM cost)', () => {
    // The biyun mark is experimental but `computed` (the whole-daf instance),
    // so it is free and must stay reachable — only its paid essay is gated.
    expect(isExperimentalLlmWarm({ mark_id: 'biyun' })).toBe(false);
  });

  it('does NOT gate canonical (non-experimental) producers', () => {
    expect(isExperimentalLlmWarm({ mark_id: 'argument' })).toBe(false);
    expect(isExperimentalLlmWarm({ mark_id: 'rabbi' })).toBe(false);
    expect(isExperimentalLlmWarm({ enrichment_id: 'rabbi.synthesis' })).toBe(false);
    expect(isExperimentalLlmWarm({ enrichment_id: 'argument.synthesis' })).toBe(false);
  });

  it('does NOT gate unknown / empty producers', () => {
    expect(isExperimentalLlmWarm({})).toBe(false);
    expect(isExperimentalLlmWarm({ mark_id: 'does-not-exist' })).toBe(false);
    expect(isExperimentalLlmWarm({ enrichment_id: 'does-not-exist' })).toBe(false);
  });
});
