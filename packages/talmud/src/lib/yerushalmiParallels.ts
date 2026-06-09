/**
 * Curated Bavli<->Yerushalmi parallels — a hand-made cross-Talmud source.
 *
 * Sefaria's link graph exposes NO Bavli<->Yerushalmi parallels, and the
 * mishnah-mapping only finds same-mishnah parallels. This dataset (harvested
 * from Sefaria's editorial "Shared Stories" collection by
 * scripts/harvest-yerushalmi-parallels.mjs) captures curated STORY parallels —
 * often cross-tractate (e.g. Bavli Bava Metzia <-> Yerushalmi Moed Katan) — that
 * neither of those can surface. Small but high-confidence; grows as we harvest
 * more sources. Used to ground the `yerushalmi` mark and surface curated links.
 */
import data from './data/curated-yerushalmi-parallels.json';

export interface CuratedYerushalmiParallel {
  /** Bavli ref (Sefaria), e.g. "Bava Metzia 59a:12-59b:7". */
  bavli: string;
  /** Yerushalmi ref (Sefaria), e.g. "Jerusalem Talmud Moed Katan 3:1:6-10". */
  yerushalmi: string;
  /** Editorial title of the parallel. */
  title: string;
  /** Editorial summary of how the two tellings relate / differ. */
  summary: string;
  sheetId: number;
  url: string;
}

export interface CuratedYerushalmiDataset {
  source: string;
  sourceUrl: string;
  license: string;
  count: number;
  parallels: CuratedYerushalmiParallel[];
}

const DATASET = data as CuratedYerushalmiDataset;

export function curatedYerushalmiDataset(): CuratedYerushalmiDataset {
  return DATASET;
}

/** A daf+amud as a sortable int so ranges compare cleanly ("59a"->118,
 *  "59b"->119, "60a"->120). null if not a daf token. */
function dafOrd(daf: string): number | null {
  const m = daf.match(/^(\d+)([ab])$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 2 + (m[2] === 'b' ? 1 : 0);
}

/**
 * Parse the Bavli side of a curated ref into tractate + inclusive daf range.
 *   "Bava Metzia 59a:12-59b:7" -> { tractate: 'Bava Metzia', start: '59a', end: '59b' }
 *   "Rosh Hashanah 29b:10"     -> { tractate: 'Rosh Hashanah', start: '29b', end: '29b' }
 *   "Moed Katan 20a:10-11"     -> { tractate: 'Moed Katan', start: '20a', end: '20a' }
 * Returns null if no daf token is present.
 */
export function parseBavliRef(
  ref: string,
): { tractate: string; start: string; end: string } | null {
  const m = ref.match(/^(.+?)\s+(\d.*)$/);
  if (!m) return null;
  const tractate = m[1].trim();
  const dafs = m[2].match(/\d+[ab]/g);
  if (!dafs || dafs.length === 0) return null;
  return { tractate, start: dafs[0], end: dafs[dafs.length - 1] };
}

/** Curated parallels whose Bavli ref covers (tractate, page). Tractate must
 *  match exactly (Sefaria spelling, which the reader also uses). */
export function curatedParallelsForDaf(
  tractate: string,
  page: string,
): CuratedYerushalmiParallel[] {
  const want = dafOrd(page);
  if (want == null) return [];
  return DATASET.parallels.filter((p) => {
    const b = parseBavliRef(p.bavli);
    if (!b || b.tractate !== tractate) return false;
    const s = dafOrd(b.start);
    const e = dafOrd(b.end);
    if (s == null || e == null) return false;
    return want >= Math.min(s, e) && want <= Math.max(s, e);
  });
}
