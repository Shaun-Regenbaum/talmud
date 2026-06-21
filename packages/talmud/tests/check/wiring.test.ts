/**
 * Wiring guard for A2 increment 2 — the runners (runMarkOnce / runEnrichmentOnce
 * in src/worker/index.ts) drive post-LLM processing off each definition's
 * declarative `passes: []` field instead of a hardcoded `if (def.id === …)`
 * chain. These tests pin two invariants that wiring depends on:
 *
 *   1. The canon marks/enrichments declare the passes the old if-chains applied,
 *      and every declared id exists in the PASSES registry (a typo'd or dropped
 *      pass would silently stop re-anchoring / linting in production).
 *   2. `passes` is NOT part of any cache key — toggling it must never bust the
 *      LLM cache (a full-shas re-warm is ~$1000).
 */
import { describe, expect, it } from 'vitest';
import { PASSES } from '../../src/lib/check/passes';
import { keyForEnrichment, keyForMark } from '../../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../../src/worker/code-marks';

describe('declarative pass wiring', () => {
  const markChecks: Record<string, string[]> = {
    argument: ['reanchor-argument', 'anchor-verbatim', 'partition-clean'],
    'argument-move': [
      'reanchor-argument-move',
      'dedupe-instances',
      'anchor-verbatim',
      'partition-clean',
    ],
    pesukim: ['reanchor-pesukim', 'anchor-verbatim'],
    aggadata: ['reanchor-aggadata', 'anchor-verbatim'],
  };
  const enrichmentChecks: Record<string, string[]> = {
    'pesukim.synthesis': ['hebrew-excerpt'],
    'halacha.codification': ['hebrew-gloss'],
    'halacha.practical': ['hebrew-gloss'],
    'halacha.dispute': ['hebrew-gloss'],
    'halacha.synthesis': ['hebrew-gloss'],
    'argument.voices': ['derive-voice-edges', 'edge-integrity'],
    'argument-move.commentaries': ['commentary-verbatim'],
    'rabbi.relationships.evidence': ['reanchor-rabbi-evidence'],
    'rabbi.geography.evidence': ['reanchor-rabbi-evidence'],
  };

  it('canon marks declare the expected passes', () => {
    for (const [id, expected] of Object.entries(markChecks)) {
      const def = CODE_MARKS.find((m) => m.id === id);
      expect(def, `mark ${id} present`).toBeTruthy();
      expect(def!.passes ?? [], `mark ${id} passes`).toEqual(expected);
    }
  });

  it('lint-gated enrichments declare the expected passes', () => {
    for (const [id, expected] of Object.entries(enrichmentChecks)) {
      const def = CODE_ENRICHMENTS.find((e) => e.id === id);
      expect(def, `enrichment ${id} present`).toBeTruthy();
      expect(def!.passes ?? [], `enrichment ${id} passes`).toEqual(expected);
    }
  });

  it('every declared pass id is registered in PASSES', () => {
    const declared = new Set<string>();
    for (const m of CODE_MARKS) for (const c of m.passes ?? []) declared.add(c);
    for (const e of CODE_ENRICHMENTS) for (const c of e.passes ?? []) declared.add(c);
    for (const id of declared) {
      expect(PASSES[id], `pass '${id}' registered`).toBeTruthy();
    }
  });
});

describe('passes do not affect cache keys', () => {
  it('keyForMark is identical with and without passes', () => {
    const base = { id: 'argument', cache_version: '4' } as Parameters<typeof keyForMark>[0];
    const withChecks = { ...base, passes: ['reanchor-argument'] } as Parameters<
      typeof keyForMark
    >[0];
    expect(keyForMark(withChecks, 'Gittin', '67b')).toBe(keyForMark(base, 'Gittin', '67b'));
    expect(keyForMark(withChecks, 'Gittin', '67b', 'he')).toBe(
      keyForMark(base, 'Gittin', '67b', 'he'),
    );
  });

  it('keyForEnrichment is identical with and without passes', () => {
    const base = { id: 'pesukim.synthesis', cache_version: '11', scope: 'local' } as Parameters<
      typeof keyForEnrichment
    >[0];
    const withChecks = { ...base, passes: ['hebrew-excerpt'] } as Parameters<
      typeof keyForEnrichment
    >[0];
    const daf = { tractate: 'Gittin', page: '67b' };
    expect(keyForEnrichment(withChecks, 'inst', daf)).toBe(keyForEnrichment(base, 'inst', daf));
  });
});
