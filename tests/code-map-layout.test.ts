import { describe, it, expect } from 'vitest';
import { SIDE_COLOR, relationStyle, gutterEdgePath } from '../src/client/flow/codeMapLayout';

describe('relationStyle', () => {
  it('only disagrees is dashed; colours match the Voices/Flow palette', () => {
    expect(relationStyle('disagrees')).toEqual({ color: '#b91c1c', dash: '5 3' });
    expect(relationStyle('agrees')).toEqual({ color: '#15803d', dash: undefined });
    expect(relationStyle('cites')).toEqual({ color: '#475569', dash: undefined });
    expect(relationStyle('transmits')).toEqual({ color: '#cfc9bb', dash: undefined });
  });
});

describe('SIDE_COLOR', () => {
  it('maps sides to the shared palette', () => {
    expect(SIDE_COLOR.a).toBe('#1d4ed8'); // matches ArgumentVoiceMap COLOR_A
    expect(SIDE_COLOR.b).toBe('#b91c1c'); // matches ArgumentVoiceMap COLOR_B
    expect(SIDE_COLOR.source).toBe('#3f6212');
    expect(SIDE_COLOR.neutral).toBe('#475569');
  });
});

describe('gutterEdgePath', () => {
  it('routes out, rounds the corner, runs vertically, rounds back, re-enters', () => {
    const d = gutterEdgePath(30, 110, 300, 340);
    // downward: dir=+1, r = min(10, 40, 40) = 10
    expect(d).toBe('M 300 30 L 330 30 Q 340 30 340 40 L 340 100 Q 340 110 330 110 L 300 110');
  });

  it('handles an upward edge (to-card above from-card)', () => {
    const d = gutterEdgePath(110, 30, 300, 340);
    // dir = -1
    expect(d).toBe('M 300 110 L 330 110 Q 340 110 340 100 L 340 40 Q 340 30 330 30 L 300 30');
  });

  it('clamps the corner radius for near-equal Ys (no overshoot)', () => {
    // |y2-y1|/2 = 2 caps r at 2
    expect(gutterEdgePath(50, 54, 300, 340)).toContain('Q 340 50 340 52');
  });

  it('never emits a negative radius when the lane hugs the cards', () => {
    const d = gutterEdgePath(30, 110, 300, 304); // laneX-rightX = 4 → r = 4
    expect(d).toContain('Q 304 30 304 34');
    expect(d).not.toMatch(/-\d/); // no negative coordinates
  });

  it('is axis-aligned only — no diagonal segment (every L shares an axis with its start)', () => {
    // A simple structural check: the path has the expected M/L/Q command count.
    const d = gutterEdgePath(30, 110, 300, 340);
    expect((d.match(/L /g) || []).length).toBe(3);
    expect((d.match(/Q /g) || []).length).toBe(2);
  });
});
