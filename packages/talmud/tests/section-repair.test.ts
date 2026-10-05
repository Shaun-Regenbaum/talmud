import { instanceIdOf } from '@corpus/core/cache/keys';
import { describe, expect, it } from 'vitest';
import { reanchorArgument } from '../src/lib/place/reanchor';
import {
  hasRangeFreeIdentity,
  mergeRebuiltMoves,
  pickFanOutInstances,
  remapMoveSections,
  repairArgumentSections,
} from '../src/lib/place/repair';
import { buildVerbatimGrid, findExcerpt } from '../src/lib/place/verbatim';
import { keyForGemara, keyForMark } from '../src/worker/cache-keys';
import { CODE_MARKS } from '../src/worker/code-marks';
import { readCachedResult } from '../src/worker/index';
import type { Bindings } from '../src/worker/types';
import corpus from './fixtures/section-repair-corpus.json';
import shabbat137b from './fixtures/shabbat_137b_sections.json';

type Inst = { startSegIdx: number; endSegIdx: number; fields: Record<string, unknown> };
const rangesOf = (parsed: unknown) =>
  (parsed as { instances: Inst[] }).instances.map((i) => [i.startSegIdx, i.endSegIdx]);

// Stored as the old code left it: the baraita ends at 6 (first copy of a
// repeated closing line) and the new Mishnah's start was pulled back to 7.
const stored137b = { instances: shabbat137b.instances };

describe('repairArgumentSections on Shabbat 137b as stored', () => {
  const { parsed, changes } = repairArgumentSections(stored137b, shabbat137b.segments_he);

  it('moves the Mishnah start to where its words are, and the baraita end after the Hadran', () => {
    expect(rangesOf(parsed)[2]).toEqual([5, 9]);
    expect(rangesOf(parsed)[3][0]).toBe(10);
  });

  it('reports exactly which ranges changed', () => {
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.some((c) => c.from[0] === 7 && c.to[0] === 10)).toBe(true);
  });

  it('is idempotent: repairing a repaired daf changes nothing and returns the same object', () => {
    const again = repairArgumentSections(parsed, shabbat137b.segments_he);
    expect(again.changes).toEqual([]);
    expect(again.parsed).toBe(parsed);
  });

  it('keeps every other field of every section', () => {
    const out = (parsed as { instances: Inst[] }).instances;
    expect(out.map((s) => s.fields)).toEqual(shabbat137b.instances.map((s) => s.fields));
  });
});

describe('cache identity of a repaired section', () => {
  it('a Latin-title section keeps its instance id when its range changes', async () => {
    const inst = shabbat137b.instances[3];
    expect(hasRangeFreeIdentity(inst)).toBe(true);
    expect(await instanceIdOf(inst)).toBe(await instanceIdOf({ ...inst, startSegIdx: 10 }));
  });

  it('a Hebrew-only title is keyed by its range, and is repaired like the others', async () => {
    const hebrew = structuredClone(stored137b);
    for (const i of hebrew.instances) i.fields.title = 'משנה: תולין את המשמרת';
    expect(hasRangeFreeIdentity(hebrew.instances[3] as Inst)).toBe(false);
    // the premise: that identity really does include the range, so the repaired
    // section gets a NEW id and its notes are generated afresh when opened
    const a = await instanceIdOf(hebrew.instances[3]);
    const b = await instanceIdOf({ ...hebrew.instances[3], startSegIdx: 10 });
    expect(a).not.toBe(b);
    const out = repairArgumentSections(hebrew, shabbat137b.segments_he);
    expect(rangesOf(out.parsed)[3][0]).toBe(10);
    expect(out.changes.length).toBeGreaterThan(0);
  });
});

