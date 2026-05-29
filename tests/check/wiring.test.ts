/**
 * Wiring guard for A2 increment 2 — the runners (runMarkOnce / runEnrichmentOnce
 * in src/worker/index.ts) drive post-LLM processing off each definition's
 * declarative `checks: []` field instead of a hardcoded `if (def.id === …)`
 * chain. These tests pin two invariants that wiring depends on:
 *
 *   1. The canon marks/enrichments declare the checks the old if-chains applied,
 *      and every declared id exists in the CHECKS registry (a typo'd or dropped
 *      check would silently stop re-anchoring / linting in production).
 *   2. `checks` is NOT part of any cache key — toggling it must never bust the
 *      LLM cache (a full-shas re-warm is ~$1000).
 */
import { describe, it, expect } from 'vitest';
import { CODE_MARKS, CODE_ENRICHMENTS } from '../../src/worker/code-marks';
import { CHECKS } from '../../src/lib/check/postcheck';
import { keyForMark, keyForEnrichment } from '../../src/worker/cache-keys';

describe('declarative check wiring', () => {
  const markChecks: Record<string, string[]> = {
    argument: ['reanchor-argument', 'anchor-verbatim', 'partition-clean'],
    'argument-move': ['reanchor-argument-move', 'anchor-verbatim', 'partition-clean'],
    pesukim: ['reanchor-pesukim', 'anchor-verbatim'],
    aggadata: ['reanchor-aggadata', 'anchor-verbatim'],
  };
  const enrichmentChecks: Record<string, string[]> = {
    'pesukim.synthesis': ['hebrew-excerpt'],
    'halacha.codification': ['hebrew-gloss'],
    'halacha.practical': ['hebrew-gloss'],
    'halacha.disputes': ['hebrew-gloss'],
    'halacha.synthesis': ['hebrew-gloss'],
    'argument.voices': ['derive-voice-edges', 'edge-integrity'],
    'rabbi.relationships.evidence': ['reanchor-rabbi-evidence'],
    'rabbi.geography.evidence': ['reanchor-rabbi-evidence'],
  };

  it('canon marks declare the expected checks', () => {
    for (const [id, expected] of Object.entries(markChecks)) {
      const def = CODE_MARKS.find((m) => m.id === id);
      expect(def, `mark ${id} present`).toBeTruthy();
      expect(def!.checks ?? [], `mark ${id} checks`).toEqual(expected);
    }
  });

  it('lint-gated enrichments declare the expected checks', () => {
    for (const [id, expected] of Object.entries(enrichmentChecks)) {
      const def = CODE_ENRICHMENTS.find((e) => e.id === id);
      expect(def, `enrichment ${id} present`).toBeTruthy();
      expect(def!.checks ?? [], `enrichment ${id} checks`).toEqual(expected);
    }
  });

  it('every declared check id is registered in CHECKS', () => {
    const declared = new Set<string>();
    for (const m of CODE_MARKS) (m.checks ?? []).forEach((c) => declared.add(c));
    for (const e of CODE_ENRICHMENTS) (e.checks ?? []).forEach((c) => declared.add(c));
    for (const id of declared) {
      expect(CHECKS[id], `check '${id}' registered`).toBeTruthy();
    }
  });
});

describe('checks do not affect cache keys', () => {
  it('keyForMark is identical with and without checks', () => {
    const base = { id: 'argument', cache_version: '4' } as Parameters<typeof keyForMark>[0];
    const withChecks = { ...base, checks: ['reanchor-argument'] } as Parameters<typeof keyForMark>[0];
    expect(keyForMark(withChecks, 'Gittin', '67b')).toBe(keyForMark(base, 'Gittin', '67b'));
    expect(keyForMark(withChecks, 'Gittin', '67b', 'he')).toBe(keyForMark(base, 'Gittin', '67b', 'he'));
  });

  it('keyForEnrichment is identical with and without checks', () => {
    const base = { id: 'pesukim.synthesis', cache_version: '11', scope: 'local' } as Parameters<typeof keyForEnrichment>[0];
    const withChecks = { ...base, checks: ['hebrew-excerpt'] } as Parameters<typeof keyForEnrichment>[0];
    const daf = { tractate: 'Gittin', page: '67b' };
    expect(keyForEnrichment(withChecks, 'inst', daf)).toBe(keyForEnrichment(base, 'inst', daf));
  });
});
