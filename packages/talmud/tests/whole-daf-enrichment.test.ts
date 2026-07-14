import { describe, expect, it } from 'vitest';
import { CODE_ENRICHMENTS } from '../src/worker/code-marks';
import { isWholeDafEnrichment } from '../src/worker/index';
import { adaptCodeEnrichment } from '../src/worker/producer-registry';
import type { EnrichmentDefinition } from '../src/worker/studio-schema';

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

  // THE resurfaced-leak regression: the dependency walk loads defs through
  // loadEnrichmentDef, whose KV-FLAT shape (adaptCodeEnrichment) renames
  // target_mark -> mark. isWholeDafEnrichment originally read only target_mark,
  // so every DEP run skipped the collapse and re-cached the whole-daf piece
  // under the parent's instance key (per-rabbi/per-section keys in KV, ~20 paid
  // runs/daf). Both shapes must classify identically, for the whole registry.
  it('classifies the KV-flat shape (mark, not target_mark) identically to the rich shape', () => {
    for (const rich of CODE_ENRICHMENTS) {
      const flat = adaptCodeEnrichment(rich as never);
      if (!flat) continue; // non-llm/computed extractors never reach the runner
      expect(isWholeDafEnrichment(flat as unknown as EnrichmentDefinition), rich.id).toBe(
        isWholeDafEnrichment(rich as never),
      );
    }
  });

  it('flat-shaped daf-background.concepts collapses (the exact leaked producer)', () => {
    const flat = adaptCodeEnrichment(byId('daf-background.concepts') as never);
    expect(flat).toBeTruthy();
    expect((flat as { target_mark?: string }).target_mark).toBeUndefined(); // the trap
    expect(isWholeDafEnrichment(flat as unknown as EnrichmentDefinition)).toBe(true);
  });
});

// The canonical whole-daf instance hash the entire collapse scheme converges
// on. The KV cleanups keep exactly this id; the /api/run route collapses bare
// mark_input to {fields:{}} so its keys land here too. If instanceIdOf's
// derivation ever changes, every guard above silently targets the wrong key —
// this pins it byte-for-byte, alongside the undefined-input hash whose
// divergence caused the bare-run miss.
describe('canonical whole-daf instance id', () => {
  it('instanceIdOf({fields:{}}) is the pinned canonical hash', async () => {
    const { instanceIdOf } = await import('@corpus/core/cache/keys');
    expect(await instanceIdOf({ fields: {} })).toBe('f35cd02cd97b');
    expect(await instanceIdOf(undefined)).not.toBe('f35cd02cd97b');
  });
});
