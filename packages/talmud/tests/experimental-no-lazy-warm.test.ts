import { describe, expect, it } from 'vitest';
import {
  DEEP_WARM_PLAN,
  isExperimentalLlmWarm,
  WHOLE_DAF_WARM_ENRICHMENTS,
} from '../src/worker/index';

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

// The deep-warm path (deepWarmDaf, fired for both neighbours of every viewed
// daf via /api/warm-daf) used to enqueue biyun.essay unconditionally — the one
// default flow that paid for an experimental card. The gate now skips
// experimental LLM enrichments on a default warm (only an explicit re-warm
// cascade targets them), so by default ONLY visible producers are generated.
describe('default deep-warm generates only visible (non-experimental) producers', () => {
  // The default neighbour deep-warm passes `only === undefined`, so the gate the
  // loop applies is exactly this predicate. Mirror it here over the static list.
  const defaultWarmed = WHOLE_DAF_WARM_ENRICHMENTS.filter(
    (eid) => !isExperimentalLlmWarm({ enrichment_id: eid }),
  );

  it('the whole-daf warm list still carries biyun.essay (for explicit re-warm)', () => {
    expect(WHOLE_DAF_WARM_ENRICHMENTS).toContain('biyun.essay');
  });

  it('a default deep-warm skips biyun.essay (experimental)', () => {
    expect(defaultWarmed).not.toContain('biyun.essay');
  });

  it('a default deep-warm still warms the visible whole-daf chips', () => {
    expect(defaultWarmed).toEqual([
      'argument-overview.flow',
      'argument-overview.synthesis',
      'tidbit.essay',
    ]);
  });

  it('no per-section deep-warm enrichment is experimental', () => {
    for (const eids of Object.values(DEEP_WARM_PLAN)) {
      for (const eid of eids) {
        expect(isExperimentalLlmWarm({ enrichment_id: eid })).toBe(false);
      }
    }
  });
});
