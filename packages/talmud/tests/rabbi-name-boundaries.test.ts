import { describe, expect, it } from 'vitest';
import { filterRabbiBoundaries, nameCrossesBoundary } from '../src/lib/rabbi/nameBoundaries';
import { keyForGemara, keyForMark, keyForSefariaSegments } from '../src/worker/cache-keys';
import { CODE_MARKS } from '../src/worker/code-marks';
import { augmentWithKnownRabbis, postProcessRabbi, readCachedResult } from '../src/worker/index';
import type { Bindings } from '../src/worker/types';
import fixture from './fixtures/shabbat-55b-rabbi-boundaries.json';

const source = fixture.cachedSource.segments_he.join('\n');

describe('cached rabbi corrections', () => {
  it.each(['en', 'he'] as const)(
    'corrects an existing %s cache entry without writing it',
    async (lang) => {
      const def = CODE_MARKS.find((m) => m.id === 'rabbi')!;
      const key = keyForMark(def, 'Shabbat', '55b', lang);
      const cache = new Map([
        [key, JSON.stringify(fixture.cachedResult)],
        [keyForGemara('Shabbat', '55b'), JSON.stringify(fixture.cachedSource)],
      ]);
      const before = new Map(cache);
      // Only recorded data is served. A write or an unexpected source fetch fails.
      const env = { CACHE: { get: async (k: string) => cache.get(k) ?? null } } as Bindings;
      const result = await readCachedResult(env, key);
      expect(result?.parsed).toEqual(filterRabbiBoundaries(fixture.cachedResult.parsed, source));
      expect(JSON.parse(result!.content)).toEqual(result?.parsed);
      expect(cache).toEqual(before);
    },
  );

  it('uses the reader source after the generation slice expires', async () => {
    const def = CODE_MARKS.find((m) => m.id === 'rabbi')!;
    const key = keyForMark(def, 'Shabbat', '55b');
    const cache = new Map([
      [key, JSON.stringify(fixture.cachedResult)],
      [
        keyForSefariaSegments('Shabbat', '55b'),
        JSON.stringify({ he: fixture.cachedSource.segments_he }),
      ],
    ]);
    const env = { CACHE: { get: async (k: string) => cache.get(k) ?? null } } as Bindings;
    const result = await readCachedResult(env, key);
    expect(result?.parsed).toEqual(filterRabbiBoundaries(fixture.cachedResult.parsed, source));
  });
});

describe('Shabbat 55b: Rav speaks about Pinchas', () => {
  it.each([12, 13])('keeps the speaker separate from the statement in segment %i', (segment) => {
    const crosses = nameCrossesBoundary(fixture.cachedSource.segments_he[segment]);
    expect(crosses('רב פנחס')).toBe(true);
    expect(crosses('רב')).toBe(false);
  });

  it('does not add Rav Pinchas while scanning the unpunctuated printed text', () => {
    const names = augmentWithKnownRabbis([], fixture.cachedSource.hebrew, source).map(
      (r) => r.nameHe,
    );
    expect(names).not.toContain('רב פנחס');
  });

  it('removes the old false match without changing the other cached instances', () => {
    const before = structuredClone(fixture.cachedResult.parsed);
    const corrected = filterRabbiBoundaries(fixture.cachedResult.parsed, source);
    expect(corrected.instances).toEqual(
      before.instances.filter((i) => i.fields.slug !== 'rav-pinchas'),
    );
    expect(corrected.instances.some((i) => i.fields.slug === 'rav')).toBe(true);
    expect(fixture.cachedResult.parsed).toEqual(before);
    expect(filterRabbiBoundaries(corrected, source)).toBe(corrected);
  });

  it('does not reintroduce the false match during post-processing', () => {
    const corrected = postProcessRabbi(
      fixture.cachedResult.parsed,
      fixture.cachedSource.hebrew,
      source,
    ) as typeof fixture.cachedResult.parsed;
    expect(corrected.instances.some((i) => i.fields.name === 'Rav Pinchas')).toBe(false);
    expect(corrected.instances.some((i) => i.fields.name === 'Rav')).toBe(true);
  });

  it('keeps genuine Rav Pinchas mentions from Shabbat 46b', () => {
    const text = fixture.genuinePinchas.segmentsHe.join('\n');
    expect(text.length).toBeGreaterThan(0);
    expect(nameCrossesBoundary(text)('רב פנחס')).toBe(false);
    expect(augmentWithKnownRabbis([], text).some((r) => r.nameHe === 'רב פנחס')).toBe(true);
  });

  it('leaves names alone when the punctuated source is unavailable', () => {
    expect(filterRabbiBoundaries(fixture.cachedResult.parsed, '')).toBe(
      fixture.cachedResult.parsed,
    );
    expect(filterRabbiBoundaries(fixture.cachedResult.parsed, fixture.cachedSource.hebrew)).toBe(
      fixture.cachedResult.parsed,
    );
  });
});