describe('remapMoveSections', () => {
  const { changes } = repairArgumentSections(stored137b, shabbat137b.segments_he);
  const moves = { instances: shabbat137b.moves };
  const out = remapMoveSections(moves, changes) as { instances: Inst[] };

  it('points each move at its section corrected range', () => {
    const mishnahMove = out.instances[3];
    expect(mishnahMove.fields.sectionStartSegIdx).toBe(10);
  });

  it('leaves move ids alone, because a move id is its cache identity', () => {
    expect(out.instances.map((m) => m.fields.id)).toEqual(
      shabbat137b.moves.map((m) => m.fields.id),
    );
  });

  it('returns the same object when nothing matches', () => {
    expect(remapMoveSections(moves, [])).toBe(moves);
  });
});

describe('readCachedResult heals stored sections without writing or fetching', () => {
  const argDef = CODE_MARKS.find((m) => m.id === 'argument')!;
  const moveDef = CODE_MARKS.find((m) => m.id === 'argument-move')!;
  const run = (parsed: unknown, extra: Record<string, unknown> = {}) => ({
    parsed,
    content: JSON.stringify(parsed),
    ...extra,
  });
  const setup = (arg: unknown, moves: unknown) => {
    const argKey = keyForMark(argDef, 'Shabbat', '137b', 'en');
    const moveKey = keyForMark(moveDef, 'Shabbat', '137b', 'en');
    const cache = new Map<string, string>([
      [argKey, JSON.stringify(arg)],
      [moveKey, JSON.stringify(moves)],
      [keyForGemara('Shabbat', '137b'), JSON.stringify({ segments_he: shabbat137b.segments_he })],
    ]);
    const before = new Map(cache);
    // Only `get` exists: a write, or any remote fetch, fails the test.
    const env = { CACHE: { get: async (k: string) => cache.get(k) ?? null } } as Bindings;
    return { env, argKey, moveKey, cache, before };
  };

  it('repairs the argument sections and their moves together', async () => {
    const { env, argKey, moveKey, cache, before } = setup(
      run(stored137b),
      run({ instances: shabbat137b.moves }),
    );
    const arg = await readCachedResult(env, argKey);
    expect(rangesOf(arg?.parsed)[3][0]).toBe(10);
    expect(JSON.parse(arg!.content)).toEqual(arg?.parsed);
    const mv = (await readCachedResult(env, moveKey))?.parsed as { instances: Inst[] };
    expect(mv.instances[3].fields.sectionStartSegIdx).toBe(10);
    expect(cache).toEqual(before);
  });

  it('never overrides a human edit', async () => {
    const human = { provenance: { authority: 'human' } };
    const { env, argKey } = setup(run(stored137b, human), run({ instances: [] }));
    const arg = await readCachedResult(env, argKey);
    expect(rangesOf(arg?.parsed)).toEqual(rangesOf(stored137b));
  });

  it('serves the stored value untouched when the source is not cached', async () => {
    const argKey = keyForMark(argDef, 'Shabbat', '137b', 'en');
    const cache = new Map([[argKey, JSON.stringify(run(stored137b))]]);
    const env = { CACHE: { get: async (k: string) => cache.get(k) ?? null } } as Bindings;
    const arg = await readCachedResult(env, argKey);
    expect(rangesOf(arg?.parsed)).toEqual(rangesOf(stored137b));
  });
});

