/**
 * @fileoverview dafyomi.co.il (Kollel Iyun HaDaf) masechet + content-type
 * mapping and URL building.
 *
 * Kept separate from `tractates.ts` (the UI-facing tractate list) on purpose:
 * this table carries scrape-only fields (site directory, filename prefix, gid)
 * that have no business coupling to the app's tractate dropdown. This module
 * is also where the app's tractate spelling (`Chullin`, double-l) is reconciled
 * with the site's directory spelling (`chulin`, single-l).
 *
 * URL shape (one page file = one daf = BOTH amudim):
 *   https://www.dafyomi.co.il/{dir}/{folder}/{prefix}-{typecode}-{NNN}.htm
 * where NNN is the zero-padded 3-digit Bavli daf number. There is NO offset
 * (daf 76 -> "076"); every content type for a daf uses the same number.
 */

import { TRACTATE_END_AMUD } from '../amudim.ts';

export type DafyomiContentType =
  | 'insights'
  | 'background'
  | 'halacha'
  | 'tosfos'
  | 'review'
  | 'points'
  | 'hebcharts'
  | 'yerushalmi'
  // Revach l'Daf — brief per-daf highlights (SUMMARY + "A BIT MORE"). Unlike the
  // eight above it lives in the memdb app (revdaf.php?tid=&id=), not the
  // {dir}/{folder}/{prefix}-{typecode}-{NNN}.htm tree, so it has no
  // DAFYOMI_CONTENT_TYPES spec and is fetched via buildRevachUrl below.
  | 'revach';

export interface DafyomiContentTypeSpec {
  type: DafyomiContentType;
  /** Path segment after the masechet dir, e.g. "insites". */
  folder: string;
  /** Filename infix between prefix and NNN, e.g. "dt". */
  typecode: string;
  /** Optional query string the live page requires, e.g. "?q=1" for review. */
  query?: string;
  /** Hebrew-language page (affects how the parser/UI treats direction). */
  hebrew?: boolean;
}

/** The eight per-daf content types we ingest. galei (different numbering) and
 *  yosef-daas (Hebrew PDF) are intentionally out of v1 scope. */
export const DAFYOMI_CONTENT_TYPES: DafyomiContentTypeSpec[] = [
  { type: 'insights',   folder: 'insites',    typecode: 'dt' },
  { type: 'background', folder: 'backgrnd',   typecode: 'in' },
  { type: 'halacha',    folder: 'halachah',   typecode: 'hl' },
  { type: 'tosfos',     folder: 'tosfos',     typecode: 'ts' },
  { type: 'review',     folder: 'review',     typecode: 'rg', query: '?q=1' },
  { type: 'points',     folder: 'points',     typecode: 'ps' },
  { type: 'hebcharts',  folder: 'hebcharts',  typecode: 'tl', hebrew: true },
  { type: 'yerushalmi', folder: 'yerushalmi', typecode: 'yr', hebrew: true },
];

export function getContentTypeSpec(type: DafyomiContentType): DafyomiContentTypeSpec {
  const spec = DAFYOMI_CONTENT_TYPES.find((s) => s.type === type);
  if (!spec) throw new Error(`unknown dafyomi content type: ${type}`);
  return spec;
}

/** Static per-masechet table. `tractate` is the app value (see tractates.ts).
 *  `dir`/`prefix`/`gid` are the dafyomi.co.il values.
 *
 *  ONLY Chullin is verified against live pages (the v1 pilot). Every other row
 *  is seeded from a best-effort survey and MUST be verified before scraping —
 *  a wrong dir/prefix simply 404s, which the scraper reports as "all content
 *  absent for this daf" (a loud mapping-bug signal), so nothing is fabricated. */
interface DafyomiMasechetSeed {
  tractate: string;
  dir: string;
  prefix: string;
  gid: number;
  /** Revach l'Daf masechet id (revdaf.php?tid=). Differs from `gid`; only set
   *  for tractates whose Revach `tid` has been confirmed. Absent => Revach is
   *  skipped for that masechet (never guessed). */
  tid?: number;
  verified?: boolean;
}

