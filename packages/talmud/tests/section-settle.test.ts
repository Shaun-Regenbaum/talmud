import { instanceIdOf } from '@corpus/core/cache/keys';
import { describe, expect, it } from 'vitest';
import { keyForEnrichment, keyForGemara, keyForMark } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';
import { settleRepairedSections } from '../src/worker/index';
import type { Bindings } from '../src/worker/types';
import shabbat137b from './fixtures/shabbat_137b_sections.json';

const argDef = CODE_MARKS.find((m) => m.id === 'argument')!;
const perSection = CODE_ENRICHMENTS.filter(
  (e) => e.scope === 'local' && e.target_mark === 'argument' && !e.id.includes('.qa'),
);
const run = (parsed: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ parsed, content: JSON.stringify(parsed), ...extra });

async function setup(
  opts: { argHuman?: boolean; noteHuman?: boolean; env?: Partial<Bindings> } = {},
) {
  const cache = new Map<string, string>();
  cache.set(
    keyForMark(argDef, 'Shabbat', '137b', 'en'),
    run(
      { instances: shabbat137b.instances },
      opts.argHuman ? { provenance: { authority: 'human' } } : {},
    ),
  );
  cache.set(
    keyForGemara('Shabbat', '137b'),
    JSON.stringify({ segments_he: shabbat137b.segments_he }),
  );
  // one stored note per section per per-section enrichment
  const noteKeys: { idx: number; key: string }[] = [];
  for (const [idx, inst] of shabbat137b.instances.entries()) {
    const iid = await instanceIdOf(inst);
    for (const def of perSection) {
      const key = keyForEnrichment(
        def,
        iid,
        { tractate: 'Shabbat', page: '137b' },
        undefined,
        'en',
      );
      cache.set(
        key,
        run(
          { text: 'note' },
          opts.noteHuman && idx === 3 ? { provenance: { authority: 'human' } } : {},
        ),
      );
      noteKeys.push({ idx, key });
    }
  }
  const kv = {
    get: async (k: string) => cache.get(k) ?? null,
    put: async (k: string, v: string) => {
      cache.set(k, v);
    },
    delete: async (k: string) => {
      cache.delete(k);
    },
  };
  const env = { CACHE: kv, ...opts.env } as unknown as Bindings;
  return { env, cache, noteKeys };
}

describe('settleRepairedSections', () => {
  it('has per-section enrichments to settle (guards the filter)', () => {
    expect(perSection.length).toBeGreaterThan(0);
  });

  it('drops the notes of the sections whose range changed, and only those', async () => {
    const { env, cache, noteKeys } = await setup();
    const dropped = await settleRepairedSections(env, 'Shabbat', '137b', 'en');
    expect(dropped).toBeGreaterThan(0);
    // sections 2 (baraita, end moved) and 3 (new Mishnah, start moved) changed
    for (const { idx, key } of noteKeys) {
      expect(cache.has(key), `section ${idx}`).toBe(![2, 3].includes(idx));
    }
  });

  it('does it once: a regenerated note is not dropped again', async () => {
    const { env, cache, noteKeys } = await setup();
    await settleRepairedSections(env, 'Shabbat', '137b', 'en');
    const regenerated = noteKeys.find((n) => n.idx === 3)!.key;
    cache.set(regenerated, run({ text: 'fresh' }));
    expect(await settleRepairedSections(env, 'Shabbat', '137b', 'en')).toBe(0);
    expect(cache.has(regenerated)).toBe(true);
  });

  it('never drops a note a human wrote', async () => {
    const { env, cache, noteKeys } = await setup({ noteHuman: true });
    await settleRepairedSections(env, 'Shabbat', '137b', 'en');
    const humanKeys = noteKeys.filter((n) => n.idx === 3);
    expect(humanKeys.every((n) => cache.has(n.key))).toBe(true);
  });

  it('does nothing when the argument sections were human-edited', async () => {
    const { env, cache, noteKeys } = await setup({ argHuman: true });
    const before = new Map(cache);
    expect(await settleRepairedSections(env, 'Shabbat', '137b', 'en')).toBe(0);
    expect(cache).toEqual(before);
    expect(noteKeys.every((n) => cache.has(n.key))).toBe(true);
  });

  it('does nothing while generation is switched off: notes that cannot be rebuilt are kept', async () => {
    const { env, cache } = await setup({ env: { GENERATION_DISABLED: '1' } });
    const before = new Map(cache);
    expect(await settleRepairedSections(env, 'Shabbat', '137b', 'en')).toBe(0);
    expect(cache).toEqual(before); // no deletes, and no marker written either
  });

  it('does nothing on a daf whose ranges need no repair', async () => {
    const { env, cache } = await setup();
    // store the already-correct ranges
    const fixed = JSON.parse(cache.get(keyForMark(argDef, 'Shabbat', '137b', 'en'))!);
    fixed.parsed.instances = fixed.parsed.instances.map(
      (s: { startSegIdx: number }, i: number) => ({
        ...s,
        ...[
          [0, 0],
          [1, 4],
          [5, 9],
          [10, 10],
          [11, 16],
          [17, 18],
        ].map(([a, b]) => ({ startSegIdx: a, endSegIdx: b }))[i],
      }),
    );
    cache.set(keyForMark(argDef, 'Shabbat', '137b', 'en'), JSON.stringify(fixed));
    const before = new Map(cache);
    expect(await settleRepairedSections(env, 'Shabbat', '137b', 'en')).toBe(0);
    expect(cache).toEqual(before);
  });
});
