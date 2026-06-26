/**
 * build-geo-shapes.ts — generates src/client/geoShapes.ts from real geography.
 *
 * Regenerate with (from packages/talmud; Node >= 22.18 / 24 runs .ts natively):
 *
 *   node scripts/build-geo-shapes.ts
 *
 * or from the repo root:
 *
 *   pnpm --filter talmud rebuild-geo-shapes
 *
 * What it does
 * ------------
 * 1. Fetches public-domain Natural Earth GeoJSON at SCRIPT runtime (nothing is
 *    committed except the generated output; the app fetches nothing at runtime):
 *      - ne_10m_coastline + ne_10m_rivers_lake_centerlines + ne_10m_lakes for
 *        the Israel/Levant window (the window spans only ~2.7 deg of longitude;
 *        at 50m the Jordan exists but the coast is too coarse, and the
 *        Kinneret / Dead Sea only appear in the 10m lakes layer).
 *      - ne_50m_coastline + ne_50m_rivers_lake_centerlines for the larger
 *        Bavel/Mesopotamia window (Euphrates, Tigris, Shatt al-Arab and the
 *        Persian Gulf head are all present at 50m; 10m adds modern canal
 *        clutter). Lakes are deliberately EXCLUDED for Bavel — every lake in
 *        the window (Tharthar, Razazah, Habbaniyah) is a 20th-century
 *        reservoir, anachronistic on a Talmudic map.
 * 2. Clips each polyline/ring to the region window (Liang-Barsky per segment),
 *    projects to a local equirectangular plane (x scaled by cos of the window's
 *    mid-latitude), simplifies with Douglas-Peucker, and emits SVG path
 *    strings.
 * 3. Projects the city table below (real lat/lon) into the same local space.
 *
 * Output is deterministic: fixed numeric precision, lexicographically sorted
 * path strings, city order exactly as listed below — so re-runs diff cleanly.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

// ---------------------------------------------------------------------------
// Region windows
// ---------------------------------------------------------------------------
// Tuned so every city below fits with margin:
//   Israel  — lon 34.0..36.7, lat 29.4..33.6. The north edge is widened past
//             the classic Galilee crop to include Tyre (33.27N); the south
//             edge reaches the Gulf of Aqaba head so the map reads as the
//             full land of Israel silhouette.
//   Bavel   — lon 40.8..48.8, lat 29.7..37.5. Wider and taller than the
//             city cluster alone: the north edge admits Nisibis (37.08N, on
//             the upper Tigris basin) and the east/south edges admit the
//             Persian Gulf head + Shatt al-Arab, so both rivers run the full
//             height of the card.
interface RegionWindow {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  /** Local-space height in viewBox units; width follows from the aspect. */
  height: number;
}

const ISRAEL_WINDOW: RegionWindow = {
  lonMin: 34.0,
  lonMax: 36.7,
  latMin: 29.4,
  latMax: 33.6,
  height: 180,
};
const BAVEL_WINDOW: RegionWindow = {
  lonMin: 40.8,
  lonMax: 48.8,
  latMin: 29.7,
  latMax: 37.5,
  height: 180,
};

// ---------------------------------------------------------------------------
// Cities — real lat/lon, projected into local space at build time.
// ---------------------------------------------------------------------------
// Reconciled with the legacy hand-placed KNOWN_CITIES list from
// GeographyMap.tsx: every legacy city name + alias set survives (the aliases
// drive matching against rabbi-places.json / rabbi.geography place strings),
// each now carries a real coordinate. Cities whose ancient site is uncertain
// are flagged `approx: true` with a comment explaining the guess.
interface CityDef {
  name: string;
  nameHe: string;
  aliases: string[];
  region: 'israel' | 'bavel';
  /** Latitude (N) */
  lat: number;
  /** Longitude (E) */
  lon: number;
  approx?: boolean;
}

