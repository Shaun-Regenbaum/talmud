import { afterEach, describe, expect, it } from 'vitest';
import { rabbiCandidates, resolveRabbiSlug, setLearnedAdjacency } from '../src/worker/rabbi-graph';
import { buildLearnedAdjacency } from '../src/worker/voice-graph';

// "Ravin" is a real permanently-ambiguous case: two registry bearers
// (ravin-b-rav-ada / ravin-b-rav-nachman), SAME generation (amora-bavel-3),
// and — like ~940 registry nodes — ZERO curated edges on either. Curated
// relational scoring can never separate them; the learned voice graph is the
// only evidence that can. That makes it the exact seam this feature exists
// for, and a stable fixture (the assertions below verify the precondition).
const NAME = 'Ravin';
const HE = 'רבין';
const A = 'ravin-b-rav-ada';
const B = 'ravin-b-rav-nachman';

afterEach(() => setLearnedAdjacency(null));

describe('resolveRabbiSlug with learned adjacency', () => {
  it('precondition: the fixture name is a curated-edge-less homonym', () => {
    expect(rabbiCandidates(NAME, HE).sort()).toEqual([A, B]);
    expect(resolveRabbiSlug(NAME, HE, { coRabbis: ['Rava', 'Abaye'] })).toEqual({
      slug: null,
      basis: 'ambiguous',
    });
  });

  it('a margin-clearing learned win resolves relationally', () => {
    // Two co-rabbis sit in A's learned interaction set, none in B's.
    setLearnedAdjacency(
      new Map([
        [A, new Set(['rava', 'abaye'])],
        ['rava', new Set([A])],
        ['abaye', new Set([A])],
      ]),
    );
    expect(resolveRabbiSlug(NAME, HE, { coRabbis: ['Rava', 'Abaye'] })).toEqual({
      slug: A,
      basis: 'relational',
    });
  });

  it('a one-edge learned "win" stays below the margin — still ambiguous', () => {
    setLearnedAdjacency(new Map([[A, new Set(['rava'])]]));
    expect(resolveRabbiSlug(NAME, HE, { coRabbis: ['Rava', 'Abaye'] })).toEqual({
      slug: null,
      basis: 'ambiguous',
    });
  });

  it('split learned evidence (one co-rabbi each) is a tie — still ambiguous', () => {
    setLearnedAdjacency(
      new Map([
        [A, new Set(['rava'])],
        [B, new Set(['abaye'])],
      ]),
    );
    expect(resolveRabbiSlug(NAME, HE, { coRabbis: ['Rava', 'Abaye'] })).toEqual({
      slug: null,
      basis: 'ambiguous',
    });
  });

  it('clearing the adjacency restores curated-only behaviour', () => {
    setLearnedAdjacency(new Map([[A, new Set(['rava', 'abaye'])]]));
    setLearnedAdjacency(null);
    expect(resolveRabbiSlug(NAME, HE, { coRabbis: ['Rava', 'Abaye'] }).basis).toBe('ambiguous');
  });
});

describe('buildLearnedAdjacency', () => {
  it('is symmetric, strict-thresholded, and ignores weight', () => {
    const adj = buildLearnedAdjacency({
      'a|b|opposes': { from: 'a', to: 'b', strict: 3 },
      'b|c|cites': { from: 'b', to: 'c', strict: 1 }, // below default threshold
      'c|d|supports': { from: 'c', to: 'd', strict: 0 }, // weight-only edge: excluded
    });
    expect(adj.get('a')?.has('b')).toBe(true);
    expect(adj.get('b')?.has('a')).toBe(true);
    expect(adj.get('b')?.has('c') ?? false).toBe(false);
    expect(adj.get('c')).toBeUndefined();
  });

  it('minStrict=1 admits single strict sightings', () => {
    const adj = buildLearnedAdjacency({ 'b|c|cites': { from: 'b', to: 'c', strict: 1 } }, 1);
    expect(adj.get('c')?.has('b')).toBe(true);
  });
});
