/**
 * Align dafyomi.co.il "Yerushalmi to Match" outline points to the Bavli daf's
 * actual segments — i.e. identify WHICH PART of the Bavli has a Yerushalmi
 * parallel, deterministically.
 *
 * The outline points carry the YERUSHALMI text, not the Bavli text, so we can't
 * match them directly. But the genuinely-parallel material is the shared layer —
 * the Mishnah (verbatim in both), quoted baraitot, biblical citations — so a
 * point that shares a long verbatim phrase with a Bavli segment is anchored to
 * it; points whose Yerushalmi text diverges (the gemara discussion) stay
 * unanchored. Precision over recall: a wrong anchor is worse than none.
 *
 * The matcher is the n-gram / longest-common-run local alignment the research
 * recommended, run point↔segment over normalized Hebrew (nikud/punct stripped).
 */
import { normalizeHebrew, buildVerbatimGrid } from './place/verbatim.ts';
import type { DafyomiEntry, DafyomiRef } from './sefref/dafyomi/schema.ts';

/** Minimum shared contiguous normalized-word run to assert a parallel anchor. */
export const MIN_SHARED_RUN = 3;

/** Minimum verbatim shared-run length for a GUARANTEED ("floor") anchor. Higher
 *  than MIN_SHARED_RUN because a floor anchor fires even when the LLM declined to
 *  emit one, so the shared run must be too long to be coincidental — a real
 *  shared mishnah/baraita line, not a stray formulaic phrase (תא שמע, אמר רבא).
 *  Empirically: shared-mishnah dapim score 8-26 here; a daf whose best run is the
 *  3-word minimum (Sanhedrin 90a) is correctly NOT floored. */
export const MIN_FLOOR_RUN = 6;

/** Two same-ref placed points within this many segments merge into one span. */
const FLOOR_MERGE_GAP = 2;

/** A deterministic "floor" anchor: a Bavli segment span that PROVABLY shares a
 *  long verbatim phrase with a single Yerushalmi ref. Guarantees the mark fires
 *  on the precision-safe shared-text cases regardless of the LLM's discretion. */
export interface YerushalmiFloorGroup {
  startSegIdx: number;
  endSegIdx: number;
  /** Sefaria ref the span parallels. */
  yerushalmiRef?: string;
  /** Verbatim shared Bavli phrase at the span start (for the anchor excerpt). */
  excerpt?: string;
  /** Longest shared run in the group, in normalized words. */
  topScore: number;
  /** The aligned outline points in this span (for fallback differences). */
  points: YerushalmiOutlinePoint[];
}

export interface YerushalmiOutlinePoint {
  /** The parent point's English topic heading. */
  topic: string;
  /** Sefaria ref of the parallel ("Jerusalem Talmud Berakhot 1:1") when the
   *  dafyomi ref resolves to a perek:halachah; else undefined. */
  yerushalmiRef?: string;
  /** Raw dafyomi citation ("Yerushalmi Perek 1 Halachah 1 Daf 1a"). */
  refRaw?: string;
  marker?: string;
  label?: string;
  he: string;
  en: string;
  /** Bavli segment this point parallels (verbatim shared phrase), if any. */
  segIdx?: number;
  /** The shared verbatim Bavli phrase (for highlighting), original spelling. */
  excerpt?: string;
  /** Shared-run length in normalized words (confidence). */
  score?: number;
}

// dafyomi (Ashkenazi) -> Sefaria Yerushalmi tractate spelling, for the
// cross-tractate refs (e.g. Bavli Chullin -> Yerushalmi Terumot). Same-tractate
// refs use the daf's own masechet, which already matches Sefaria.
const YERU_TRACTATE_ALIAS: Record<string, string> = {
  Terumos: 'Terumot', Maasros: 'Maasrot', "Maaser": 'Maaser Sheni', Sheviis: 'Sheviit',
  Bikurim: 'Bikkurim', Challah: 'Challah', Orlah: 'Orlah', Demai: 'Demai', Peah: 'Peah',
  Shabbos: 'Shabbat', Beitzah: 'Beitzah', Pesachim: 'Pesachim',
};

/** Build the Sefaria "Jerusalem Talmud <Tractate> <perek>:<halachah>" ref from a
 *  dafyomi yerushalmi DafyomiRef, defaulting the tractate to the daf's masechet. */
export function yerushalmiRefToSefaria(ref: DafyomiRef, dafMasechet: string): string | undefined {
  const detail = ref.detail ?? '';
  if (!/^\d+:\d+$/.test(detail)) return undefined; // need perek:halachah
  const raw = ref.tractate ?? dafMasechet;
  const tractate = YERU_TRACTATE_ALIAS[raw] ?? raw;
  return `Jerusalem Talmud ${tractate} ${detail}`;
}

function firstYerushalmiRef(refs?: DafyomiRef[]): DafyomiRef | undefined {
  return (refs ?? []).find((r) => r.kind === 'yerushalmi');
}