const CITIES: CityDef[] = [
  // ── Eretz Yisrael ──────────────────────────────────────────────────────
  {
    name: 'Tyre',
    nameHe: 'צור',
    aliases: ['tyre', 'tzor', 'sor'],
    region: 'israel',
    lat: 33.27,
    lon: 35.203,
  },
  // Gush Halav = modern Jish.
  {
    name: 'Gush Halav',
    nameHe: 'גוש חלב',
    aliases: ['gush halav', 'gush chalav', 'giscala', 'gischala'],
    region: 'israel',
    lat: 33.022,
    lon: 35.448,
  },
  {
    name: "Peki'in",
    nameHe: 'פקיעין',
    aliases: ['pekiin', "peki'in"],
    region: 'israel',
    lat: 32.977,
    lon: 35.331,
  },
  {
    name: 'Akko',
    nameHe: 'עכו',
    aliases: ['akko', 'acre', 'acco', 'ptolemais'],
    region: 'israel',
    lat: 32.927,
    lon: 35.082,
  },
  {
    name: 'Sikhnin',
    nameHe: 'סכנין',
    aliases: ['sikhnin', 'sakhnin', 'sogane'],
    region: 'israel',
    lat: 32.864,
    lon: 35.297,
  },
  // Ancient Arbel sits below Mt. Arbel above the Kinneret shore.
  {
    name: 'Arbel',
    nameHe: 'ארבל',
    aliases: ['arbel'],
    region: 'israel',
    lat: 32.811,
    lon: 35.499,
    approx: true,
  },
  {
    name: "Shefar'am",
    nameHe: 'שפרעם',
    aliases: ['shefaram', "shefar'am", 'shfaram'],
    region: 'israel',
    lat: 32.806,
    lon: 35.17,
  },
  { name: 'Usha', nameHe: 'אושא', aliases: ['usha'], region: 'israel', lat: 32.8, lon: 35.17 },
  {
    name: 'Tiberias',
    nameHe: 'טבריה',
    aliases: ['tiberias', 'teveria', 'tiberya'],
    region: 'israel',
    lat: 32.795,
    lon: 35.53,
  },
  {
    name: 'Tzipori',
    nameHe: 'ציפורי',
    aliases: ['tzipori', 'tzippori', 'sepphoris', 'zippori', 'sippori'],
    region: 'israel',
    lat: 32.752,
    lon: 35.279,
  },
  {
    name: "Beit She'arim",
    nameHe: 'בית שערים',
    aliases: ['beit shearim', "beit she'arim", 'bet shearim', 'besara'],
    region: 'israel',
    lat: 32.702,
    lon: 35.13,
  },
  {
    name: 'Caesarea',
    nameHe: 'קיסריה',
    aliases: ['caesarea', 'kisrin', 'kisarya'],
    region: 'israel',
    lat: 32.5,
    lon: 34.892,
  },
  {
    name: "Beit She'an",
    nameHe: 'בית שאן',
    aliases: ["beit she'an", 'beit shean', 'beit shan', 'beth shan', 'scythopolis'],
    region: 'israel',
    lat: 32.497,
    lon: 35.497,
  },
  {
    name: 'Shechem',
    nameHe: 'שכם',
    aliases: ['shechem', 'nablus'],
    region: 'israel',
    lat: 32.221,
    lon: 35.254,
  },
  {
    name: 'Bnei Brak',
    nameHe: 'בני ברק',
    aliases: ['bnei brak', 'bene berak', 'benei berak'],
    region: 'israel',
    lat: 32.081,
    lon: 34.834,
  },
  {
    name: 'Lod',
    nameHe: 'לוד',
    aliases: ['lod', 'lydda', 'lud'],
    region: 'israel',
    lat: 31.951,
    lon: 34.896,
  },
  {
    name: 'Yavneh',
    nameHe: 'יבנה',
    aliases: ['yavneh', 'jamnia', 'yavne', 'jabneh'],
    region: 'israel',
    lat: 31.878,
    lon: 34.739,
  },
  {
    name: 'Jerusalem',
    nameHe: 'ירושלים',
    aliases: ['jerusalem', 'yerushalayim', 'yerushalaim'],
    region: 'israel',
    lat: 31.778,
    lon: 35.235,
  },
  {
    name: 'Ashkelon',
    nameHe: 'אשקלון',
    aliases: ['ashkelon', 'ascalon', 'ashqelon'],
    region: 'israel',
    lat: 31.669,
    lon: 34.571,
  },
  // Biblical Tekoa = Khirbet Tuqu', south-east of Bethlehem.
  {
    name: 'Tekoa',
    nameHe: 'תקוע',
    aliases: ['tekoa'],
    region: 'israel',
    lat: 31.636,
    lon: 35.291,
    approx: true,
  },
  {
    name: 'Hebron',
    nameHe: 'חברון',
    aliases: ['hebron', 'chevron'],
    region: 'israel',
    lat: 31.532,
    lon: 35.095,
  },

  // ── Bavel ──────────────────────────────────────────────────────────────
  // Talmudic-Babylonian sites are identified with varying confidence; the
  // well-attested ones (Nisibis/Nusaybin, Pumbedita/Fallujah, Ctesiphon/Taq
  // Kasra, Sura near modern al-Hira) use the accepted identification, the
  // rest are flagged approximate near their attested neighborhood.
  {
    name: 'Nisibis',
    nameHe: 'נציבין',
    aliases: ['nisibis', 'netzivin'],
    region: 'bavel',
    lat: 37.075,
    lon: 41.218,
  },
  // Nehardea: on the Euphrates near the Nahr Malka junction, adjacent to Anbar
  // (a short distance west of Fallujah/Pumbedita). ~33.374N, 43.710E.
  {
    name: 'Nehardea',
    nameHe: 'נהרדעא',
    aliases: ['nehardea', 'nehardeah', "neharde'a"],
    region: 'bavel',
    lat: 33.374,
    lon: 43.71,
    approx: true,
  },
  // Pumbedita = generally identified with modern Fallujah.
  {
    name: 'Pumbedita',
    nameHe: 'פומבדיתא',
    aliases: ['pumbedita', 'pumbeditha', 'pumbedisa'],
    region: 'bavel',
    lat: 33.35,
    lon: 43.78,
  },
  {
    name: 'Baghdad',
    nameHe: 'בגדאד',
    aliases: ['baghdad', 'bagdad'],
    region: 'bavel',
    lat: 33.31,
    lon: 44.36,
  },
  // Sichra: a suburb-town near Mahoza on the Tigris; exact site unknown.
  {
    name: 'Sichra',
    nameHe: 'שיכרא',
    aliases: ['sichra', 'sikra', 'shikra'],
    region: 'bavel',
    lat: 33.2,
    lon: 44.7,
    approx: true,
  },
  // Mehoza sat opposite Ctesiphon across the Tigris; nudged off Ctesiphon so
  // the two dots don't coincide.
  {
    name: 'Mehoza',
    nameHe: 'מחוזא',
    aliases: ['mehoza', 'mahoza', 'machuza', 'mechuza', 'maḥoza'],
    region: 'bavel',
    lat: 33.1,
    lon: 44.55,
    approx: true,
  },
  {
    name: 'Ctesiphon',
    nameHe: 'קטיספון',
    aliases: ['ctesiphon', 'qtesiphon'],
    region: 'bavel',
    lat: 33.094,
    lon: 44.581,
  },
  // Pum Nahara ("river mouth"): a canal town in the Nehardea-Sura orbit;
  // location uncertain.
  {
    name: 'Pum Nahara',
    nameHe: 'פום נהרא',
    aliases: ['pum nahara', 'pum nehara'],
    region: 'bavel',
    lat: 32.7,
    lon: 44.2,
    approx: true,
  },
  // Shekanziv: attested on the route between Sura and Mehoza; site unknown.
  {
    name: 'Shekanziv',
    nameHe: 'שקנציב',
    aliases: ['shekanziv', 'shikanzib'],
    region: 'bavel',
    lat: 32.6,
    lon: 44.9,
    approx: true,
  },
  // Hutzal: between Sura and Nehardea, sometimes tied to ancient Opis.
  {
    name: 'Hutzal',
    nameHe: 'הוצל',
    aliases: ['hutzal', 'huzal', 'hutsal'],
    region: 'bavel',
    lat: 32.5,
    lon: 44.4,
    approx: true,
  },
  { name: 'Nippur', nameHe: 'ניפור', aliases: ['nippur'], region: 'bavel', lat: 32.13, lon: 45.23 },
  // Hini (often paired with Shili): near Sura; site unknown.
  {
    name: 'Hini',
    nameHe: 'היני',
    aliases: ['hini', 'hene'],
    region: 'bavel',
    lat: 32.05,
    lon: 44.6,
    approx: true,
  },
  // Mata Mehasya: adjacent to Sura (the twin academy town).
  {
    name: 'Mata Mehasya',
    nameHe: 'מתא מחסיא',
    aliases: ['mata mehasya', 'mata mahasya', 'mata meḥasya'],
    region: 'bavel',
    lat: 31.9,
    lon: 44.5,
    approx: true,
  },
  // Sura: near modern al-Hira on the old Euphrates course.
  { name: 'Sura', nameHe: 'סורא', aliases: ['sura'], region: 'bavel', lat: 31.88, lon: 44.45 },
  // Naresh: south of Sura on the Nars canal.
  {
    name: 'Naresh',
    nameHe: 'נרש',
    aliases: ['naresh', 'narash'],
    region: 'bavel',
    lat: 31.65,
    lon: 44.55,
    approx: true,
  },
  // Kafri: south of Sura; site unknown.
  {
    name: 'Kafri',
    nameHe: 'כפרי',
    aliases: ['kafri', 'kufri'],
    region: 'bavel',
    lat: 31.55,
    lon: 44.2,
    approx: true,
  },
  // ── Added from the 2026-06 Shas backlog research ────────────────────────
  // High-confidence sites missing from the gazetteer (places the `places` mark
  // surfaced on real dapim). Coords are decimal lat/lon, projected at build time
  // like every entry above. See Sandbox/2026-06-16-backlog-research/findings.md.
  {
    name: 'Nineveh',
    nameHe: 'נינוה',
    aliases: ['nineveh', 'ninveh', 'niniveh', 'kuyunjik', 'nebi yunus'],
    region: 'bavel',
    lat: 36.3594,
    lon: 43.1528,
  },
  {
    name: 'Dan',
    nameHe: 'דן',
    aliases: ['dan', 'tel dan', 'tell elqadi', 'laish', 'leshem'],
    region: 'israel',
    lat: 33.249,
    lon: 35.652,
  },
  {
    name: 'Arav',
    nameHe: 'ערב',
    aliases: ['arav', 'arraba', 'gabara', 'arrabat albattuf'],
    region: 'israel',
    lat: 32.8506,
    lon: 35.3389,
  },
  {
    name: 'Migdal',
    nameHe: 'מגדלא',
    aliases: [
      'migdal',
      'magdala',
      'migdala',
      'migdal nunaya',
      'migdala nunayya',
      'taricheae',
      'almajdal',
    ],
    region: 'israel',
    lat: 32.8345,
    lon: 35.5179,
  },
  {
    name: 'Maon',
    nameHe: 'מעון',
    aliases: ['maon', 'beit maon', 'beth maon'],
    region: 'israel',
    lat: 32.7944,
    lon: 35.5333,
  },
  {
    name: 'Shihin',
    nameHe: 'שיחין',
    aliases: ['shihin', 'shikhin', 'kefar shikhin', 'asochis'],
    region: 'israel',
    lat: 32.7681,
    lon: 35.2737,
  },
  {
    name: 'Antipatris',
    nameHe: 'אנטיפטרס',
    aliases: ['antipatris', 'tel afek', 'tel aphek', 'aphek in the sharon', 'ras alayn'],
    region: 'israel',
    lat: 32.103,
    lon: 34.9249,
  },
  {
    name: 'Shiloh',
    nameHe: 'שילה',
    aliases: ['shiloh', 'tel shiloh', 'khirbet seilun', 'sailun', 'silo'],
    region: 'israel',
    lat: 32.0556,
    lon: 35.2895,
  },
  {
    name: 'Jaffa',
    nameHe: 'יפו',
    aliases: ['jaffa', 'yafo', 'joppa', 'japho', 'yaffa', 'yafa'],
    region: 'israel',
    lat: 32.0522,
    lon: 34.7531,
  },
  {
    name: 'Ono',
    nameHe: 'אונו',
    aliases: ['ono', 'onous', "kafr 'ana", 'kefr ana', 'kafr juna'],
    region: 'israel',
    lat: 32.0244,
    lon: 34.8686,
  },
  {
    name: 'Bethel',
    nameHe: 'בית אל',
    aliases: ['bethel', 'beitin', 'beit el', 'luz'],
    region: 'israel',
    lat: 31.9228,
    lon: 35.2414,
  },
  {
    name: 'Beit Horon',
    nameHe: 'בית חורון',
    aliases: [
      'beit horon',
      'beth horon',
      'bethoron',
      'upper beth horon',
      'lower beth horon',
      'beit ur alfauqa',
      'beit ur altahta',
    ],
    region: 'israel',
    lat: 31.8772,
    lon: 35.1186,
  },
  {
    name: 'Jericho',
    nameHe: 'יריחו',
    aliases: ['jericho', 'tell essultan', 'tel jericho', 'ancient jericho'],
    region: 'israel',
    lat: 31.8711,
    lon: 35.4439,
  },
  {
    name: 'Gibeon',
    nameHe: 'גבעון',
    aliases: ['gibeon', 'givon', 'aljib', 'eljib'],
    region: 'israel',
    lat: 31.8475,
    lon: 35.1834,
  },
  {
    name: 'Beitar',
    nameHe: 'ביתר',
    aliases: ['beitar', 'betar', 'bethar', 'bether', 'khirbet alyahud', 'tel betar', 'battir'],
    region: 'israel',
    lat: 31.73,
    lon: 35.1356,
  },
  {
    name: 'Gath',
    nameHe: 'גת',
    aliases: ['gath', 'gath of the philistines', 'tell essafi', 'tel tzafit', 'tall alsafi'],
    region: 'israel',
    lat: 31.7042,
    lon: 34.8469,
  },
  {
    name: "Ke'ila",
    nameHe: 'קעילה',
    aliases: ["ke'ila", "ke'ilah", 'keilah', 'qeilah', 'khirbet qeyla', 'khirbet qila', 'kh qeila'],
    region: 'israel',
    lat: 31.6137,
    lon: 35.0036,
  },
  {
    name: 'Gaza',
    nameHe: 'עזה',
    aliases: ['gaza', 'azza', 'azzah', 'gaza city'],
    region: 'israel',
    lat: 31.5133,
    lon: 34.4634,
  },
];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

