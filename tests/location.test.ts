import { describe, it, expect } from 'vitest';
import { classifyLocation } from '../src/client/GeographyMap';

// Realistic free-text location strings that Kimi emits in /api/analyze
// section.rabbis[].location. Each case is [input, expectedCity, expectedRegion].
// Use null for expectedCity when we only expect a region fallback.
type Case = [string, string | null, 'israel' | 'bavel' | 'other'];

const CASES: Case[] = [
  // --- City + region strings Kimi produces from bios ---
  ['Lod, Judea',                 'Lod',        'israel'],
  ['Yavneh, Judea',              'Yavneh',     'israel'],
  ['Tiberias, Galilee',          'Tiberias',   'israel'],
  ['Jerusalem, Judea',           'Jerusalem',  'israel'],
  ['Sepphoris, Galilee',         'Tzipori',    'israel'],   // Sepphoris is the Greek/Latin alias for ציפורי
  ['Caesarea, Judea',            'Caesarea',   'israel'],
  ['Usha, Galilee',              'Usha',       'israel'],
  ['Bnei Brak, Judea',           'Bnei Brak',  'israel'],

  // --- Babylonian cities ---
  ['Sura, Babylonia',            'Sura',       'bavel'],
  ['Pumbedita, Babylonia',       'Pumbedita',  'bavel'],
  ['Nehardea, Babylonia',        'Nehardea',   'bavel'],
  ['Mehoza, Babylonia',          'Mehoza',     'bavel'],
  ['Nisibis, Babylonia',         'Nisibis',    'bavel'],
  ['Naresh, Babylonia',          'Naresh',     'bavel'],
  ['Kafri, Babylonia',           'Kafri',      'bavel'],
  ['Ctesiphon, Parthia',         'Ctesiphon',  'bavel'],

  // --- Spelling variants / aliases ---
  ['Sippori',                    'Tzipori',    'israel'],   // another Tzipori alias
  ['Jamnia',                     'Yavneh',     'israel'],   // classical name for Yavneh
  ['Lydda',                      'Lod',        'israel'],
  ['Mahoza',                     'Mehoza',     'bavel'],    // Anglicized
  ['Machuza',                    'Mehoza',     'bavel'],
  ['Scythopolis',                "Beit She'an",'israel'],

  // --- Region-only (no city specified) ---
  ['Babylonia',                  null,         'bavel'],
  ['Mesopotamia',                null,         'bavel'],
  ['Persian empire',             null,         'bavel'],
  ['Eretz Yisrael',              null,         'israel'],
  ['Judea',                      null,         'israel'],
  ['Galilee',                    null,         'israel'],
  ['Palestine',                  null,         'israel'],
  ['the Galil',                  null,         'israel'],

  // --- Unknown / other ---
  ['Rome, Italy',                null,         'other'],
  ['Alexandria, Egypt',          null,         'other'],
];

describe('classifyLocation — city + region identification', () => {
  for (const [input, expectedCity, expectedRegion] of CASES) {
    const desc = `"${input.padEnd(25)}" → city=${expectedCity ?? '(null)'}, region=${expectedRegion}`;
    it(desc, () => {
      const { city, region } = classifyLocation(input);
      expect(city?.name ?? null).toBe(expectedCity);
      expect(region).toBe(expectedRegion);
    });
  }
});

describe('classifyLocation — edge cases', () => {
  it('empty string falls back to other', () => {
    expect(classifyLocation('')).toEqual({ city: null, region: 'other' });
  });

  it('is case-insensitive for city aliases', () => {
    expect(classifyLocation('LOD')?.city?.name).toBe('Lod');
    expect(classifyLocation('pumbedita')?.city?.name).toBe('Pumbedita');
  });

  it('picks FIRST matching city when multiple alias substrings are present', () => {
    // "Lod, Judea" contains both "lod" and "judea" — Lod wins since it's a
    // specific city, not just a region fallback.
    expect(classifyLocation('Lod, Judea').city?.name).toBe('Lod');
  });
});