/**
 * Flatten the parsed yerushalmi block into leaf outline points, carrying each
 * point's nearest ancestor topic + Yerushalmi ref. A "leaf" is any entry with
 * Hebrew body text (the granular Yerushalmi unit).
 */
export function flattenYerushalmiOutline(entries: DafyomiEntry[], dafMasechet: string): YerushalmiOutlinePoint[] {
  const out: YerushalmiOutlinePoint[] = [];
  const walk = (e: DafyomiEntry, topic: string, ref: DafyomiRef | undefined) => {
    // A top-level subject sets the topic + ref for everything beneath it.
    const ownRef = firstYerushalmiRef(e.refs);
    const curRef = ownRef ?? ref;
    const curTopic = e.title?.en || topic;
    const he = e.body?.he?.trim();
    const en = e.body?.en?.trim();
    if (he) {
      out.push({
        topic: curTopic,
        refRaw: curRef?.raw,
        yerushalmiRef: curRef ? yerushalmiRefToSefaria(curRef, dafMasechet) : undefined,
        marker: e.marker,
        label: e.label,
        he,
        en: en ?? '',
      });
    }
    for (const c of e.children ?? []) walk(c, curTopic, curRef);
  };
  for (const e of entries) walk(e, '', undefined);
  return out;
}

/** Longest common contiguous run of equal tokens between a and b.
 *  Returns its length and the start index in b (the Bavli segment). */
export function longestCommonRun(a: string[], b: string[]): { len: number; bStart: number } {
  let best = 0;
  let bStart = -1;
  // rolling DP over b for each position in a: prev[j] = run ending at a[i-1], b[j-1]
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) { best = cur[j]; bStart = j - cur[j]; }
      }
    }
    prev = cur;
  }
  return { len: best, bStart };
}

/**
 * Anchor each outline point to the Bavli segment that shares the longest
 * verbatim phrase with it (>= MIN_SHARED_RUN normalized words). Mutates +
 * returns the points with segIdx / excerpt / score filled where a parallel is
 * found; leaves the rest unanchored.
 */
export function alignOutlineToSegments(
  points: YerushalmiOutlinePoint[],
  segmentsHe: string[],
): YerushalmiOutlinePoint[] {
  const grid = buildVerbatimGrid(segmentsHe);
  // Original (whitespace-split) words per segment, to recover a readable excerpt.
  const segOrigWords = segmentsHe.map((s) => normalizeHebrew(s).length ? s.split(/\s+/).filter(Boolean) : []);
  for (const p of points) {
    const pWords = normalizeHebrew(p.he).split(' ').filter(Boolean);
    if (pWords.length < MIN_SHARED_RUN) continue;
    let bestSeg = -1, bestLen = 0, bestStart = -1;
    for (let s = 0; s < grid.segWords.length; s++) {
      const { len, bStart } = longestCommonRun(pWords, grid.segWords[s]);
      if (len > bestLen) { bestLen = len; bestSeg = s; bestStart = bStart; }
    }
    if (bestLen >= MIN_SHARED_RUN && bestSeg >= 0) {
      p.segIdx = bestSeg;
      p.score = bestLen;
      const orig = segOrigWords[bestSeg];
      // normalized split ≈ original whitespace split; take the matched window.
      p.excerpt = orig.slice(bestStart, bestStart + bestLen).join(' ') || undefined;
    }
  }
  return points;
}

/**
 * Collapse the strongly-aligned outline points (a verbatim run >= minRun, i.e. a
 * shared mishnah/baraita line, not a coincidental phrase) into tight Bavli
 * segment spans — the GUARANTEED anchors the mark must surface. Consecutive
 * same-ref points within FLOOR_MERGE_GAP merge into one span; the rest stay
 * separate. The LLM decides nothing here: a daf with a strong shared run always
 * yields a floor anchor, fixing the ~25% LLM firing rate without sacrificing
 * precision (weak/divergent dapim produce no floor group).
 */
export function yerushalmiFloorGroups(
  points: YerushalmiOutlinePoint[],
  minRun = MIN_FLOOR_RUN,
): YerushalmiFloorGroup[] {
  const strong = points
    .filter((p) => p.segIdx != null && (p.score ?? 0) >= minRun)
    .sort((a, b) => (a.segIdx as number) - (b.segIdx as number));
  const groups: YerushalmiFloorGroup[] = [];
  for (const p of strong) {
    const seg = p.segIdx as number;
    const last = groups[groups.length - 1];
    if (last && last.yerushalmiRef === p.yerushalmiRef && seg - last.endSegIdx <= FLOOR_MERGE_GAP) {
      last.endSegIdx = Math.max(last.endSegIdx, seg);
      last.topScore = Math.max(last.topScore, p.score ?? 0);
      last.points.push(p);
    } else {
      groups.push({
        startSegIdx: seg,
        endSegIdx: seg,
        yerushalmiRef: p.yerushalmiRef,
        excerpt: p.excerpt,
        topScore: p.score ?? 0,
        points: [p],
      });
    }
  }
  return groups;
}
