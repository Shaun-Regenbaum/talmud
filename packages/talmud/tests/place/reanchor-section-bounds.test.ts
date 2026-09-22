import { describe, expect, it } from 'vitest';
import { reanchorArgumentMove } from '../../src/lib/place/reanchor';
import { buildVerbatimGrid, findExcerpt } from '../../src/lib/place/verbatim';
import captured from '../fixtures/chullin-137b-anchor.json';

describe('Chullin 137b section bounds', () => {
  it('finds the closing quote on the last segment instead of placing it past the daf', () => {
    const parsed = structuredClone(captured.parsed);
    reanchorArgumentMove(parsed, captured.segmentsHe);
    const last = parsed.instances.at(-1)!;
    expect(last.startSegIdx).toBe(16);
    expect(last.endSegIdx).toBe(16);
    expect(
      findExcerpt(buildVerbatimGrid(captured.segmentsHe), last.fields.excerpt, 16, 16),
    ).not.toBeNull();
    for (const move of parsed.instances) {
      expect(move.startSegIdx).toBeGreaterThanOrEqual(0);
      expect(move.endSegIdx).toBeLessThan(captured.segmentsHe.length);
    }
  });
});
