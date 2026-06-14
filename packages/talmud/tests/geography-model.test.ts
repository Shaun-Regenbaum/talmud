import { describe, expect, it } from 'vitest';
import {
  buildGeoModel,
  deriveMoveDirection,
  type GeoEnrichment,
  matchCity,
  orderBySeq,
  placeRabbi,
  type RabbiGeoSource,
  regionFromGeneration,
} from '../src/lib/geographyModel';

const geo = (g: Partial<GeoEnrichment>): GeoEnrichment => ({
  primaryStudyPlaces: [],
  notablePlaces: [],
  movements: [],
  ...g,
});

describe('matchCity', () => {
  it('matches canonical names, aliases, and Hebrew names', () => {
    expect(matchCity('Sura')?.name).toBe('Sura');
    expect(matchCity('sepphoris')?.name).toBe('Tzipori');
    expect(matchCity('Zippori')?.name).toBe('Tzipori');
    expect(matchCity('Mechuza')?.name).toBe('Mehoza');
    expect(matchCity('Lydda')?.name).toBe('Lod');
    expect(matchCity('Acre')?.name).toBe('Akko');
    expect(matchCity(undefined, 'פומבדיתא')?.name).toBe('Pumbedita');
  });

  it('is resilient to apostrophes and diacritics', () => {
    expect(matchCity("Neharde'a")?.name).toBe('Nehardea');
    expect(matchCity('Maḥoza')?.name).toBe('Mehoza');
    expect(matchCity('Pekiin')?.name).toBe("Peki'in");
    expect(matchCity("Beit She'arim")?.name).toBe("Beit She'arim");
  });

  it('returns null for unknown / out-of-region places', () => {
    expect(matchCity('Rome')).toBeNull();
    expect(matchCity('Radun')).toBeNull();
    expect(matchCity('')).toBeNull();
  });
});

describe('regionFromGeneration', () => {
  it('maps Eretz-Yisrael tiers to israel', () => {
    expect(regionFromGeneration('amora-ey-1')).toBe('israel');
    expect(regionFromGeneration('amora-ey-5')).toBe('israel');
    expect(regionFromGeneration('tanna-4')).toBe('israel');
    expect(regionFromGeneration('zugim')).toBe('israel');
  });
  it('maps Babylonian tiers (incl. geonim) to bavel', () => {
    expect(regionFromGeneration('amora-bavel-3')).toBe('bavel');
    expect(regionFromGeneration('savora')).toBe('bavel');
    expect(regionFromGeneration('geonim')).toBe('bavel');
  });
  it('returns null for later / unknown / missing generations', () => {
    expect(regionFromGeneration('rishonim')).toBeNull();
    expect(regionFromGeneration('achronim')).toBeNull();
    expect(regionFromGeneration('unknown')).toBeNull();
    expect(regionFromGeneration(null)).toBeNull();
    expect(regionFromGeneration(undefined)).toBeNull();
  });
});

describe('placeRabbi', () => {
  it('prefers the registry identity over the AI enrichment', () => {
    const src: RabbiGeoSource = {
      name: 'Rav Huna',
      identity: { places: ['Sura'] },
      geography: geo({ primaryStudyPlaces: [{ place: 'Pumbedita' }] }),
    };
    expect(placeRabbi(src)?.name).toBe('Sura');
  });

  it('falls back through study places, birthplace, notable places', () => {
    expect(
      placeRabbi({
        name: 'A',
        geography: geo({ primaryStudyPlaces: [{ place: 'Tiberias' }] }),
      })?.name,
    ).toBe('Tiberias');
    expect(
      placeRabbi({
        name: 'B',
        geography: geo({ birthplace: { place: 'Lod', region: 'israel' } }),
      })?.name,
    ).toBe('Lod');
    expect(
      placeRabbi({
        name: 'C',
        geography: geo({ notablePlaces: [{ place: 'Nehardea', event: 'taught there' }] }),
      })?.name,
    ).toBe('Nehardea');
  });

  it('skips unmatchable places to find a later match', () => {
    const src: RabbiGeoSource = {
      name: 'D',
      identity: { places: ['Rome'] },
      geography: geo({ primaryStudyPlaces: [{ place: 'Yavneh' }] }),
    };
    expect(placeRabbi(src)?.name).toBe('Yavneh');
  });
});

describe('deriveMoveDirection', () => {
  it('derives direction from region-crossing movements only', () => {
    expect(deriveMoveDirection(geo({ movements: [{ from: 'Bavel', to: 'Eretz Yisrael' }] }))).toBe(
      'bavel->israel',
    );
    expect(deriveMoveDirection(geo({ movements: [{ from: 'Tiberias', to: 'Sura' }] }))).toBe(
      'israel->bavel',
    );
    expect(
      deriveMoveDirection(
        geo({
          movements: [
            { from: 'Sura', to: 'Tiberias' },
            { from: 'Tiberias', to: 'Pumbedita' },
          ],
        }),
      ),
    ).toBe('both');
    // Local move within one region: no direction.
    expect(deriveMoveDirection(geo({ movements: [{ from: 'Sura', to: 'Pumbedita' }] }))).toBeNull();
    expect(deriveMoveDirection(null)).toBeNull();
  });
});