type Pt = [number, number]; // [lon, lat]

interface Projector {
  width: number;
  height: number;
  /** Local viewBox units per degree of latitude (the y axis scale). */
  k: number;
  /** Local viewBox units per degree of longitude (x; = cos(midLat) * k). */
  xScale: number;
  toLocal: (lon: number, lat: number) => { x: number; y: number };
}

function makeProjector(w: RegionWindow): Projector {
  const midLat = ((w.latMin + w.latMax) / 2) * (Math.PI / 180);
  const k = w.height / (w.latMax - w.latMin); // local units per degree of latitude
  const xScale = Math.cos(midLat) * k;
  const width = (w.lonMax - w.lonMin) * xScale;
  return {
    width,
    height: w.height,
    k,
    xScale,
    toLocal: (lon, lat) => ({ x: (lon - w.lonMin) * xScale, y: (w.latMax - lat) * k }),
  };
}

/** Liang-Barsky clip of one segment to the window. Returns the clipped
 *  segment or null when fully outside. */
function clipSegment(a: Pt, b: Pt, w: RegionWindow): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const checks: Array<[number, number]> = [
    [-dx, a[0] - w.lonMin],
    [dx, w.lonMax - a[0]],
    [-dy, a[1] - w.latMin],
    [dy, w.latMax - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  const pA: Pt = [a[0] + t0 * dx, a[1] + t0 * dy];
  const pB: Pt = [a[0] + t1 * dx, a[1] + t1 * dy];
  return [pA, pB];
}

/** Clip a polyline to the window, splitting into multiple runs wherever it
 *  exits and re-enters. */
function clipPolyline(line: Pt[], w: RegionWindow): Pt[][] {
  const out: Pt[][] = [];
  let run: Pt[] = [];
  const close = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
  for (let i = 0; i < line.length - 1; i++) {
    const seg = clipSegment(line[i], line[i + 1], w);
    if (!seg) {
      if (run.length > 1) out.push(run);
      run = [];
      continue;
    }
    const [a, b] = seg;
    if (run.length === 0) {
      run.push(a, b);
    } else if (close(run[run.length - 1], a)) {
      run.push(b);
    } else {
      if (run.length > 1) out.push(run);
      run = [a, b];
    }
  }
  if (run.length > 1) out.push(run);
  return out;
}

/** Douglas-Peucker simplification in local (projected) coordinates. */
function simplify(
  points: Array<{ x: number; y: number }>,
  epsilon: number,
): Array<{ x: number; y: number }> {
  if (points.length < 3) return points;
  const dPerp = (
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = Math.hypot(vx, vy);
    if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs(vx * (a.y - p.y) - (a.x - p.x) * vy) / len;
  };
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = dPerp(points[i], points[0], points[points.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= epsilon) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, idx + 1), epsilon);
  const right = simplify(points.slice(idx), epsilon);
  return left.slice(0, -1).concat(right);
}

