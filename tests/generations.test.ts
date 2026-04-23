import { describe, it, expect } from 'vitest';
import { deriveRegionFromGeneration } from '../src/worker/index';
import { GENERATION_IDS, type GenerationId } from '../src/client/generations';

describe('deriveRegionFromGeneration — every generation ID', () => {
  const EXPECTED: Record<GenerationId, 'israel' | 'bavel' | null> = {
    // Pre-Tannaitic pairs (Hillel & Shammai are last) — Eretz Yisrael.
    'zugim':          'israel',
    // All Tannaim lived and taught in Eretz Yisrael.
    'tanna-1':        'israel',
    'tanna-2':        'israel',
    'tanna-3':        'israel',
    'tanna-4':        'israel',
    'tanna-5':        'israel',
    'tanna-6':        'israel',
    // Eretz Yisrael Amoraim.
    'amora-ey-1':     'israel',
    'amora-ey-2':     'israel',
    'amora-ey-3':     'israel',
    'amora-ey-4':     'israel',
    'amora-ey-5':     'israel',
    // Babylonian Amoraim.
    'amora-bavel-1':  'bavel',
    'amora-bavel-2':  'bavel',
    'amora-bavel-3':  'bavel',
    'amora-bavel-4':  'bavel',
    'amora-bavel-5':  'bavel',
    'amora-bavel-6':  'bavel',
    'amora-bavel-7':  'bavel',
    'amora-bavel-8':  'bavel',
    // Savoraim are the Babylonian post-Talmudic editors.
    'savora':         'bavel',
    // Unknown falls through to null — downstream code can leave the rabbi on
    // the "other" bucket rather than forcing a region.
    'unknown':        null,
  };

  for (const gen of GENERATION_IDS) {
    const expected = EXPECTED[gen];
    it(`${gen.padEnd(16)} → ${expected ?? '(null)'}`, () => {
      expect(deriveRegionFromGeneration(gen)).toBe(expected);
    });
  }

  it('covers every GenerationId (no new ID left untested)', () => {
    const tested = Object.keys(EXPECTED) as GenerationId[];
    const missing = GENERATION_IDS.filter((g) => !tested.includes(g));
    expect(missing).toEqual([]);
  });
});
