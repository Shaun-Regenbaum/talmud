import { describe, expect, it } from 'vitest';
import { perakimOf, perekAt } from '../src/lib/perakim';

describe('perakim', () => {
  const shabbat = perakimOf('Shabbat');

  it('has the 24 chapters of Shabbat, starting on 2a', () => {
    expect(shabbat).toHaveLength(24);
    expect(shabbat[0]).toMatchObject({ n: 1, start: '2a' });
  });

  it('finds the chapter a page falls in, including mid-page starts', () => {
    expect(perekAt(shabbat, '2a')?.n).toBe(1);
    expect(perekAt(shabbat, '20a')?.n).toBe(1);
    expect(perekAt(shabbat, '20b')?.n).toBe(2);
    expect(perekAt(shabbat, '157b')?.n).toBe(24);
  });

  it('returns nothing for a tractate without chapter data', () => {
    expect(perakimOf('Shekalim')).toEqual([]);
  });
});
