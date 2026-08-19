import { inBBox } from '@corpus/ui/geo/bbox';
import { type LabelCandidate, placeLabels } from '@corpus/ui/geo/labels';
import { describe, expect, it } from 'vitest';

const OPTS = { width: 400, height: 300, lineHeight: 11, charWidth: 0.52 };

/** A label candidate sitting to the right of its dot, as GeoMap builds them. */
function at(
  index: number,
  x: number,
  y: number,
  text = 'Hebron',
  priority = false,
): LabelCandidate {
  return { index, x, y, text, anchorX: x + 7, anchor: 'start', priority };
}

describe('geomap label placement', () => {
  it('places a lone label beside its dot', () => {
    const [placed] = placeLabels([at(0, 100, 100)], OPTS);
    expect(placed).toEqual({ index: 0, x: 107, y: 100 + 0.3 * 11 });
  });

  it('nudges the second of two crowded labels instead of stacking them', () => {
    const placed = placeLabels([at(0, 100, 100), at(1, 104, 102)], OPTS);
    expect(placed).toHaveLength(2);
    // Different baselines — the whole point.
    expect(placed[0].y).not.toBe(placed[1].y);
  });

  it('drops what it cannot place rather than overlapping it', () => {
    // Ten labels on one spot: a few fit at the offsets around the dot, the
    // rest are dropped (they stay reachable as tooltips).
    const pile = Array.from({ length: 10 }, (_, i) => at(i, 200, 150));
    const placed = placeLabels(pile, OPTS);
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThan(10);
    // Nothing placed shares a baseline.
    expect(new Set(placed.map((p) => p.y)).size).toBe(placed.length);
  });

  it('never lets a starred point lose its label to a crowd', () => {
    const crowd = Array.from({ length: 8 }, (_, i) => at(i, 200, 150, 'Neighbour'));
    const starred = at(99, 200, 150, 'Jerusalem', true);
    const placed = placeLabels([...crowd, starred], OPTS);
    expect(placed.some((p) => p.index === 99)).toBe(true);
  });

  it('refuses a placement that would hang off the canvas', () => {
    // Hard against the right edge: the text would be clipped, which reads as
    // truncation rather than a clean drop, and no vertical nudge can save it.
    expect(placeLabels([at(0, 398, 150, 'Kiriath-jearim')], OPTS)).toEqual([]);
  });

  it('nudges a label down off the top edge rather than dropping it', () => {
    // Its own baseline would put the box above the canvas, but a lower offset
    // fits — dropping is the last resort, not the first.
    const [placed] = placeLabels([at(0, 100, 1, 'Top edge')], OPTS);
    expect(placed).toBeDefined();
    expect(placed.y).toBeGreaterThan(10);
  });

  it('skips empty labels (the clustered satellite dots)', () => {
    expect(placeLabels([at(0, 100, 100, '')], OPTS)).toEqual([]);
  });

  it('returns placements in the caller’s index order, whatever the priority', () => {
    const placed = placeLabels([at(0, 60, 200), at(1, 60, 60, 'Dan', true), at(2, 60, 130)], OPTS);
    expect(placed.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it('is stable: the same input places the same way twice', () => {
    const input = [at(0, 100, 100), at(1, 103, 104), at(2, 106, 108), at(3, 99, 112)];
    expect(placeLabels(input, OPTS)).toEqual(placeLabels(input, OPTS));
  });
});

describe('inBBox — filter markers against the live view, not the original frame', () => {
  const start = { lonMin: 34, lonMax: 36.3, latMin: 29.4, latMax: 33.6 };
  // After a pan east + zoom in, Hebron (35.0, 31.5) is still in frame but
  // a point that was on the original western edge is not.
  const panned = { lonMin: 34.6, lonMax: 36.0, latMin: 30.6, latMax: 32.6 };

  it('keeps a point inside the starting frame', () => {
    expect(inBBox(35.0, 31.5, start)).toBe(true);
    expect(inBBox(34.0, 29.4, start)).toBe(true); // inclusive edges
  });

  it('drops a point that left the live (panned) view', () => {
    expect(inBBox(34.1, 31.5, start)).toBe(true);
    expect(inBBox(34.1, 31.5, panned)).toBe(false);
  });

  it('admits a point that entered the live view from outside the start frame', () => {
    expect(inBBox(35.9, 32.4, start)).toBe(true);
    expect(inBBox(36.2, 32.4, start)).toBe(true);
    expect(inBBox(36.2, 32.4, panned)).toBe(false);
    // A point just inside the panned east edge that was also in the start.
    expect(inBBox(35.9, 32.4, panned)).toBe(true);
  });
});