const fmt = (n: number): string => {
  const s = n.toFixed(1);
  return s === '-0.0' ? '0.0' : s;
};

function toPath(points: Array<{ x: number; y: number }>, closed: boolean): string {
  const parts: string[] = [];
  let prev = '';
  for (let i = 0; i < points.length; i++) {
    const coord = `${fmt(points[i].x)},${fmt(points[i].y)}`;
    if (coord === prev) continue; // drop consecutive duplicates after rounding
    parts.push(`${i === 0 ? 'M' : 'L'}${coord}`);
    prev = coord;
  }
  if (parts.length < 2) return '';
  return parts.join('') + (closed ? 'Z' : '');
}

/** Approximate on-screen length of a path's points, to drop specks. */
function pathLength(points: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < points.length; i++)
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

/** Bounding-box size of a path, measured back in GEOGRAPHIC degrees (each axis
 *  divided by its projection scale). Degrees are region-independent — the two
 *  windows project at different scales (cos(midLat) and a different height-per-
 *  latitude span), so a local-unit threshold would mean different real sizes in
 *  Israel vs Bavel. Returns the larger of the two axes' degree spans. */
function bboxMaxDeg(points: Array<{ x: number; y: number }>, proj: Projector): number {
  if (points.length === 0) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.max((maxX - minX) / proj.xScale, (maxY - minY) / proj.k);
}

