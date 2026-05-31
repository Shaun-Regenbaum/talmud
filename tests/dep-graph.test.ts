import { describe, it, expect } from 'vitest';
import {
  dependencyId, producerNodesFrom, reverseDependencyIndex, transitiveDependents,
} from '../src/lib/registry/depGraph';

describe('dependencyId — normalise a raw dependency to the id it points at', () => {
  it('reads source strings and producer references; null for junk', () => {
    expect(dependencyId('gemara')).toBe('gemara');
    expect(dependencyId({ enrichment: 'argument.background' })).toBe('argument.background');
    expect(dependencyId({ mark: 'rabbi' })).toBe('rabbi');
    expect(dependencyId({ nonsense: 1 } as unknown as Record<string, unknown>)).toBeNull();
  });
});

describe('producerNodesFrom — registry defs -> producer nodes', () => {
  it('flattens dependencies to ids and tolerates a missing dependencies field', () => {
    const nodes = producerNodesFrom([
      { id: 'argument.synthesis', dependencies: ['gemara', { enrichment: 'argument.background' }, { mark: 'rabbi' }] },
      { id: 'rabbi' }, // no dependencies
    ]);
    expect(nodes).toEqual([
      { id: 'argument.synthesis', dependsOn: ['gemara', 'argument.background', 'rabbi'] },
      { id: 'rabbi', dependsOn: [] },
    ]);
  });
});

describe('reverse-dependency index + transitive dependents (the re-warm cascade)', () => {
  // Mirrors the real shape: background <- synthesis, and both <- a daf overview.
  const nodes = producerNodesFrom([
    { id: 'argument', dependencies: ['gemara'] },
    { id: 'argument.background', dependencies: ['gemara', 'commentaries'] },
    { id: 'argument.synthesis', dependencies: ['gemara', { enrichment: 'argument.background' }] },
    { id: 'argument-overview.synthesis', dependencies: [{ enrichment: 'argument.synthesis' }] },
  ]);
  const rev = reverseDependencyIndex(nodes);

  it('maps an input to its DIRECT dependents', () => {
    expect([...(rev.get('argument.background') ?? [])]).toEqual(['argument.synthesis']);
    expect([...(rev.get('gemara') ?? [])].sort()).toEqual(['argument', 'argument.background', 'argument.synthesis']);
  });

  it('computes the FULL re-warm set transitively (background -> synthesis -> overview)', () => {
    expect([...transitiveDependents(rev, 'argument.background')].sort())
      .toEqual(['argument-overview.synthesis', 'argument.synthesis']);
  });

  it('returns empty for an id nothing depends on', () => {
    expect([...transitiveDependents(rev, 'argument-overview.synthesis')]).toEqual([]);
  });

  it('is cycle-safe (a dependency loop terminates)', () => {
    const cyc = reverseDependencyIndex([
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ]);
    expect([...transitiveDependents(cyc, 'a')].sort()).toEqual(['a', 'b']);
  });
});
