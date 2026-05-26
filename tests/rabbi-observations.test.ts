import { describe, it, expect } from 'vitest';
import {
  buildObservationSlices,
  resolveSegIdxs,
  normalizeForMatch,
  type JoinInput,
  type ResolvedRabbi,
  type RangeItem,
} from '../src/worker/rabbi-observations';

function rabbi(p: Partial<ResolvedRabbi> & Pick<ResolvedRabbi, 'slug' | 'name' | 'segIdxs'>): ResolvedRabbi {
  return { nameHe: '', generation: 'unknown', location: null, ...p };
}
function range(startSegIdx: number, endSegIdx: number, fields: Record<string, unknown>): RangeItem {
  return { startSegIdx, endSegIdx, fields };
}
function base(over: Partial<JoinInput>): JoinInput {
  return {
    tractate: 'Berakhot', page: '2a', defHash: '1', computedAt: '2026-01-01T00:00:00Z',
    rabbis: [], places: [], moves: [], aggadata: [], pesukim: [],
    ...over,
  };
}

describe('resolveSegIdxs', () => {
  it('returns every segment whose normalized Hebrew contains the needle', () => {
    const segs = ['shalom aleichem', 'rabbi eliezer omer', 'rabbi eliezer shuv'].map(normalizeForMatch);
    expect(resolveSegIdxs('eliezer', segs)).toEqual([1, 2]);
    expect(resolveSegIdxs('shalom', segs)).toEqual([0]);
    expect(resolveSegIdxs('nobody', segs)).toEqual([]);
  });

  it('matches across nikkud and punctuation differences', () => {
    const segs = ['אָמַר רַבִּי אֱלִיעֶזֶר', 'תָּנוּ רַבָּנַן'].map(normalizeForMatch);
    // needle has no nikkud; segment does — normalization strips it on both sides.
    expect(resolveSegIdxs('אליעזר', segs)).toEqual([0]);
    expect(resolveSegIdxs('', segs)).toEqual([]);
  });
});

describe('buildObservationSlices — attribution + confidence', () => {
  const R1 = rabbi({ slug: 'eliezer', name: 'Rabbi Eliezer', nameHe: 'אליעזר', segIdxs: [2], location: { place: 'Lod' } });
  const R2 = rabbi({ slug: 'yehoshua', name: 'Rabbi Yehoshua', nameHe: 'יהושע', segIdxs: [5] });
  const R_NOSLUG = rabbi({ slug: '', name: 'Unknown', segIdxs: [2] });

  const input = base({
    rabbis: [R1, R2, R_NOSLUG],
    places: [
      { name: 'Lod', nameHe: 'לוד', segIdxs: [2] },
      { name: 'Yavne', nameHe: 'יבנה', segIdxs: [9] },
    ],
    moves: [
      range(1, 3, { id: 'm1', role: 'question', summary: 's1', rabbiNames: ['Rabbi Eliezer', 'Rabbi Yehoshua'] }),
      range(4, 6, { id: 'm2', role: 'answer', summary: 's2', rabbiNames: [] }),
    ],
    aggadata: [range(1, 3, { title: 'A story', theme: 'humility' })],
    pesukim: [range(4, 6, { verseRef: 'Genesis 1:1' })],
  });

  const slices = buildObservationSlices(input);
  const byslug = (s: string) => slices.find((x) => x.slug === s)!;

  it('skips rabbis without a resolvable slug', () => {
    expect(slices.map((s) => s.slug).sort()).toEqual(['eliezer', 'yehoshua']);
  });

  it('emits a high-confidence place from rabbi.location and dedups the same place from the places mark', () => {
    const lod = byslug('eliezer').observations.filter((o) => o.type === 'place' && (o.payload as { place?: string }).place === 'Lod');
    // Lod arrives both from rabbi.location (high) and the places mark (would be
    // medium, sharing move M1's range); dedup keeps a single high entry.
    expect(lod).toHaveLength(1);
    expect(lod[0].confidence).toBe('high');
    expect(lod[0].source).toBe('rabbi.location');
  });

  it('emits low-confidence place for a place that shares no range with the rabbi', () => {
    const yavne = byslug('eliezer').observations.find((o) => o.type === 'place' && (o.payload as { name?: string }).name === 'Yavne');
    expect(yavne?.confidence).toBe('low');
  });

  it('opinion is high when the move names the rabbi, medium on bare segment containment', () => {
    const e = byslug('eliezer').observations.filter((o) => o.type === 'opinion');
    expect(e).toHaveLength(1);
    expect(e[0].confidence).toBe('high'); // named in m1

    const y = byslug('yehoshua').observations.filter((o) => o.type === 'opinion');
    // m1 names Yehoshua (high) and m2 contains seg 5 (medium).
    expect(y.map((o) => o.confidence).sort()).toEqual(['high', 'medium']);
  });

  it('attributes a story only to a rabbi within its segment range', () => {
    expect(byslug('eliezer').observations.some((o) => o.type === 'story')).toBe(true); // seg 2 in [1,3]
    expect(byslug('yehoshua').observations.some((o) => o.type === 'story')).toBe(false); // seg 5 not in [1,3]
  });

  it('attributes exegesis only to a rabbi within the citation range', () => {
    expect(byslug('yehoshua').observations.some((o) => o.type === 'exegesis')).toBe(true); // seg 5 in [4,6]
    expect(byslug('eliezer').observations.some((o) => o.type === 'exegesis')).toBe(false);
  });

  it('records high-confidence lineage when two rabbis are named in the same move', () => {
    const lin = byslug('eliezer').observations.find((o) => o.type === 'lineage');
    expect(lin?.confidence).toBe('high');
    expect((lin?.payload as { slug?: string }).slug).toBe('yehoshua');
  });
});

describe('buildObservationSlices — lineage noise control', () => {
  it('does NOT record lineage for rabbis that only share the daf (no shared range, not co-named)', () => {
    const A = rabbi({ slug: 'a', name: 'Rabbi A', segIdxs: [0] });
    const B = rabbi({ slug: 'b', name: 'Rabbi B', segIdxs: [20] });
    const slices = buildObservationSlices(base({
      rabbis: [A, B],
      moves: [range(0, 1, { id: 'm', rabbiNames: ['Rabbi A'] })], // only A is near/named
    }));
    expect(slices.find((s) => s.slug === 'a')!.observations.some((o) => o.type === 'lineage')).toBe(false);
    expect(slices.find((s) => s.slug === 'b')!.observations.some((o) => o.type === 'lineage')).toBe(false);
  });
});
