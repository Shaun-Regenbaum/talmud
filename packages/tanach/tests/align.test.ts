import { describe, expect, it } from 'vitest';
import { anchorLabel, range, versesOf } from '../src/client/align';

describe('align: verse-anchor derivation from a piece instance', () => {
  it('a whole-chapter piece (no instance) anchors to every verse', () => {
    expect(versesOf({ instanceRaw: null }, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(anchorLabel({ instanceRaw: null })).toBe('whole chapter');
  });

  it('a note range "start-end" anchors to that inclusive verse span', () => {
    expect(versesOf({ instanceRaw: '3-6' }, 20)).toEqual([3, 4, 5, 6]);
    expect(versesOf({ instanceRaw: '7-7' }, 20)).toEqual([7]);
    expect(anchorLabel({ instanceRaw: '3-6' })).toBe('verses 3-6');
  });

  it('a per-verse piece (synthesis / midrash) anchors to its single verse', () => {
    expect(versesOf({ instanceRaw: '12' }, 20)).toEqual([12]);
    expect(anchorLabel({ instanceRaw: '12' })).toBe('verse 12');
  });

  it('an unparseable instance falls back to the whole chapter (never throws)', () => {
    expect(versesOf({ instanceRaw: 'weird' }, 3)).toEqual([1, 2, 3]);
  });

  it('range is inclusive on both ends', () => {
    expect(range(2, 4)).toEqual([2, 3, 4]);
    expect(range(5, 5)).toEqual([5]);
  });
});
