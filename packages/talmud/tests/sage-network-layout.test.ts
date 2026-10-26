import { describe, expect, it } from 'vitest';
import { layoutTimeline } from '../src/client/sageNetworkLayout';

const node = (id: string, generation: string | null, degree = 1) => ({ id, generation, degree });

describe('layoutTimeline', () => {
  it('puts earlier periods on the left and people with no era last', () => {
    const out = layoutTimeline([
      node('c', 'amora-bavel-4'),
      node('a', 'tanna-2'),
      node('z', null),
      node('b', 'amora-ey-1'),
    ]);
    expect(out.bands.map((b) => b.gen)).toEqual(['tanna-2', 'amora-ey-1', 'amora-bavel-4', null]);
    const xs = out.bands.map((b) => b.x);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
  });

  it('gives every person their own place inside their column', () => {
    const nodes = Array.from({ length: 120 }, (_, i) => node(`n${i}`, i % 3 ? 'tanna-1' : null));
    const out = layoutTimeline(nodes);
    const spots = new Set([...out.positions.values()].map((p) => `${p.x},${p.y}`));
    expect(spots.size).toBe(120);
    for (const n of nodes) {
      const p = out.positions.get(n.id)!;
      const band = out.bands.find((b) => b.gen === n.generation)!;
      expect(p.x).toBeGreaterThanOrEqual(band.x);
      expect(p.x).toBeLessThanOrEqual(band.x + band.w);
      expect(p.y).toBeLessThanOrEqual(out.height);
    }
  });

  it('puts the most linked people at the top of their column', () => {
    const out = layoutTimeline([node('few', 'tanna-1', 1), node('many', 'tanna-1', 9)]);
    expect(out.positions.get('many')!.y).toBeLessThan(out.positions.get('few')!.y);
  });

  it('starts a new column once one fills up', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => node(`n${i}`, 'tanna-1'));
    const out = layoutTimeline(nodes);
    expect(out.bands).toHaveLength(1);
    expect(out.bands[0].w).toBeGreaterThan(44);
    const xs = new Set([...out.positions.values()].map((p) => p.x));
    expect(xs.size).toBe(3);
  });

  it('copes with nobody', () => {
    const out = layoutTimeline([]);
    expect(out.bands).toEqual([]);
    expect(out.width).toBe(0);
  });

  it('is the same every time', () => {
    const nodes = [node('b', 'tanna-1'), node('a', 'tanna-1'), node('c', null)];
    expect([...layoutTimeline(nodes).positions]).toEqual([
      ...layoutTimeline([...nodes].reverse()).positions,
    ]);
  });
});
