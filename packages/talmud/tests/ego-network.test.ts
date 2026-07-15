import { describe, expect, it } from 'vitest';
import { type EgoWireEdge, groupEgoEdges, splitDafLabel } from '../src/client/egoNetwork';

const edge = (over: Partial<EgoWireEdge>): EgoWireEdge => ({
  from: 'rava',
  to: 'abaye',
  kind: 'opposes',
  weight: 1,
  strict: 0,
  dafs: [],
  direction: 'out',
  other: { slug: 'abaye', name: 'Abaye', generation: 'amora-bavel-4' },
  ...over,
});

describe('groupEgoEdges', () => {
  it('groups by neighbor, merges dafs, sorts by total weight', () => {
    const rows = groupEgoEdges([
      edge({ kind: 'opposes', weight: 3, strict: 2, dafs: ['Berakhot 2a', 'Shabbat 21b'] }),
      edge({ kind: 'cites', direction: 'in', weight: 1, dafs: ['Berakhot 2a'] }),
      edge({
        kind: 'supports',
        weight: 9,
        dafs: ['Chullin 3a'],
        other: { slug: 'rav-papa', name: 'Rav Papa', generation: 'amora-bavel-5' },
      }),
    ]);
    expect(rows.map((r) => r.other.slug)).toEqual(['rav-papa', 'abaye']);
    const abaye = rows[1];
    expect(abaye.chips.map((c) => c.kind)).toEqual(['opposes', 'cites']); // weight-sorted
    expect(abaye.totalWeight).toBe(4);
    expect(abaye.totalStrict).toBe(2);
    expect(abaye.dafs).toEqual(['Berakhot 2a', 'Shabbat 21b']); // deduped union
  });

  it('drops rows without an other slug', () => {
    const bad = edge({});
    // @ts-expect-error simulating a corrupt wire row
    bad.other = null;
    expect(groupEgoEdges([bad])).toEqual([]);
  });
});

describe('splitDafLabel', () => {
  it('splits at the LAST space (multi-word tractates)', () => {
    expect(splitDafLabel('Bava Metzia 59a')).toEqual({ tractate: 'Bava Metzia', page: '59a' });
    expect(splitDafLabel('Berakhot 2a')).toEqual({ tractate: 'Berakhot', page: '2a' });
  });
  it('rejects labels without a page', () => {
    expect(splitDafLabel('Berakhot')).toBeNull();
    expect(splitDafLabel('Berakhot ')).toBeNull();
  });
});
