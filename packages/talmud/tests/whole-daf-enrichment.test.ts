import { describe, expect, it } from 'vitest';
import { CODE_ENRICHMENTS } from '../src/worker/code-marks';
import { isWholeDafEnrichment } from '../src/worker/index';

// runEnrichmentOnce collapses whole-daf enrichments to the single canonical
// {fields:{}} instance for every caller. That is correct ONLY for enrichments
// that genuinely produce one note per daf — so this pins exactly which
// enrichments get collapsed. If a per-instance enrichment ever lands in the
// "yes" set (e.g. someone flips a mark's anchor to 'whole-daf'), or a real
// whole-daf enrichment drops out of it (re-introducing the per-section/per-rabbi
// cache-key leak that fired daf-background.concepts ~22x/daf), this test fails.
describe('isWholeDafEnrichment — which enrichments collapse to {fields:{}}', () => {
  const byId = (id: string) => CODE_ENRICHMENTS.find((e) => e.id === id);

  it('flags exactly the whole-daf enrichments (one note per daf)', () => {
    const whole = CODE_ENRICHMENTS.filter(isWholeDafEnrichment)
      .map((e) => e.id)
      .sort();
    expect(whole).toEqual(
      [
        'argument-overview.flow',
        'argument-overview.synthesis',
        'biyun.essay',
        'daf-background.concepts',
        'daf-background.synthesis',
        'tidbit.essay',
      ].sort(),
    );
  });

  it('flags daf-background.concepts (the leak this fix closes)', () => {
    const def = byId('daf-background.concepts');
    expect(def).toBeTruthy();
    expect(isWholeDafEnrichment(def!)).toBe(true);
  });

  it('does NOT flag the per-section / per-rabbi consumers that pulled it in', () => {
    for (const id of ['argument.synthesis', 'rabbi.synthesis', 'argument.background']) {
      const def = byId(id);
      expect(def, id).toBeTruthy();
      expect(isWholeDafEnrichment(def!), id).toBe(false);
    }
  });

  it('does NOT flag a global-scope per-rabbi enrichment', () => {
    const def = byId('rabbi.bio');
    if (def) expect(isWholeDafEnrichment(def)).toBe(false);
  });
});