// ---------------------------------------------------------------------------
// GeoJSON plumbing
// ---------------------------------------------------------------------------

interface GeoFeature {
  properties?: Record<string, unknown> | null;
  geometry?: {
    type: string;
    coordinates: unknown;
  } | null;
}

/** Flatten a geometry into polylines. Polygon rings come back closed. */
function linesOf(g: GeoFeature['geometry']): Array<{ pts: Pt[]; closed: boolean }> {
  if (!g) return [];
  if (g.type === 'LineString') return [{ pts: g.coordinates as Pt[], closed: false }];
  if (g.type === 'MultiLineString')
    return (g.coordinates as Pt[][]).map((pts) => ({ pts, closed: false }));
  if (g.type === 'Polygon') return (g.coordinates as Pt[][]).map((pts) => ({ pts, closed: true }));
  if (g.type === 'MultiPolygon')
    return (g.coordinates as Pt[][][]).flat().map((pts) => ({ pts, closed: true }));
  return [];
}

async function fetchGeoJson(file: string): Promise<GeoFeature[]> {
  const url = `${NE_BASE}/${file}.geojson`;
  process.stderr.write(`fetching ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
  const json = (await res.json()) as { features: GeoFeature[] };
  return json.features;
}

/** Clip + project + simplify one layer into sorted SVG path strings. */
function buildPaths(
  features: GeoFeature[],
  w: RegionWindow,
  proj: Projector,
  opts: {
    epsilon: number;
    minLength: number;
    /** Drop a path whose bounding box (in geographic degrees) is smaller than
     *  this on its longer axis. Used for LAND only — it removes clipped
     *  coastline slivers (e.g. the Gulf of Aqaba head "nib" in the Israel
     *  window) while keeping every real coast and Bavel's small-but-legit land.
     *  Degrees, not local units, so the single threshold means the same real
     *  size in both region windows despite their different projection scales. */
    minBboxDeg?: number;
    nameFilter?: (name: string) => boolean;
  },
): string[] {
  const out: string[] = [];
  for (const f of features) {
    const name = String(f.properties?.name ?? '');
    if (opts.nameFilter && !opts.nameFilter(name)) continue;
    for (const { pts, closed } of linesOf(f.geometry)) {
      for (const run of clipPolyline(pts, w)) {
        const local = run.map((p) => proj.toLocal(p[0], p[1]));
        const simplified = simplify(local, opts.epsilon);
        if (pathLength(simplified) < opts.minLength) continue;
        if (opts.minBboxDeg !== undefined && bboxMaxDeg(simplified, proj) < opts.minBboxDeg)
          continue;
        // A clipped ring is only re-closed when the clip didn't cut it open.
        const isStillClosed =
          closed &&
          Math.abs(simplified[0].x - simplified[simplified.length - 1].x) < 0.05 &&
          Math.abs(simplified[0].y - simplified[simplified.length - 1].y) < 0.05;
        const d = toPath(simplified, isStillClosed);
        if (d) out.push(d);
      }
    }
  }
  out.sort();
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const [coast10, rivers10, lakes10, coast50, rivers50] = await Promise.all([
    fetchGeoJson('ne_10m_coastline'),
    fetchGeoJson('ne_10m_rivers_lake_centerlines'),
    fetchGeoJson('ne_10m_lakes'),
    fetchGeoJson('ne_50m_coastline'),
    fetchGeoJson('ne_50m_rivers_lake_centerlines'),
  ]);

  const israelProj = makeProjector(ISRAEL_WINDOW);
  const bavelProj = makeProjector(BAVEL_WINDOW);

  // Israel: 10m everything. Lakes restricted to the two ancient ones (the
  // window contains nothing else, but the filter makes intent explicit).
  // LAND_MIN_BBOX_DEG: drop coastline fragments whose longer bbox axis is below
  // this many geographic degrees. Tuned to sit in the clean gap between the
  // Israel Gulf-of-Aqaba "nib" (~0.18 deg, an artifact of the south clip) and
  // the smallest legitimate land path (Bavel's eastern Gulf coast at ~0.28 deg;
  // every real coast is >1 deg). Applied identically to both regions.
  const LAND_MIN_BBOX_DEG = 0.22;
  const israelLand = buildPaths(coast10, ISRAEL_WINDOW, israelProj, {
    epsilon: 0.35,
    minLength: 4,
    minBboxDeg: LAND_MIN_BBOX_DEG,
  });
  const israelRivers = [
    ...buildPaths(rivers10, ISRAEL_WINDOW, israelProj, {
      epsilon: 0.35,
      minLength: 6,
      nameFilter: (n) => n === 'Jordan',
    }),
    ...buildPaths(lakes10, ISRAEL_WINDOW, israelProj, {
      epsilon: 0.35,
      minLength: 4,
      nameFilter: (n) => n === 'Sea of Galilee' || n === 'Dead Sea',
    }),
  ];

  // Bavel: 50m coast + rivers; no lakes (all modern reservoirs there).
  const bavelLand = buildPaths(coast50, BAVEL_WINDOW, bavelProj, {
    epsilon: 0.35,
    minLength: 4,
    minBboxDeg: LAND_MIN_BBOX_DEG,
  });
  const bavelRivers = buildPaths(rivers50, BAVEL_WINDOW, bavelProj, {
    epsilon: 0.35,
    minLength: 6,
  });

  const windows = { israel: ISRAEL_WINDOW, bavel: BAVEL_WINDOW } as const;
  const projectors = { israel: israelProj, bavel: bavelProj } as const;

  const cityLines = CITIES.map((c) => {
    const w = windows[c.region];
    const proj = projectors[c.region];
    if (c.lon < w.lonMin || c.lon > w.lonMax || c.lat < w.latMin || c.lat > w.latMax)
      throw new Error(`${c.name} (${c.lat}, ${c.lon}) falls outside the ${c.region} window`);
    const { x, y } = proj.toLocal(c.lon, c.lat);
    const margin = 2;
    if (x < margin || x > proj.width - margin || y < margin || y > proj.height - margin)
      throw new Error(
        `${c.name} projects too close to the ${c.region} edge (${fmt(x)}, ${fmt(y)})`,
      );
    const fields = [
      `name: ${JSON.stringify(c.name)}`,
      `nameHe: ${JSON.stringify(c.nameHe)}`,
      `aliases: [${c.aliases.map((a) => JSON.stringify(a)).join(', ')}]`,
      `region: ${JSON.stringify(c.region)}`,
      `x: ${fmt(x)}`,
      `y: ${fmt(y)}`,
      // Real coordinates, carried alongside the projected x/y so the shared
      // @corpus/ui GeoMap (which projects to its own bbox) can place the dot.
      `lat: ${c.lat}`,
      `lng: ${c.lon}`,
    ];
    if (c.approx) fields.push('approx: true');
    return `  { ${fields.join(', ')} },`;
  });

  const pathArray = (paths: string[]): string =>
    paths.map((p) => `    ${JSON.stringify(p)},`).join('\n');

  const regionLiteral = (proj: Projector, land: string[], rivers: string[]): string =>
    [
      '{',
      `  width: ${fmt(proj.width)},`,
      `  height: ${fmt(proj.height)},`,
      '  landPaths: [',
      pathArray(land),
      '  ],',
      '  riverPaths: [',
      pathArray(rivers),
      '  ],',
      '}',
    ].join('\n');

  const winComment = (w: RegionWindow): string =>
    `lon ${w.lonMin}..${w.lonMax}, lat ${w.latMin}..${w.latMax}`;

  const out = `// DO NOT HAND-EDIT — generated by scripts/build-geo-shapes.ts.
// Regenerate with: node scripts/build-geo-shapes.ts   (from packages/talmud)
//             or: pnpm --filter talmud rebuild-geo-shapes
//
// Real geography, projected: Natural Earth coastline/rivers/lakes clipped to
// two region windows and projected equirectangularly (x scaled by cos of the
// window mid-latitude) into local viewBox space. City dots are projected from
// real lat/lon by the same transform — see the city table in the script for
// coordinates, sources, and which identifications are approximate.
//
//   Israel window: ${winComment(ISRAEL_WINDOW)} (Natural Earth 10m)
//   Bavel window:  ${winComment(BAVEL_WINDOW)} (Natural Earth 50m)
//
// landPaths are coastline strokes; riverPaths are rivers plus (Israel only)
// the Kinneret + Dead Sea outlines — closed water rings end with 'Z' so a
// renderer can fill them.

export type GeoRegionId = 'israel' | 'bavel';

export interface GeoRegionShape {
  width: number;
  height: number;
  landPaths: string[];
  riverPaths: string[];
}

export interface GeoCity {
  name: string;
  nameHe: string;
  /** Lowercase alias spellings — these drive matching of place strings from
   *  rabbi-places.json / rabbi.geography / the places mark. */
  aliases: string[];
  region: GeoRegionId;
  /** Projected local coordinates (0..width / 0..height of the region shape). */
  x: number;
  y: number;
  /** Real coordinates (for the shared @corpus/ui GeoMap, which re-projects). */
  lat: number;
  lng: number;
  /** True when the ancient site's identification is uncertain — the dot is a
   *  reasoned guess near the attested neighborhood. */
  approx?: boolean;
}

export const ISRAEL_SHAPE: GeoRegionShape = ${regionLiteral(israelProj, israelLand, israelRivers)};

export const BAVEL_SHAPE: GeoRegionShape = ${regionLiteral(bavelProj, bavelLand, bavelRivers)};

export const GEO_CITIES: GeoCity[] = [
${cityLines.join('\n')}
];
`;

  const here = dirname(fileURLToPath(import.meta.url));
  const target = join(here, '..', 'src', 'client', 'geoShapes.ts');
  writeFileSync(target, out);
  // The repo gates CI on `biome ci .`, so the committed artifact must be
  // biome-formatted (single quotes, wrapped object literals, …).
  try {
    execSync(`pnpm exec biome format --write ${JSON.stringify(target)}`, {
      cwd: join(here, '..'),
      stdio: 'pipe',
    });
  } catch {
    process.stderr.write('warning: biome format failed — run `pnpm lint` and format manually\n');
  }
  process.stderr.write(
    `wrote ${target}\n` +
      `  israel: ${israelLand.length} land paths, ${israelRivers.length} river/lake paths, ${fmt(israelProj.width)}x${fmt(israelProj.height)}\n` +
      `  bavel:  ${bavelLand.length} land paths, ${bavelRivers.length} river paths, ${fmt(bavelProj.width)}x${fmt(bavelProj.height)}\n` +
      `  cities: ${CITIES.length}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