describe('buildGeoModel', () => {
  it('merges rabbi placement with on-daf mention counts', () => {
    const model = buildGeoModel(
      [
        { name: 'Rav Huna', identity: { places: ['Sura'], region: 'bavel' } },
        { name: 'Rav Chisda', identity: { places: ['Sura'], region: 'bavel' } },
        {
          name: 'Rabbi Yochanan',
          geography: geo({ primaryStudyPlaces: [{ place: 'Tiberias' }] }),
        },
      ],
      [
        { name: 'Sura' },
        { nameHe: 'סורא' },
        { name: 'Pumbedita' }, // mention-only city: dot with no rabbis
        { name: 'Sepphoris' }, // alias mention: dot is canonical Tzipori
      ],
    );
    const sura = model.dots.find((d) => d.city.name === 'Sura');
    expect(sura?.rabbis).toEqual([
      { name: 'Rav Chisda', slug: null },
      { name: 'Rav Huna', slug: null },
    ]);
    expect(sura?.mentions).toBe(2);
    // Raw mention names preserved (the .city-marker spans carry these);
    // the nameHe-only mention counts but contributes no raw name.
    expect(sura?.mentionNames).toEqual(['Sura']);
    const pumbedita = model.dots.find((d) => d.city.name === 'Pumbedita');
    expect(pumbedita?.rabbis).toEqual([]);
    expect(pumbedita?.mentions).toBe(1);
    const tzipori = model.dots.find((d) => d.city.name === 'Tzipori');
    expect(tzipori?.mentions).toBe(1);
    expect(tzipori?.mentionNames).toEqual(['Sepphoris']);
    const tiberias = model.dots.find((d) => d.city.name === 'Tiberias');
    expect(tiberias?.rabbis).toEqual([{ name: 'Rabbi Yochanan', slug: null }]);
    expect(tiberias?.mentionNames).toEqual([]);
    expect(model.israelCount).toBe(1);
    expect(model.bavelCount).toBe(2);
    expect(model.empty).toBe(false);
  });

  it('buckets region-only rabbis as unspecified', () => {
    const model = buildGeoModel(
      [
        { name: 'X', identity: { region: 'israel' } },
        { name: 'Y', geography: geo({ birthplace: { place: '', region: 'bavel' } }) },
        { name: 'Z' }, // nothing known: skipped
      ],
      [],
    );
    expect(model.unspecifiedIsrael).toEqual([{ name: 'X', slug: null }]);
    expect(model.unspecifiedBavel).toEqual([{ name: 'Y', slug: null }]);
    expect(model.dots).toEqual([]);
    expect(model.israelCount).toBe(1);
    expect(model.bavelCount).toBe(1);
    expect(model.empty).toBe(false);
  });

  it('buckets ungrounded rabbis by generation when no place/region is known', () => {
    const model = buildGeoModel(
      [
        // No registry place, no region, no enrichment — only a generation. The
        // generation fallback now keeps them on the map instead of dropping.
        { name: 'Bavli Amora', generation: 'amora-bavel-3' },
        { name: 'EY Amora', generation: 'amora-ey-2' },
        { name: 'A Tanna', generation: 'tanna-4' },
        { name: 'A Gaon', generation: 'geonim' },
        // unknown / later authority → still dropped (no region).
        { name: 'Anonymous', generation: 'unknown' },
        { name: 'A Rishon', generation: 'rishonim' },
        { name: 'No Generation' },
      ],
      [],
    );
    expect(model.unspecifiedBavel).toEqual([
      { name: 'A Gaon', slug: null },
      { name: 'Bavli Amora', slug: null },
    ]);
    expect(model.unspecifiedIsrael).toEqual([
      { name: 'A Tanna', slug: null },
      { name: 'EY Amora', slug: null },
    ]);
    expect(model.dots).toEqual([]);
    expect(model.bavelCount).toBe(2);
    expect(model.israelCount).toBe(2);
    expect(model.empty).toBe(false);
  });

  it('a daf of only unknown-generation rabbis is still empty', () => {
    const model = buildGeoModel(
      [
        { name: 'Anonymous A', generation: 'unknown' },
        { name: 'Anonymous B', generation: 'rishonim' },
        { name: 'Anonymous C' },
      ],
      [],
    );
    expect(model.empty).toBe(true);
  });

  it('registry region/place still wins over the generation fallback', () => {
    // A Babylonian-generation rabbi the registry places in Eretz Yisrael: the
    // identity (place/region) is checked first, so generation never overrides.
    const placed = buildGeoModel(
      [{ name: 'P', identity: { places: ['Tiberias'] }, generation: 'amora-bavel-3' }],
      [],
    );
    expect(placed.dots.find((d) => d.city.name === 'Tiberias')?.rabbis).toEqual([
      { name: 'P', slug: null },
    ]);
    const regioned = buildGeoModel(
      [{ name: 'R', identity: { region: 'israel' }, generation: 'amora-bavel-3' }],
      [],
    );
    expect(regioned.unspecifiedIsrael).toEqual([{ name: 'R', slug: null }]);
    expect(regioned.unspecifiedBavel).toEqual([]);
  });

  it('builds migration rows — registry moved wins over derived', () => {
    const model = buildGeoModel(
      [
        {
          name: 'Rabbi Zeira',
          identity: { moved: 'bavel->israel' },
          // Derivation would say israel->bavel; the registry verdict wins.
          geography: geo({ movements: [{ from: 'Tiberias', to: 'Sura' }] }),
        },
        {
          name: 'Rav Dimi',
          geography: geo({ movements: [{ from: 'Bavel', to: 'Eretz Yisrael' }] }),
        },
      ],
      [],
    );
    expect(model.moverRows).toEqual([
      { name: 'Rabbi Zeira', slug: null, direction: 'bavel->israel' },
      { name: 'Rav Dimi', slug: null, direction: 'bavel->israel' },
    ]);
  });

  it('dedups rabbis by slug ?? normalized name (dedupRabbiList identity rule)', () => {
    // Slugless repeats of one display name collapse to one dot entry.
    const slugless = buildGeoModel(
      [
        { name: 'Rav Huna', identity: { places: ['Sura'] } },
        { name: 'Rav Huna', identity: { places: ['Sura'] } },
      ],
      [],
    );
    expect(slugless.dots[0].rabbis).toEqual([{ name: 'Rav Huna', slug: null }]);
    expect(slugless.bavelCount).toBe(1);

    // Same slug twice collapses even when display spelling varies.
    const sameSlug = buildGeoModel(
      [
        { name: 'Rav Kahana', slug: 'rav-kahana-ii', identity: { places: ['Pumbedita'] } },
        { name: 'Rav Kahana', slug: 'rav-kahana-ii', identity: { places: ['Pumbedita'] } },
      ],
      [],
    );
    expect(sameSlug.dots[0].rabbis).toEqual([{ name: 'Rav Kahana', slug: 'rav-kahana-ii' }]);

    // HOMONYMS — same display name, different slugs — stay distinct (the
    // upstream dedupRabbiList deliberately keeps both; collapsing here by
    // display name would merge two different rabbis into one dot).
    const homonyms = buildGeoModel(
      [
        { name: 'Rav Kahana', slug: 'rav-kahana-i', identity: { places: ['Sura'] } },
        { name: 'Rav Kahana', slug: 'rav-kahana-ii', identity: { places: ['Pumbedita'] } },
      ],
      [],
    );
    const allRabbis = homonyms.dots.flatMap((d) => d.rabbis);
    expect(allRabbis).toHaveLength(2);
    expect(new Set(allRabbis.map((r) => r.slug))).toEqual(
      new Set(['rav-kahana-i', 'rav-kahana-ii']),
    );
    expect(homonyms.bavelCount).toBe(2);
  });

  it('reports empty when nothing is placeable', () => {
    expect(buildGeoModel([], []).empty).toBe(true);
    expect(buildGeoModel([{ name: 'Nobody' }], [{ name: 'Atlantis' }]).empty).toBe(true);
  });
});

describe('orderBySeq', () => {
  it('sorts by seq when every item has one', () => {
    const items = [
      { id: 'notable', seq: 4 },
      { id: 'birth', seq: 0 },
      { id: 'moved', seq: 2 },
      { id: 'study', seq: 1 },
    ];
    expect(orderBySeq(items).map((i) => i.id)).toEqual(['birth', 'study', 'moved', 'notable']);
  });

  it('keeps insertion order when ANY item is missing seq (pre-v4 cached values)', () => {
    const items = [
      { id: 'birth', seq: 0 },
      { id: 'study' }, // no seq
      { id: 'moved', seq: 2 },
    ];
    expect(orderBySeq(items).map((i) => i.id)).toEqual(['birth', 'study', 'moved']);
  });

  it('is stable for equal seqs and does not mutate the input', () => {
    const items = [
      { id: 'a', seq: 1 },
      { id: 'b', seq: 1 },
      { id: 'c', seq: 0 },
    ];
    expect(orderBySeq(items).map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']); // original untouched
  });
});
