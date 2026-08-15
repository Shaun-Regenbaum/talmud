import { describe, expect, it } from 'vitest';
import { type GazetteerHit, locatePlaces } from '../src/lib/geography';
import { lookupPlace } from '../src/worker/gazetteer';

/** A stand-in gazetteer with the two shapes that matter: several names for one
 *  entry, and two DIFFERENT entries the data happens to put at one point. */
const ENTRIES: Record<string, GazetteerHit> = {
  ai: { name: 'Ai 1', lat: 31.9169, lng: 35.2611 },
  aiath: { name: 'Ai 1', lat: 31.9169, lng: 35.2611 },
  babylon: { name: 'Babylon 1', lat: 32.5433, lng: 44.4222 },
  havilah: { name: 'Havilah 1', lat: 32.5433, lng: 44.4222 },
};
const fake = (name: string): GazetteerHit | null => ENTRIES[name.toLowerCase()] ?? null;

describe('locating a chapter’s named places', () => {
  it('keeps two different places that the gazetteer puts at one point', () => {
    // The regression: keying dedupe on `lat,lng` dropped the second and third
    // of any places the gazetteer files at one point — e.g. Joshua 19's
    // Beer-sheba / Hazar-shual / Eltolad, three distinct towns of the tribal
    // allotment that all sit at 31.2447, 34.8408.
    const places = locatePlaces([{ en: 'Babylon' }, { en: 'Havilah' }], fake);
    expect(places.map((p) => p.en)).toEqual(['Babylon', 'Havilah']);
  });

  it('collapses two names for the same gazetteer entry to one pin', () => {
    const places = locatePlaces([{ en: 'Ai', verses: [1] }, { en: 'Aiath' }], fake);
    expect(places).toEqual([{ en: 'Ai', he: '', lat: 31.9169, lng: 35.2611, verses: [1] }]);
  });

  it('caps the map so a town-list chapter stays readable', () => {
    // The producer is asked for at most 40, but on the deployed path that is
    // prompt guidance rather than an enforced grammar — so the cap has to hold
    // here too. Joshua 15 names well over a hundred towns.
    const many = Array.from({ length: 60 }, (_, i) => ({ en: `Town ${i}` }));
    const lookupAll = (name: string): GazetteerHit => ({ name, lat: 31 + Math.random(), lng: 35 });
    expect(locatePlaces(many, lookupAll)).toHaveLength(40);
    expect(locatePlaces(many, lookupAll, 5)).toHaveLength(5);
  });

  it('omits a place it cannot locate rather than guessing', () => {
    expect(locatePlaces([{ en: 'Nowhere-in-particular' }, { en: 'Ai' }], fake)).toHaveLength(1);
  });

  it('drops junk: no name, no verses, nothing to map', () => {
    expect(locatePlaces([{ en: '  ' }, { he: 'עַי' }], fake)).toEqual([]);
    expect(locatePlaces(undefined, fake)).toEqual([]);
    // Verse numbers are filtered to real ones.
    expect(locatePlaces([{ en: 'Ai', verses: [0, 2, -1, 3.5 as number] }], fake)[0].verses).toEqual(
      [2],
    );
  });

  it('reads the real gazetteer for the places these rules were written from', () => {
    // Not a rare accident: 774 of the gazetteer's 1330 entries sit on a
    // coordinate shared with another (the Jerusalem point alone carries 57,
    // every gate and quarter of the city). Deduping on the coordinate threw
    // away real places by the dozen — these three towns of Simeon's allotment
    // are a live example, and only Beer-sheba used to survive Joshua 19.
    const simeon = ['Beer-sheba', 'Hazar-shual', 'Eltolad'];
    const points = new Set(simeon.map((n) => `${lookupPlace(n)?.lat},${lookupPlace(n)?.lng}`));
    expect(points.size).toBe(1);
    expect(
      locatePlaces(
        simeon.map((en) => ({ en })),
        lookupPlace,
      ),
    ).toHaveLength(3);
    // Two names for one entry still collapse.
    expect(locatePlaces([{ en: 'Salt Sea' }, { en: 'Dead Sea' }], lookupPlace)).toHaveLength(1);
    expect(locatePlaces([{ en: 'Kiriath-arba' }, { en: 'Hebron' }], lookupPlace)).toHaveLength(1);
    // The accepted cost of entry-granularity: OpenBible files a few alias pairs
    // as separate entries at one site, so these draw two (spiralled) pins
    // rather than one. Cosmetic, and both names are genuinely in the text.
    expect(locatePlaces([{ en: 'Ai' }, { en: 'Aiath' }], lookupPlace)).toHaveLength(2);
    expect(lookupPlace('a place that does not exist')).toBeNull();
  });
});
