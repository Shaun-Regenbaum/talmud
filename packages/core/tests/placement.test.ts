import { describe, expect, it } from 'vitest';
import type { Anchor } from '../src/model/anchor.ts';
import type { Artifact } from '../src/model/artifact.ts';
import {
  applyRefinements,
  isAiEarned,
  isHumanEarned,
  isLocated,
  type RefinementBody,
} from '../src/model/placement.ts';
import type { Provenance } from '../src/model/provenance.ts';

const prov: Provenance = {
  authority: 'rule',
  producerId: 'test',
  inputs: [],
  createdAt: '',
};

function artifact(id: string, anchors: Anchor[]): Artifact {
  return { id, kind: 'context-item', anchors, body: {}, provenance: prov };
}

function refinement(targetArtifactId: string, anchor: Anchor): Artifact<RefinementBody> {
  return {
    id: `r:${targetArtifactId}`,
    kind: 'anchor-refinement',
    anchors: [anchor],
    body: { targetArtifactId, anchor },
    provenance: prov,
  };
}

const unit: Anchor = { spine: 'bavli', span: [{ path: ['Berakhot', '2a'] }], precision: 'unit' };
const segment: Anchor = {
  spine: 'bavli',
  span: [{ path: ['Berakhot', '2a', 3] }],
  precision: 'segment',
  via: 'ai',
  confidence: 0.8,
};
const token: Anchor = {
  spine: 'bavli',
  span: [{ path: ['Berakhot', '2a', 3], tokens: [1, 2] }],
  precision: 'token',
  via: 'ai-phrase',
};

describe('anchor predicates', () => {
  it('isLocated = token or segment precision', () => {
    expect(isLocated(token)).toBe(true);
    expect(isLocated(segment)).toBe(true);
    expect(isLocated(unit)).toBe(false);
    expect(isLocated({ ...unit, precision: 'division' })).toBe(false);
  });

  it('isAiEarned matches ai and ai-* vias', () => {
    expect(isAiEarned(segment)).toBe(true);
    expect(isAiEarned(token)).toBe(true);
    expect(isAiEarned({ ...segment, via: 'tosfos-dh' })).toBe(false);
    expect(isAiEarned(unit)).toBe(false);
  });

  it('isHumanEarned', () => {
    expect(isHumanEarned({ ...segment, via: 'human' })).toBe(true);
    expect(isHumanEarned(segment)).toBe(false);
  });
});

describe('applyRefinements', () => {
  it('applies to an artifact with no anchor on that spine', () => {
    const a = artifact('a1', []);
    const n = applyRefinements([a], [refinement('a1', segment)]);
    expect(n).toBe(1);
    expect(a.anchors).toEqual([segment]);
  });

  it('adds rather than replaces when the spines differ', () => {
    const rashi: Anchor = { ...segment, spine: 'rashi' };
    const a = artifact('a1', [segment]);
    expect(applyRefinements([a], [refinement('a1', rashi)])).toBe(1);
    expect(a.anchors).toHaveLength(2);
  });

  it('upgrades a coarser anchor on the same spine', () => {
    const a = artifact('a1', [unit]);
    expect(applyRefinements([a], [refinement('a1', segment)])).toBe(1);
    expect(a.anchors).toEqual([segment]);
    expect(applyRefinements([a], [refinement('a1', token)])).toBe(1);
    expect(a.anchors).toEqual([token]);
  });

  it('refuses to downgrade or sidestep at equal precision', () => {
    const a = artifact('a1', [segment]);
    expect(applyRefinements([a], [refinement('a1', unit)])).toBe(0);
    const otherSegment: Anchor = {
      ...segment,
      span: [{ path: ['Berakhot', '2a', 9] }],
    };
    expect(applyRefinements([a], [refinement('a1', otherSegment)])).toBe(0);
    expect(a.anchors).toEqual([segment]);
  });

  it('never overwrites a human-earned anchor, even with finer precision', () => {
    const human: Anchor = { ...segment, via: 'human' };
    const a = artifact('a1', [human]);
    expect(applyRefinements([a], [refinement('a1', token)])).toBe(0);
    expect(a.anchors).toEqual([human]);
  });

  it('skips refinements whose target is missing and returns the applied count', () => {
    const a = artifact('a1', []);
    const b = artifact('b1', [unit]);
    const n = applyRefinements(
      [a, b],
      [refinement('a1', segment), refinement('b1', token), refinement('ghost', token)],
    );
    expect(n).toBe(2);
  });
});
