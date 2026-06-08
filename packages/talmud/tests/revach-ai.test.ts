import { describe, it, expect } from 'vitest';
import { applyAiToUnplaced } from '../src/worker/revach-ai-place';
import type { ContextItem } from '../src/lib/context/types';
import type { SegMatch } from '../src/lib/context/match';

const rev = (key: string, segs: number[], via?: string): ContextItem => ({
  source: 'dafyomi:revach', sourceLabel: "Revach l'Daf", kind: 'revach', key,
  title: { en: key }, body: { en: '' }, segs, ...(via ? { via } : {}),
});

describe('applyAiToUnplaced — AI fills gaps, never overrides deterministic', () => {
  it('places only the unplaced item; leaves the deterministically-placed one alone', () => {
    const placed = rev('r:0', [0, 1, 2, 3, 4], 'revach-section'); // deterministic
    const gap = rev('r:1', []);                                   // unplaced
    const items = [placed, gap];
    const ai: SegMatch[] = [
      { key: 'r:0', segs: [9], via: 'ai', confidence: 0.9 }, // would override — must be ignored
      { key: 'r:1', segs: [7, 8], via: 'ai', confidence: 0.8 },
    ];
    const changed = applyAiToUnplaced(items, ai);
    expect(changed).toBe(1);
    expect(placed.segs).toEqual([0, 1, 2, 3, 4]); // untouched
    expect(placed.via).toBe('revach-section');
    expect(gap.segs).toEqual([7, 8]);             // filled by AI
    expect(gap.via).toBe('ai');
  });

  it('drops low-confidence AI guesses (stay whole-daf)', () => {
    const gap = rev('r:1', []);
    const weak: SegMatch[] = [{ key: 'r:1', segs: [3], via: 'ai', confidence: 0.2 }];
    expect(applyAiToUnplaced([gap], weak)).toBe(0);
    expect(gap.segs).toEqual([]); // untouched — below the floor
  });

  it('ignores AI matches for non-revach keys and is a no-op with none', () => {
    const gap = rev('r:1', []);
    expect(applyAiToUnplaced([gap], [])).toBe(0);
    expect(applyAiToUnplaced([gap], [{ key: 'other', segs: [1], via: 'ai' }])).toBe(0);
  });
});
