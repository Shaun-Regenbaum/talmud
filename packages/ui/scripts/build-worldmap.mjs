/**
 * Build a COMPACT world basemap for @corpus/ui/WorldBubbleMap from Natural Earth
 * (public-domain) 110m admin-0 country outlines, plus a complete ISO alpha-2 ->
 * centroid lookup (Google's canonical countries dataset, public domain). The
 * land rings drive the filled-land fill; the centroids place one bubble per
 * country. Antarctica is dropped (cropped out of the map). Output is lon/lat
 * geometry, Douglas-Peucker simplified + rounded, so the component projects it
 * to any bbox at runtime.
 *
 * Inputs live under scripts/tmp/ and are NOT committed (only the output is):
 *   - ne_110m_countries.geojson   (Natural Earth 110m admin-0 countries)
 *   - countries.csv               (ISO2,lat,lng,name centroids)
 * Fetch them first (see the curl lines in the PR), then run from packages/ui:
 *   node scripts/build-worldmap.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const DIR = new URL('./', import.meta.url);
const readJson = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));

const countries = readJson('tmp/ne_110m_countries.geojson');
const centroidCsv = readFileSync(new URL('tmp/countries.csv', DIR), 'utf8');

// Crop: keep everything but Antarctica (matches the reference framing). The
// component's bbox clips the rest.
const DROP = new Set(['Antarctica']);
const SIMPLIFY = 0.18; // ~18km tolerance — plenty for a small world map
const PRECISION = 100; // round to 0.01 deg (~1km)

// --- Douglas-Peucker simplification (perpendicular distance) ---
function dp(points, eps) {
  if (points.length < 3) return points;
  const sqd = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    const cx = a[0] + t * dx;
    const cy = a[1] + t * dy;
    return (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const e2 = eps * eps;
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = sqd(points[i], points[lo], points[hi]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > e2 && idx !== -1) {
      keep[idx] = 1;
      stack.push([lo, idx], [idx, hi]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (ring) =>
  ring.map(([a, b]) => [
    Math.round(a * PRECISION) / PRECISION,
    Math.round(b * PRECISION) / PRECISION,
  ]);

// Land rings: every polygon ring of every kept country, simplified. Rendered
// with fill == stroke and no borders, so adjacent countries read as one
// continuous landmass (the reference's dissolved look) without a real dissolve.
const land = [];
for (const f of countries.features) {
  if (DROP.has(f.properties?.NAME)) continue;
  const geom = f.geometry;
  if (!geom) continue;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      if (ring.length < 4) continue;
      const simp = dp(ring, SIMPLIFY);
      if (simp.length >= 4) land.push(round(simp));
    }
  }
}

// Centroid lookup: ISO alpha-2 -> [lng, lat] from the canonical dataset. Rows
// look like `US,37.09024,-95.712891,"United States"` (the name may be quoted /
// contain commas, so only the first three fields are parsed).
const centroids = {};
for (const line of centroidCsv.trim().split(/\r?\n/).slice(1)) {
  const m = line.match(/^([A-Z]{2}),(-?[\d.]+),(-?[\d.]+),/);
  if (!m) continue;
  const [, code, lat, lng] = m;
  centroids[code] = [
    Math.round(Number(lng) * PRECISION) / PRECISION,
    Math.round(Number(lat) * PRECISION) / PRECISION,
  ];
}

const out = {
  // Map viewport: whole world minus Antarctica / the empty far north.
  bbox: { lonMin: -180, lonMax: 180, latMin: -58, latMax: 83 },
  land,
  centroids,
};

const bytes = JSON.stringify(out).length;
const header = `/**
 * Compact world basemap for @corpus/ui/WorldBubbleMap — generated from Natural
 * Earth 110m admin-0 countries (public domain) + the canonical ISO2->centroid
 * dataset, by scripts/build-worldmap.mjs. lon/lat geometry, Douglas-Peucker
 * simplified (~18km) + rounded to ~1km; Antarctica dropped. Regenerate after
 * changing the tolerance/crop; do NOT hand-edit.
 */
export interface WorldMap {
  /** Default viewport (whole world minus Antarctica). */
  bbox: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  /** Land outlines (filled, no borders). */
  land: number[][][];
  /** ISO alpha-2 country code -> [lng, lat] centroid, for bubble placement. */
  centroids: Record<string, [number, number]>;
}

export const WORLD_MAP: WorldMap = `;
writeFileSync(new URL('../src/geo/worldmap.ts', DIR), `${header}${JSON.stringify(out)};\n`);
console.log(
  `wrote src/geo/worldmap.ts — ${(bytes / 1024).toFixed(0)}KB | land rings ${land.length}, centroids ${Object.keys(centroids).length}`,
);
