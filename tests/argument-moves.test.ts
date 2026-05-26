import { describe, it, expect } from 'vitest';
import {
  partitionSections,
  dedupeByRange,
  selectSectionMoves,
  type MoveLike,
  type SectionRange,
} from '../src/lib/argumentMoves';

// These guard the Shabbat 126a regression: the `argument` extractor sometimes
// emits its section partition twice (e.g. segs 1–3 as one section AND again as
// 1, 2, 3), the argument-move fan-out then runs each duplicated section, and
// the sidebar rendered two partitions' worth of moves — each spinning its own
// synthesis forever. partitionSections + dedupeByRange clean that at the source;
// selectSectionMoves keeps already-cached doubled blobs from reaching the UI.

const section = (startSegIdx: number, endSegIdx: number): SectionRange => ({ startSegIdx, endSegIdx });

/** Assert a section list is a clean, ordered, non-overlapping partition. */
function assertCleanPartition(sections: SectionRange[]): void {
  for (let i = 1; i < sections.length; i++) {
    expect(sections[i].startSegIdx).toBeGreaterThan(sections[i - 1].endSegIdx);
  }
  for (const s of sections) expect(s.endSegIdx).toBeGreaterThanOrEqual(s.startSegIdx);
}

describe('partitionSections', () => {
  it('leaves a clean partition untouched (modulo identity)', () => {
    const out = partitionSections(
      [section(0, 0), section(1, 3), section(4, 4), section(5, 5), section(6, 6)],
      6,
    );
    expect(out.map((s) => [s.startSegIdx, s.endSegIdx])).toEqual([
      [0, 0], [1, 3], [4, 4], [5, 5], [6, 6],
    ]);
    assertCleanPartition(out);
  });

  it('collapses a partition emitted twice (same split)', () => {
    const doubled = [
      section(0, 0), section(1, 1), section(2, 2), section(3, 3),
      section(0, 0), section(1, 1), section(2, 2), section(3, 3),
    ];
    const out = partitionSections(doubled, 3);
    expect(out.map((s) => [s.startSegIdx, s.endSegIdx])).toEqual([
      [0, 0], [1, 1], [2, 2], [3, 3],
    ]);
    assertCleanPartition(out);
  });

  it('resolves a mixed coarse+fine double into one clean partition (fine wins)', () => {
    // The exact Shabbat 126a shape: segs 1–3 as one section AND as 1,2,3.
    const mixed = [
      section(0, 0),
      section(1, 3),            // coarse
      section(1, 1), section(2, 2), section(3, 3),  // fine
      section(4, 4), section(5, 5), section(6, 6),
    ];
    const out = partitionSections(mixed, 6);
    assertCleanPartition(out);
    // Finer split wins the 1–3 span; no segment is double-covered.
    expect(out.map((s) => [s.startSegIdx, s.endSegIdx])).toEqual([
      [0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6],
    ]);
  });

  it('closes a gap left by a dropped/absent section', () => {
    const out = partitionSections([section(0, 0), section(1, 1), section(3, 3)], 3);
    // seg 2 had no section; the next section's start is pushed back to fill it.
    expect(out.map((s) => [s.startSegIdx, s.endSegIdx])).toEqual([[0, 0], [1, 1], [2, 3]]);
    assertCleanPartition(out);
  });

  it('clamps ranges to the last segment', () => {
    const out = partitionSections([section(0, 0), section(1, 9)], 4);
    expect(out[out.length - 1].endSegIdx).toBe(4);
  });

  it('handles an unsorted input', () => {
    const out = partitionSections([section(4, 4), section(0, 0), section(1, 3)], 4);
    expect(out.map((s) => [s.startSegIdx, s.endSegIdx])).toEqual([[0, 0], [1, 3], [4, 4]]);
    assertCleanPartition(out);
  });
});

describe('dedupeByRange', () => {
  it('drops instances sharing a (start,end) range, keeping the first', () => {
    const a = { startSegIdx: 1, endSegIdx: 1, tag: 'a' };
    const b = { startSegIdx: 1, endSegIdx: 1, tag: 'b' };
    const c = { startSegIdx: 2, endSegIdx: 2, tag: 'c' };
    const out = dedupeByRange([a, b, c]);
    expect(out).toEqual([a, c]);
  });

  it('never drops instances without a numeric range', () => {
    const x = { tag: 'x' } as Partial<SectionRange> & { tag: string };
    const y = { tag: 'y' } as Partial<SectionRange> & { tag: string };
    const out = dedupeByRange([x, y]);
    expect(out).toEqual([x, y]);
  });
});

