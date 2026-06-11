import { describe, expect, it } from 'vitest';
import { BAVEL_SHAPE, GEO_CITIES, ISRAEL_SHAPE } from '../src/client/geoShapes';

// The legacy hand-placed KNOWN_CITIES list (pre-projection GeographyMap.tsx).
// Every one of these names must survive the projected rebuild — their alias
// sets drive matching of place strings from rabbi-places.json and the
// rabbi.geography enrichment.
const LEGACY_CITY_NAMES = [
  // Eretz Yisrael
  'Tyre',
  'Gush Halav',
  "Peki'in",
  'Tiberias',
  'Arbel',
  'Sikhnin',
  'Tzipori',
  'Usha',
  "Beit She'an",
  'Caesarea',
  'Shechem',
  'Bnei Brak',
  'Lod',
  'Yavneh',
  'Jerusalem',
  'Tekoa',
  // Bavel
  'Nisibis',
  'Pumbedita',
  'Pum Nahara',
  'Nehardea',
  'Hini',
  'Sichra',
  'Ctesiphon',
  'Mehoza',
  'Sura',
  'Mata Mehasya',
  'Naresh',
  'Kafri',
  'Shekanziv',
];

const PATH_RE = /^M-?\d+(\.\d+)?,-?\d+(\.\d+)?(L-?\d+(\.\d+)?,-?\d+(\.\d+)?)+Z?$/;

describe('geoShapes (generated)', () => {
  it('both regions carry land and river paths', () => {
    for (const shape of [ISRAEL_SHAPE, BAVEL_SHAPE]) {
      expect(shape.width).toBeGreaterThan(0);
      expect(shape.height).toBeGreaterThan(0);
      expect(shape.landPaths.length).toBeGreaterThan(0);
      expect(shape.riverPaths.length).toBeGreaterThan(0);
    }
  });

  it('every path string is a well-formed M/L polyline', () => {
    for (const shape of [ISRAEL_SHAPE, BAVEL_SHAPE]) {
      for (const d of [...shape.landPaths, ...shape.riverPaths]) {
        expect(d).toMatch(PATH_RE);
      }
    }
  });

  it('Israel carries closed water rings (Kinneret / Dead Sea)', () => {
    expect(ISRAEL_SHAPE.riverPaths.some((d) => d.endsWith('Z'))).toBe(true);
  });

  it('every city projects inside its region viewBox', () => {
    const shapes = { israel: ISRAEL_SHAPE, bavel: BAVEL_SHAPE } as const;
    for (const c of GEO_CITIES) {
      const shape = shapes[c.region];
      expect(c.x, `${c.name} x`).toBeGreaterThanOrEqual(0);
      expect(c.x, `${c.name} x`).toBeLessThanOrEqual(shape.width);
      expect(c.y, `${c.name} y`).toBeGreaterThanOrEqual(0);
      expect(c.y, `${c.name} y`).toBeLessThanOrEqual(shape.height);
    }
  });

  it('every city has a non-empty alias set and unique name', () => {
    const names = new Set<string>();
    for (const c of GEO_CITIES) {
      expect(c.aliases.length, c.name).toBeGreaterThan(0);
      expect(c.nameHe.length, c.name).toBeGreaterThan(0);
      expect(names.has(c.name), `duplicate city ${c.name}`).toBe(false);
      names.add(c.name);
    }
  });

  it('every legacy KNOWN_CITIES name survives the projected rebuild', () => {
    const names = new Set(GEO_CITIES.map((c) => c.name));
    for (const legacy of LEGACY_CITY_NAMES) {
      expect(names.has(legacy), `legacy city lost: ${legacy}`).toBe(true);
    }
  });

  it('both regions have cities', () => {
    expect(GEO_CITIES.some((c) => c.region === 'israel')).toBe(true);
    expect(GEO_CITIES.some((c) => c.region === 'bavel')).toBe(true);
  });
});
