import { describe, expect, it } from 'vitest';
import { groupsOf, layoutCircle } from '../src/client/sageCircleLayout';

// Small made-up graphs, for the grouping and placing rules only. No Talmud data is stood in for here.
const clique = (ids: number[]): [number, number][] =>
  ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as [number, number]));

describe('groupsOf', () => {
  it('splits two tight groups joined by one link into two groups', () => {
    const links = [...clique([0, 1, 2, 3]), ...clique([4, 5, 6, 7]), [3, 4] as [number, number]];
    const g = groupsOf(8, links);
    expect(new Set(g.slice(0, 4)).size).toBe(1);
    expect(new Set(g.slice(4)).size).toBe(1);
    expect(g[0]).not.toBe(g[4]);
  });

  it('gives the same answer every time and numbers the biggest group 0', () => {
    const links = [...clique([0, 1, 2, 3, 4]), ...clique([5, 6, 7]), [4, 5] as [number, number]];
    expect(groupsOf(8, links)).toEqual(groupsOf(8, links));
    expect(groupsOf(8, links)[0]).toBe(0);
  });

  it('leaves a name with no links in a group of its own', () => {
    const g = groupsOf(4, [[0, 1]]);
    expect(g[2]).not.toBe(g[3]);
    expect(g[2]).not.toBe(g[0]);
  });
});

describe('layoutCircle', () => {
  it('puts every sage on the circle and keeps a group together', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`,
      generation: null,
      degree: 3,
    }));
    const links = [
      ...clique([0, 1, 2, 3]),
      ...clique([4, 5, 6, 7]),
      [3, 4] as [number, number],
    ].map(([a, b]) => [`n${a}`, `n${b}`] as [string, string]);
    const out = layoutCircle(nodes, links, 100);
    for (const p of out.positions.values()) expect(Math.hypot(p.x, p.y)).toBeCloseTo(100, 6);
    // Going round the circle, the group changes only once each way.
    const byAngle = [...out.positions.entries()]
      .sort((a, b) => a[1].angle - b[1].angle)
      .map(([id]) => out.group.get(id));
    const changes = byAngle.filter((g, i) => g !== byAngle[(i + 1) % byAngle.length]).length;
    expect(changes).toBe(2);
    expect(out.groups).toBe(2);
  });
});
