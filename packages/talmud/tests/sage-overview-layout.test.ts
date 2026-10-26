import { describe, expect, it } from 'vitest';
import { layoutOverview } from '../src/client/sageOverviewLayout';

const ring = (n: number, prefix = 'n') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));
const chain = (n: number, prefix = 'n') =>
  Array.from({ length: n - 1 }, (_, i) => ({ a: `${prefix}${i}`, b: `${prefix}${i + 1}` }));

describe('layoutOverview', () => {
  it('gives every name its own place inside the page width', () => {
    const nodes = [...ring(30, 'a'), ...ring(5, 'b'), ...ring(2, 'c')];
    const edges = [...chain(30, 'a'), ...chain(5, 'b'), ...chain(2, 'c')];
    const out = layoutOverview(nodes, edges, 900);
    expect(out.positions.size).toBe(37);
    for (const p of out.positions.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(900);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(out.height);
    }
    const spots = new Set(
      [...out.positions.values()].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    );
    expect(spots.size).toBe(37);
  });

  it('keeps each cluster in its own box and puts the biggest first', () => {
    const nodes = [...ring(4, 'small'), ...ring(20, 'big')];
    const edges = [...chain(4, 'small'), ...chain(20, 'big')];
    const out = layoutOverview(nodes, edges, 900);
    expect(out.boxes[0].ids).toHaveLength(20);
    for (const box of out.boxes) {
      for (const id of box.ids) {
        const p = out.positions.get(id)!;
        expect(p.x).toBeGreaterThanOrEqual(box.x);
        expect(p.x).toBeLessThanOrEqual(box.x + box.w);
        expect(p.y).toBeGreaterThanOrEqual(box.y);
        expect(p.y).toBeLessThanOrEqual(box.y + box.h);
      }
    }
    for (const a of out.boxes) {
      for (const b of out.boxes) {
        if (a === b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('draws the same picture for the same input', () => {
    const nodes = ring(12);
    const edges = chain(12);
    const a = layoutOverview(nodes, edges, 800);
    const b = layoutOverview(nodes, edges, 800);
    expect([...a.positions]).toEqual([...b.positions]);
  });

  it('ignores a connection to a name that is not there', () => {
    const out = layoutOverview(ring(3), [...chain(3), { a: 'n0', b: 'ghost' }], 600);
    expect(out.positions.size).toBe(3);
    expect(out.positions.has('ghost')).toBe(false);
  });

  it('handles no names at all', () => {
    const out = layoutOverview([], [], 600);
    expect(out.positions.size).toBe(0);
    expect(out.height).toBe(0);
  });
});
