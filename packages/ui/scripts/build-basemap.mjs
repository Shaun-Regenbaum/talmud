/**
 * Build a COMPACT regional basemap for @corpus/ui/GeoMap from Natural Earth
 * (public-domain) land + rivers + lakes. Clips to the Near East region,
 * simplifies (Douglas–Peucker), rounds to ~1km, and writes src/geo/basemap.ts
 * as lon/lat geometry (so the component projects to any bbox at runtime).
 *
 * Run from packages/ui: `node scripts/build-basemap.mjs`. The raw .geojson
 * inputs live alongside this script and are NOT committed (the output is).
 */

import { readFileSync, writeFileSync } from 'node:fs';

const DIR = new URL('./', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
const land = read('ne_50m_land.geojson');
const rivers = read('ne_50m_rivers_lake_centerlines.geojson');
const lakes = read('ne_50m_lakes.geojson');

// Generous region: covers the Near-East and Israel zoom presets with margin.
const REGION = { lonMin: 27, lonMax: 51, latMin: 25, latMax: 40 };
const SIMPLIFY = 0.02; // ~2km tolerance — plenty at this scale

// --- Sutherland–Hodgman polygon clip to the region rectangle ---
function clipRing(ring) {
  const m = 0.5;
  const box = {
    x0: REGION.lonMin - m,
    y0: REGION.latMin - m,
    x1: REGION.lonMax + m,
    y1: REGION.latMax + m,
  };
  const edges = [
    (p) => p[0] >= box.x0,
    (p) => p[0] <= box.x1,
    (p) => p[1] >= box.y0,
    (p) => p[1] <= box.y1,
  ];
  const cut = (a, b, e) => {
    let t;
    if (e === 0) t = (box.x0 - a[0]) / (b[0] - a[0]);
    else if (e === 1) t = (box.x1 - a[0]) / (b[0] - a[0]);
    else if (e === 2) t = (box.y0 - a[1]) / (b[1] - a[1]);
    else t = (box.y1 - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  let out = ring;
  for (let e = 0; e < 4; e++) {
    const inside = edges[e];
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i];
      const prev = inp[(i + inp.length - 1) % inp.length];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cut(prev, cur, e));
        out.push(cur);
      } else if (pi) out.push(cut(prev, cur, e));
    }
    if (!out.length) return null;
  }
  return out;
}

// --- Douglas–Peucker simplification ---
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
  ring.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
const inRegion = (coords) => {
  let lo = [Infinity, Infinity];
  let hi = [-Infinity, -Infinity];
  const walk = (a) => {
    if (typeof a[0] === 'number') {
      lo = [Math.min(lo[0], a[0]), Math.min(lo[1], a[1])];
      hi = [Math.max(hi[0], a[0]), Math.max(hi[1], a[1])];
    } else for (const x of a) walk(x);
  };
  walk(coords);
  return !(
    hi[0] < REGION.lonMin ||
    lo[0] > REGION.lonMax ||
    hi[1] < REGION.latMin ||
    lo[1] > REGION.latMax
  );
};

function polygons(fc) {
  const rings = [];
  for (const f of fc.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      if (!inRegion(poly)) continue;
      for (const ring of poly) {
        const clipped = clipRing(ring);
        if (!clipped || clipped.length < 4) continue;
        const simp = dp(clipped, SIMPLIFY);
        if (simp.length >= 4) rings.push(round(simp));
      }
    }
  }
  return rings;
}

function lines(fc) {
  const out = [];
  for (const f of fc.features) {
    const segs =
      f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const seg of segs) {
      if (!inRegion(seg)) continue;
      const inb = seg.filter(
        (p) =>
          p[0] >= REGION.lonMin - 1 &&
          p[0] <= REGION.lonMax + 1 &&
          p[1] >= REGION.latMin - 1 &&
          p[1] <= REGION.latMax + 1,
      );
      if (inb.length < 2) continue;
      const simp = dp(inb, SIMPLIFY);
      if (simp.length >= 2) out.push(round(simp));
    }
  }
  return out;
}

const basemap = {
  region: REGION,
  land: polygons(land),
  lakes: polygons(lakes),
  rivers: lines(rivers),
};

const bytes = JSON.stringify(basemap).length;
const header = `/**
 * Compact Near-East basemap for @corpus/ui/GeoMap — generated from Natural
 * Earth (public domain) by scripts/build-basemap.mjs. lon/lat geometry,
 * clipped to the region + Douglas–Peucker simplified (~2km), rounded to ~1km.
 * Regenerate after changing the region/tolerance; do NOT hand-edit.
 */
export interface BaseMap {
  region: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  /** Land outlines (filled). */
  land: number[][][];
  /** Inland water bodies (Dead Sea, Galilee, …). */
  lakes: number[][][];
  /** River centerlines (Nile, Tigris, Euphrates, Jordan, …). */
  rivers: number[][][];
}

export const BASEMAP: BaseMap = `;
writeFileSync(new URL('../src/geo/basemap.ts', DIR), `${header}${JSON.stringify(basemap)};\n`);
console.log(
  `wrote src/geo/basemap.ts — ${(bytes / 1024).toFixed(0)}KB | land rings ${basemap.land.length}, lakes ${basemap.lakes.length}, rivers ${basemap.rivers.length}`,
);
