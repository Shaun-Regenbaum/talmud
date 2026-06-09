import { describe, expect, it } from 'vitest';
import { type EdgeRect, orthogonalEdgePath } from '../src/client/flow/orthogonalEdge';

/** Parse an SVG path of only M/L commands into its ordered points. */
function points(path: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

/** Every consecutive segment must be axis-aligned: equal x OR equal y. */
function assertOrthogonal(path: string): void {
  const pts = points(path);
  expect(pts.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const aligned = Math.abs(ax - bx) < 1e-9 || Math.abs(ay - by) < 1e-9;
    expect(
      aligned,
      `segment ${JSON.stringify(pts[i - 1])}->${JSON.stringify(pts[i])} in "${path}" is diagonal`,
    ).toBe(true);
  }
}

const W = 152;
const H = 40;
const at = (x: number, y: number): EdgeRect => ({ x, y, w: W, h: H });

describe('orthogonalEdgePath', () => {
  it('same row -> single horizontal segment', () => {
    const p = orthogonalEdgePath(at(0, 100), at(300, 100));
    assertOrthogonal(p);
    const pts = points(p);
    expect(pts.length).toBe(2);
    expect(pts[0][1]).toBe(pts[1][1]); // flat
  });

  it('same column, different row -> single vertical segment', () => {
    const p = orthogonalEdgePath(at(0, 0), at(0, 200));
    assertOrthogonal(p);
    const pts = points(p);
    expect(pts.length).toBe(2);
    expect(pts[0][0]).toBe(pts[1][0]); // plumb
  });

  it('off-row and off-column -> L-shape, still orthogonal', () => {
    assertOrthogonal(orthogonalEdgePath(at(0, 0), at(300, 200)));
    assertOrthogonal(orthogonalEdgePath(at(300, 200), at(0, 0))); // reversed order
    assertOrthogonal(orthogonalEdgePath(at(0, 200), at(300, 0)));
  });

  it('partner placed off-row no longer draws a diagonal (the bug)', () => {
    // Old partnerPath drew a single M..L between two differing-y centers.
    assertOrthogonal(orthogonalEdgePath(at(200, 100), at(360, 184)));
  });

  it('is orthogonal across a randomized battery of rect pairs', () => {
    let seed = 1234567;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 500; i++) {
      const a = at(Math.round(rnd() * 800), Math.round(rnd() * 600));
      const b = at(Math.round(rnd() * 800), Math.round(rnd() * 600));
      assertOrthogonal(orthogonalEdgePath(a, b));
    }
  });
});