const SEED: DafyomiMasechetSeed[] = [
  { tractate: 'Chullin', dir: 'chulin', prefix: 'ch', gid: 33, tid: 31, verified: true },

  // TODO: verify dir/prefix/gid against live pages before scraping these.
  { tractate: 'Berakhot',     dir: 'berachos',   prefix: 'br', gid: 1 },
  { tractate: 'Shabbat',      dir: 'shabbos',    prefix: 'sh', gid: 2 },
  { tractate: 'Eruvin',       dir: 'eruvin',     prefix: 'er', gid: 3 },
  { tractate: 'Pesachim',     dir: 'pesachim',   prefix: 'ps', gid: 4 },
  { tractate: 'Shekalim',     dir: 'shekalim',   prefix: 'sk', gid: 5 },
  { tractate: 'Yoma',         dir: 'yoma',       prefix: 'yo', gid: 6 },
  { tractate: 'Sukkah',       dir: 'sukah',      prefix: 'su', gid: 7 },
  { tractate: 'Beitzah',      dir: 'beitzah',    prefix: 'bt', gid: 8 },
  { tractate: 'Rosh Hashanah',dir: 'roshhashanah',prefix:'rh', gid: 9 },
  { tractate: 'Taanit',       dir: 'taanis',     prefix: 'tn', gid: 10 },
  { tractate: 'Megillah',     dir: 'megilah',    prefix: 'mg', gid: 11 },
  { tractate: 'Moed Katan',   dir: 'moedkatan',  prefix: 'mo', gid: 12 },
  { tractate: 'Chagigah',     dir: 'chagigah',   prefix: 'cg', gid: 13 },
  { tractate: 'Yevamot',      dir: 'yevamos',    prefix: 'ye', gid: 14 },
  { tractate: 'Ketubot',      dir: 'kesuvos',    prefix: 'ks', gid: 15 },
  { tractate: 'Nedarim',      dir: 'nedarim',    prefix: 'nd', gid: 16 },
  { tractate: 'Nazir',        dir: 'nazir',      prefix: 'nz', gid: 17 },
  { tractate: 'Sotah',        dir: 'sotah',      prefix: 'so', gid: 18 },
  { tractate: 'Gittin',       dir: 'gitin',      prefix: 'gi', gid: 19 },
  { tractate: 'Kiddushin',    dir: 'kidushin',   prefix: 'kd', gid: 20 },
  { tractate: 'Bava Kamma',   dir: 'bkama',      prefix: 'bk', gid: 21 },
  { tractate: 'Bava Metzia',  dir: 'bmetzia',    prefix: 'bm', gid: 22 },
  { tractate: 'Bava Batra',   dir: 'bavabasra',  prefix: 'bb', gid: 23 },
  { tractate: 'Sanhedrin',    dir: 'sanhedrin',  prefix: 'sn', gid: 24 },
  { tractate: 'Makkot',       dir: 'makos',      prefix: 'ma', gid: 25 },
  { tractate: 'Shevuot',      dir: 'shevuos',    prefix: 'sv', gid: 26 },
  { tractate: 'Avodah Zarah', dir: 'avodahzarah',prefix: 'az', gid: 27 },
  { tractate: 'Horayot',      dir: 'horayos',    prefix: 'ho', gid: 30 },
  { tractate: 'Zevachim',     dir: 'zevachim',   prefix: 'zv', gid: 31 },
  { tractate: 'Menachot',     dir: 'menachos',   prefix: 'mn', gid: 32 },
  { tractate: 'Bekhorot',     dir: 'bechoros',   prefix: 'be', gid: 34 },
  { tractate: 'Arakhin',      dir: 'erchin',     prefix: 'er', gid: 35 },
  { tractate: 'Temurah',      dir: 'temurah',    prefix: 'tm', gid: 36 },
  { tractate: 'Keritot',      dir: 'kerisus',    prefix: 'kr', gid: 37 },
  { tractate: 'Meilah',       dir: 'meilah',     prefix: 'ml', gid: 38 },
  { tractate: 'Niddah',       dir: 'nidah',      prefix: 'ni', gid: 42 },
];

export interface DafyomiMasechet {
  /** App tractate value (tractates.ts), e.g. "Chullin". */
  tractate: string;
  /** dafyomi.co.il directory segment, e.g. "chulin". */
  dir: string;
  /** Filename prefix, e.g. "ch" (differs from dir for some, e.g. "bk"/"bkama"). */
  prefix: string;
  /** galei gid query param. */
  gid: number;
  /** Revach l'Daf masechet id (revdaf.php?tid=), or undefined if not mapped. */
  tid?: number;
  /** Highest Bavli daf number (dafim run 2..lastDaf), derived from amudim.ts. */
  lastDaf: number;
  /** Whether the dir/prefix/gid have been confirmed against live pages. */
  verified: boolean;
}

const BY_TRACTATE = new Map<string, DafyomiMasechetSeed>(
  SEED.map((s) => [s.tractate.toLowerCase(), s]),
);

/** Highest daf number from amudim.ts end-amud (e.g. "142a" -> 142). */
function lastDafOf(tractate: string): number | null {
  const end = TRACTATE_END_AMUD[tractate.toLowerCase()];
  if (!end) return null;
  const m = end.match(/^(\d+)[ab]$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Resolve an app tractate value to its dafyomi.co.il coordinates, or null if
 *  the tractate isn't mapped / has no known daf bounds. Callers must treat
 *  null as a hard stop (fail loud) — never guess a dir/prefix. */
export function getDafyomiMasechet(tractate: string): DafyomiMasechet | null {
  const seed = BY_TRACTATE.get(tractate.toLowerCase());
  if (!seed) return null;
  const lastDaf = lastDafOf(seed.tractate);
  if (lastDaf == null) return null;
  return { ...seed, lastDaf, verified: seed.verified ?? false };
}

/** Daf number -> zero-padded 3-digit string. Throws outside 1..999. */
export function dafToNNN(daf: number): string {
  if (!Number.isInteger(daf) || daf < 1 || daf > 999) {
    throw new Error(`daf out of range for dafyomi filename: ${daf}`);
  }
  return String(daf).padStart(3, '0');
}

const ORIGIN = 'https://www.dafyomi.co.il';

/** Build the live page URL covering both amudim of `daf` for one content type. */
export function buildDafyomiUrl(
  m: DafyomiMasechet,
  spec: DafyomiContentTypeSpec,
  daf: number,
): string {
  return `${ORIGIN}/${m.dir}/${spec.folder}/${m.prefix}-${spec.typecode}-${dafToNNN(daf)}.htm${spec.query ?? ''}`;
}

/** Build the Revach l'Daf page URL for `daf`, or null when the masechet has no
 *  known Revach `tid` (so we never guess one). Revach uses the memdb app
 *  (revdaf.php?tid=&id=NN), not the folder/typecode .htm tree — `id` is the
 *  plain Bavli daf number with no zero-padding. */
export function buildRevachUrl(m: DafyomiMasechet, daf: number): string | null {
  if (m.tid == null) return null;
  return `${ORIGIN}/memdb/revdaf.php?tid=${m.tid}&id=${daf}`;
}
