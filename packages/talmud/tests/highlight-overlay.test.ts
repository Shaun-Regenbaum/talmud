import { lineBands } from '@corpus/ui/highlightOverlay';
import { describe, expect, it } from 'vitest';

const rect = (left: number, right: number, top: number, bottom: number) => ({
  left,
  right,
  top,
  bottom,
});

describe('continuous highlight bands', () => {
  it('merges the rects of one line and stretches each line down to the next', () => {
    const bands = lineBands([
      rect(200, 300, 0, 18),
      rect(100, 190, 1, 18),
      rect(20, 300, 24, 42),
      rect(150, 300, 48, 66),
    ]);
    expect(bands).toEqual([
      { left: 100, right: 300, top: 0, bottom: 24, first: true, last: false },
      { left: 20, right: 300, top: 24, bottom: 48, first: false, last: false },
      { left: 150, right: 300, top: 48, bottom: 66, first: false, last: true },
    ]);
  });

  it('joins every line by default, however far apart, as the Talmud reader always has', () => {
    const bands = lineBands([rect(0, 100, 0, 18), rect(0, 100, 400, 418)]);
    expect(bands.map((b) => [b.bottom, b.first, b.last])).toEqual([
      [400, true, false],
      [418, false, true],
    ]);
  });

  it('starts a new block after a paragraph gap wider than maxGap', () => {
    const bands = lineBands(
      [rect(0, 100, 0, 18), rect(0, 100, 24, 42), rect(0, 100, 80, 98), rect(0, 60, 104, 122)],
      { maxGap: 12 },
    );
    expect(bands.map((b) => [b.top, b.bottom, b.first, b.last])).toEqual([
      [0, 24, true, false],
      [24, 42, false, true],
      [80, 104, true, false],
      [104, 122, false, true],
    ]);
  });

  it('keeps lines in different columns apart even at the same height', () => {
    const column = (r: { left: number }) => (r.left < 300 ? 0 : 1);
    const bands = lineBands(
      [
        rect(400, 600, 0, 18),
        rect(0, 200, 500, 518),
        rect(0, 200, 524, 542),
        rect(400, 600, 24, 42),
      ],
      { column, maxGap: 12 },
    );
    expect(bands.map((b) => [b.left, b.top, b.bottom, b.first, b.last])).toEqual([
      [0, 500, 524, true, false],
      [0, 524, 542, false, true],
      [400, 0, 24, true, false],
      [400, 24, 42, false, true],
    ]);
  });

  it('puts a raised verse number on its own line', () => {
    const bands = lineBands([rect(280, 290, 3, 12), rect(0, 278, 6, 24)], { tolerance: 8 });
    expect(bands).toEqual([{ left: 0, right: 290, top: 3, bottom: 24, first: true, last: true }]);
  });
});