// A trimmed version of the real doubled cache blob served for Shabbat 126a:
// Batch A used a 7-way split (1-1/2-2/3-3), Batch B a 5-way split (1-3 as one
// section). Several sections (4-4, 5-5, 6-6) appear in BOTH batches with the
// same move id.
function shabbat126aDoubledMoves(): MoveLike[] {
  const mk = (
    id: string, secStart: number, secEnd: number, order: number,
    start: number, end: number,
  ): MoveLike => ({
    startSegIdx: start, endSegIdx: end,
    fields: { id, sectionStartSegIdx: secStart, sectionEndSegIdx: secEnd, moveOrder: order },
  });
  return [
    // Batch A — 7-way split
    mk('0-0_0', 0, 0, 0, 0, 0),
    mk('1-1_0', 1, 1, 0, 1, 1),
    mk('1-1_1', 1, 1, 1, 1, 1),
    mk('1-1_2', 1, 1, 2, 1, 1),
    mk('2-2_0', 2, 2, 0, 2, 2),
    mk('2-2_1', 2, 2, 1, 2, 2),
    mk('3-3_0', 3, 3, 0, 3, 3),
    mk('4-4_0', 4, 4, 0, 4, 4),
    mk('4-4_1', 4, 4, 1, 4, 4),
    mk('5-5_0', 5, 5, 0, 5, 5),
    mk('6-6_0', 6, 6, 0, 6, 6),
    // Batch B — 5-way split (1-3 as one section); reuses 4-4_0/5-5_0/6-6_0 ids
    mk('1-3_0', 1, 3, 0, 1, 1),
    mk('1-3_1', 1, 3, 1, 1, 1),
    mk('1-3_2', 1, 3, 2, 2, 2),
    mk('1-3_3', 1, 3, 3, 3, 3),
    mk('4-4_0', 4, 4, 0, 4, 4),
    mk('5-5_0', 5, 5, 0, 5, 5),
    mk('6-6_0', 6, 6, 0, 6, 6),
  ];
}

describe('selectSectionMoves', () => {
  it('returns exactly the 1-3 section moves, not the 1-1/2-2/3-3 split', () => {
    const moves = selectSectionMoves(shabbat126aDoubledMoves(), section(1, 3));
    expect(moves.map((m) => m.fields.id)).toEqual(['1-3_0', '1-3_1', '1-3_2', '1-3_3']);
  });

  it('collapses a move id duplicated across partitions but keeps distinct moves', () => {
    // Section 4-4 has 4-4_0 in BOTH batches (one card) plus a genuinely
    // distinct 4-4_1 in Batch A — so the user sees two cards, not three.
    const moves = selectSectionMoves(shabbat126aDoubledMoves(), section(4, 4));
    expect(moves.map((m) => m.fields.id)).toEqual(['4-4_0', '4-4_1']);
  });

  it('returns the single opening move for the 0-0 section', () => {
    const moves = selectSectionMoves(shabbat126aDoubledMoves(), section(0, 0));
    expect(moves.map((m) => m.fields.id)).toEqual(['0-0_0']);
  });

  it('orders by moveOrder', () => {
    const moves = selectSectionMoves(
      [
        { startSegIdx: 1, endSegIdx: 1, fields: { id: 'b', sectionStartSegIdx: 1, sectionEndSegIdx: 1, moveOrder: 2 } },
        { startSegIdx: 1, endSegIdx: 1, fields: { id: 'a', sectionStartSegIdx: 1, sectionEndSegIdx: 1, moveOrder: 0 } },
        { startSegIdx: 1, endSegIdx: 1, fields: { id: 'c', sectionStartSegIdx: 1, sectionEndSegIdx: 1, moveOrder: 1 } },
      ],
      section(1, 1),
    );
    expect(moves.map((m) => m.fields.id)).toEqual(['a', 'c', 'b']);
  });

  it('falls back to range containment when no move carries an exact section ref', () => {
    // Older cached payload: moves have no sectionStartSegIdx/sectionEndSegIdx.
    const legacy: MoveLike[] = [
      { startSegIdx: 1, endSegIdx: 1, fields: { id: 'a', moveOrder: 0 } },
      { startSegIdx: 2, endSegIdx: 2, fields: { id: 'b', moveOrder: 1 } },
      { startSegIdx: 5, endSegIdx: 5, fields: { id: 'z', moveOrder: 0 } },
    ];
    const moves = selectSectionMoves(legacy, section(1, 3));
    expect(moves.map((m) => m.fields.id)).toEqual(['a', 'b']);
  });

  it('never shows a section two partitions worth of moves (no duplicate ids in output)', () => {
    for (const sec of [section(0, 0), section(1, 3), section(4, 4), section(5, 5), section(6, 6)]) {
      const ids = selectSectionMoves(shabbat126aDoubledMoves(), sec).map((m) => m.fields.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
