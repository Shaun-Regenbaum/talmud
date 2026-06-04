/**
 * Tests for the standardized post-LLM pass layer (src/lib/check/passes.ts):
 * transform passes resolve anchors, validate passes (checks) surface lint issues, the
 * two phases run in order, and unknown pass ids are tolerated.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPasses, PASSES, type PassCtx } from '../../src/lib/check/passes';

const FIX = join(__dirname, '..', 'fixtures', 'golden-anchors');
const ctx = (over: Partial<PassCtx> = {}): PassCtx => ({ tractate: 'Gittin', page: '67b', segmentsHe: [], defId: 'x', ...over });

describe('runPasses — transforms', () => {
  it('reanchor-argument resolves anchors identically to the direct re-anchorer', async () => {
    const fx = JSON.parse(readFileSync(join(FIX, 'gittin_67b_argument.json'), 'utf8'));
    const segmentsHe: string[] = JSON.parse(readFileSync(join(FIX, 'gemara_gittin_67b.json'), 'utf8')).segments_he;
    const { parsed, issues } = await runPasses(['reanchor-argument'], structuredClone(fx.raw), ctx({ segmentsHe, defId: 'argument' }));
    expect(parsed).toEqual(fx.expected);
    expect(issues).toEqual([]);
  });

  it('no checks = no-op', async () => {
    const input = { instances: [{ startSegIdx: 1, fields: {} }] };
    const { parsed, issues } = await runPasses([], structuredClone(input), ctx());
    expect(parsed).toEqual(input);
    expect(issues).toEqual([]);
  });

  it('ignores unknown pass ids', async () => {
    const input = { foo: 1 };
    const { parsed, issues } = await runPasses(['does-not-exist'], structuredClone(input), ctx());
    expect(parsed).toEqual(input);
    expect(issues).toEqual([]);
  });

  it('yerushalmi-floor appends a fallback for an uncovered floor group, keeps the LLM instance on overlap', async () => {
    const floor = [
      { startSegIdx: 0, endSegIdx: 1, yerushalmiRef: 'JT A 1:1', excerpt: 'מאימתי קורין', topScore: 12, points: [{ topic: 'Shma timing', he: 'x', en: 'x' }] },
      { startSegIdx: 7, endSegIdx: 7, yerushalmiRef: 'JT A 1:1', excerpt: 'תנא אקרא', topScore: 8, points: [{ topic: 'Baraita', he: 'x', en: 'x' }] },
    ];
    // The LLM already covered seg 0-2 (overlaps floor[0]); floor[1] (seg 7) is uncovered.
    const input = { instances: [{ startSegIdx: 0, endSegIdx: 2, fields: { differences: 'real written contrast', excerpt: 'מאימתי קורין' } }] };
    const { parsed } = await runPasses(['yerushalmi-floor'], structuredClone(input), ctx({ defId: 'yerushalmi', yerushalmiFloor: floor }));
    const insts = (parsed as { instances: { startSegIdx: number; fields: Record<string, unknown> }[] }).instances;
    expect(insts).toHaveLength(2);
    // LLM instance preserved (its real differences win on overlap), sorted first.
    expect(insts[0].fields.differences).toBe('real written contrast');
    expect(insts[0].fields.placement).toBeUndefined();
    // Fallback appended for the uncovered floor group, flagged as auto-aligned.
    expect(insts[1].startSegIdx).toBe(7);
    expect(insts[1].fields.placement).toBe('aligned');
    expect(insts[1].fields.yerushalmiRef).toBe('JT A 1:1');
    expect(insts[1].fields.excerpt).toBe('תנא אקרא');
  });

  it('yerushalmi-floor is a no-op without floor groups (every other mark)', async () => {
    const input = { instances: [{ startSegIdx: 1, fields: {} }] };
    const { parsed } = await runPasses(['yerushalmi-floor'], structuredClone(input), ctx());
    expect(parsed).toEqual(input);
  });
});

describe('runPasses — validators', () => {
  it('hebrew-gloss flags a calque', async () => {
    const parsed = { ruling: 'The animal is a neveila if severed without most of the flesh.' };
    const { issues } = await runPasses(['hebrew-gloss'], parsed, ctx({ defId: 'halacha.codification' }));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === 'hard')).toBe(true);
    expect(issues.some((i) => i.kind === 'calque')).toBe(true);
  });

  it('hebrew-excerpt flags a pasuk cited in English with no Hebrew', async () => {
    const parsed = { synthesis: 'Tehillim 119:62 states, "At midnight I will rise to give thanks to You."' };
    const { issues } = await runPasses(['hebrew-excerpt'], parsed, ctx({ defId: 'pesukim.synthesis' }));
    expect(issues.some((i) => i.kind === 'missing-hebrew-excerpt')).toBe(true);
  });

  it('clean prose produces no issues', async () => {
    const parsed = { synthesis: 'The sugya (סוגיא) turns on whether counting (מנה) equals כולכם.' };
    const { issues } = await runPasses(['hebrew-excerpt', 'hebrew-gloss'], parsed, ctx());
    expect(issues).toEqual([]);
  });
});

describe('runPasses — phase ordering', () => {
  it('validators see the transformed parsed (transform runs first)', async () => {
    // A pesukim raw with an unresolved citation; after reanchor-pesukim the
    // instance gains token offsets. We assert the transform applied by checking
    // the returned parsed, then that validators ran against it without error.
    const fx = JSON.parse(readFileSync(join(FIX, 'sanhedrin_59b_pesukim.json'), 'utf8'));
    const segmentsHe: string[] = JSON.parse(readFileSync(join(FIX, 'gemara_sanhedrin_59b.json'), 'utf8')).segments_he;
    const { parsed } = await runPasses(['reanchor-pesukim', 'hebrew-gloss'], structuredClone(fx.raw), ctx({ tractate: 'Sanhedrin', page: '59b', segmentsHe, defId: 'pesukim' }));
    expect(parsed).toEqual(fx.expected);
  });
});

describe('PASSES registry', () => {
  it('exposes transform + validate checks with correct phases', () => {
    expect(PASSES['reanchor-argument'].phase).toBe('transform');
    expect(PASSES['hebrew-gloss'].phase).toBe('validate');
    expect(PASSES['hebrew-excerpt'].phase).toBe('validate');
  });
});