// A real-data guard over 14 stored dafs captured from staging before the range
// fix. Anyone who touches the re-anchorer, the tiling or the repair has to keep
// these true on real text, not just on one daf.
describe('stored dafs from staging (before the range fix)', () => {
  const firstSegWithExcerpt = (segs: string[], ex: string, from: number) =>
    findExcerpt(buildVerbatimGrid(segs), ex, from, segs.length - 1)?.seg ?? -1;

  for (const daf of corpus) {
    describe(`${daf.tractate} ${daf.page}`, () => {
      const stored = { instances: daf.instances };
      const { parsed, changes } = repairArgumentSections(stored, daf.segments_he);
      const out = (parsed as { instances: Inst[] }).instances;
      const grid = buildVerbatimGrid(daf.segments_he);
      const startOk = (s: Inst) =>
        !s.fields.excerpt ||
        !!findExcerpt(grid, s.fields.excerpt as string, s.startSegIdx, s.startSegIdx);

      it('no section starts before a segment that holds its own opening words', () => {
        // The bug: opening words are in a LATER segment than the section's start.
        for (const s of out) {
          if (startOk(s)) continue;
          const ex = s.fields.excerpt as string;
          expect(firstSegWithExcerpt(daf.segments_he, ex, s.startSegIdx), ex).toBe(-1);
        }
      });

      it('is a clean partition', () => {
        for (let i = 1; i < out.length; i++) {
          expect(out[i].startSegIdx).toBe(out[i - 1].endSegIdx + 1);
        }
        for (const s of out) expect(s.endSegIdx).toBeGreaterThanOrEqual(s.startSegIdx);
      });

      it('never makes a start worse, and is idempotent', () => {
        const worse = daf.instances.filter((s, i) => startOk(s as Inst) && !startOk(out[i]));
        expect(worse).toEqual([]);
        expect(repairArgumentSections(parsed, daf.segments_he).changes).toEqual([]);
        expect(changes.length).toBeLessThanOrEqual(daf.instances.length);
      });

      it('agrees with a fresh generation of the same sections', () => {
        // Repair and first-time anchoring must not disagree, or the page would
        // change shape the day a daf is regenerated.
        const fresh = reanchorArgument(structuredClone(stored), daf.segments_he);
        expect(rangesOf(parsed)).toEqual(rangesOf(fresh));
      });
    });
  }
});

describe('pickFanOutInstances', () => {
  const secs = [
    { startSegIdx: 0, endSegIdx: 0 },
    { startSegIdx: 1, endSegIdx: 4 },
    { startSegIdx: 5, endSegIdx: 9 },
  ];
  it('keeps everything when no filter is set', () => {
    expect(pickFanOutInstances(secs, undefined)).toEqual(secs);
  });
  it('keeps only the named sections', () => {
    expect(pickFanOutInstances(secs, new Set(['5-9']))).toEqual([secs[2]]);
  });
  it('drops an instance with no usable range', () => {
    expect(pickFanOutInstances([{ startSegIdx: 'x' }, secs[0]] as never, new Set(['0-0']))).toEqual(
      [secs[0]],
    );
  });
});

describe('mergeRebuiltMoves', () => {
  const mv = (s: number, e: number, order: number, tag: string) => ({
    startSegIdx: s,
    endSegIdx: s,
    fields: {
      id: `${s}-${e}_${order}`,
      sectionStartSegIdx: s,
      sectionEndSegIdx: e,
      moveOrder: order,
      tag,
    },
  });
  const stored = {
    instances: [
      mv(0, 0, 0, 'keep-a'),
      mv(5, 6, 0, 'old-b'),
      mv(7, 10, 0, 'old-c'),
      mv(11, 16, 0, 'keep-d'),
    ],
  };
  const changes = [
    { from: [5, 6] as [number, number], to: [5, 9] as [number, number] },
    { from: [7, 10] as [number, number], to: [10, 10] as [number, number] },
  ];
  const fresh = {
    instances: [mv(5, 9, 0, 'new-b'), mv(5, 9, 1, 'new-b2'), mv(10, 10, 0, 'new-c')],
  };
  const out = mergeRebuiltMoves(stored, fresh, changes) as { instances: ReturnType<typeof mv>[] };

  it('replaces the moves of the changed sections and keeps the rest untouched', () => {
    expect(out.instances.map((m) => m.fields.tag)).toEqual([
      'keep-a',
      'new-b',
      'new-b2',
      'new-c',
      'keep-d',
    ]);
  });

  it('keeps unchanged sections byte-for-byte (same objects)', () => {
    expect(out.instances[0]).toBe(stored.instances[0]);
    expect(out.instances[4]).toBe(stored.instances[3]);
  });

  it('returns the stored value when the fresh result is unusable', () => {
    expect(mergeRebuiltMoves(stored, null, changes)).toBe(stored);
  });
});
