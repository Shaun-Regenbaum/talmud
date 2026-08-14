/** What KIND of reading a passage is — the one dimension the parsha map
 *  colours by. Five values, not three: a Torah year that only knows narrative /
 *  law / discourse paints Ha'azinu and the Song of the Sea as "discourse" and
 *  the Pekudei inventory or the Bemidbar census as "law", which is the one
 *  thing they are not. */
export type ParshaSectionKind = 'narrative' | 'law' | 'discourse' | 'poetry' | 'records';

export const PARSHA_KINDS: readonly ParshaSectionKind[] = [
  'narrative',
  'law',
  'discourse',
  'poetry',
  'records',
];

export interface ParshaRange {
  book: string;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

export interface WeeklyParsha extends ParshaRange {
  name: string;
  heName: string;
  ref: string;
  chapter: number;
  /** The week's seven aliyot as Sefaria refs, from the calendar payload's
   *  `extraDetails.aliyot`. Empty when the calendar omits them (or when a
   *  pre-aliyot entry is still warm in KV). */
  aliyot: string[];
}

export interface ParshaFlowSection {
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
  ref: string;
  kind: ParshaSectionKind;
  titleEn: string;
  titleHe: string;
  summaryEn: string;
  summaryHe: string;
}

export interface ParshaLandmark {
  chapter: number;
  verse: number;
  ref: string;
  labelEn: string;
  labelHe: string;
}

/** A Hebrew term the parsha prose uses inline (the talmud reader's gloss
 *  convention): `he` is the exact Hebrew-script surface as written in the
 *  prose, `en` the short English meaning shown as the hover hint. */
export interface ParshaTerm {
  he: string;
  en: string;
}

/** Where a flow unit, a landmark, or an aliyah SITS in the portion, measured
 *  in verses from its first verse. This is the whole map: every layer is an
 *  offset plus a length on one 0..totalVerses axis, so the client draws them
 *  without knowing anything about chapter lengths. */
export interface ParshaSpan {
  /** Index into the study's own `flow` / `landmarks` array. */
  index: number;
  offset: number;
  verses: number;
}

export interface ParshaAliyahSpan extends ParshaSpan {
  /** 1-7. Maftir is deliberately absent: it re-reads the end of the seventh
   *  aliyah, so drawing it as an eighth band would double-count the portion. */
  n: number;
  ref: string;
}

/** The deterministic layer under the AI's flow — verse extents, the seven
 *  aliyot, and where each chapter begins. Null when the book's chapter lengths
 *  can't be resolved; the reader then falls back to the un-mapped list rather
 *  than drawing a portion at made-up proportions. */
export interface ParshaMap {
  totalVerses: number;
  units: ParshaSpan[];
  landmarks: ParshaSpan[];
  aliyot: ParshaAliyahSpan[];
  chapters: { chapter: number; offset: number }[];
}

export interface ParshaStudy {
  name: string;
  heName: string;
  ref: string;
  book: string;
  startChapter: number;
  titleEn: string;
  titleHe: string;
  overviewEn: string;
  overviewHe: string;
  /** MEASURED from the anchored units (verses per kind), not asserted by the
   *  model — so the legend can never disagree with the map above it. Empty
   *  when there is no map to measure. */
  composition: Partial<Record<ParshaSectionKind, number>>;
  map: ParshaMap | null;
  flow: ParshaFlowSection[];
  landmarks: ParshaLandmark[];
  terms: ParshaTerm[];
}

/** The in-depth close reading of one flow section (the click-a-move surface). */
export interface ParshaSectionStudy {
  titleEn: string;
  titleHe: string;
  en: string;
  he: string;
  terms: ParshaTerm[];
}

export interface ParshaThreadSource {
  ref: string;
  labelEn: string;
  labelHe: string;
  contributionEn: string;
  contributionHe: string;
}

export interface ParshaThread {
  titleEn: string;
  titleHe: string;
  questionEn: string;
  questionHe: string;
  insightEn: string;
  insightHe: string;
  dvarEn: string;
  dvarHe: string;
  sources: ParshaThreadSource[];
}

const PARSHA_REF_RE = /^(.+?)\s+(\d+):(\d+)\s*[-–—]\s*(?:(\d+):)?(\d+)$/;

/** Parse the single-book range shape Sefaria uses for the weekly Torah portion. */
export function parseParshaRef(ref: string): ParshaRange | null {
  const match = ref.trim().match(PARSHA_REF_RE);
  if (!match) return null;
  const startChapter = Number(match[2]);
  const startVerse = Number(match[3]);
  const endChapter = match[4] ? Number(match[4]) : startChapter;
  const endVerse = Number(match[5]);
  if (
    !match[1] ||
    !Number.isInteger(startChapter) ||
    !Number.isInteger(startVerse) ||
    !Number.isInteger(endChapter) ||
    !Number.isInteger(endVerse) ||
    startChapter < 1 ||
    startVerse < 1 ||
    endChapter < startChapter ||
    endVerse < 1
  ) {
    return null;
  }
  return { book: match[1], startChapter, startVerse, endChapter, endVerse };
}

export function formatParshaRange(
  book: string,
  range: Pick<ParshaRange, 'startChapter' | 'startVerse' | 'endChapter' | 'endVerse'>,
): string {
  const start = `${range.startChapter}:${range.startVerse}`;
  const end =
    range.endChapter === range.startChapter
      ? String(range.endVerse)
      : `${range.endChapter}:${range.endVerse}`;
  return `${book} ${start}–${end}`;
}

export function pointInParsha(
  range: ParshaRange,
  point: { chapter: number; verse: number },
): boolean {
  if (point.chapter < range.startChapter || point.chapter > range.endChapter) return false;
  if (point.chapter === range.startChapter && point.verse < range.startVerse) return false;
  if (point.chapter === range.endChapter && point.verse > range.endVerse) return false;
  return point.verse >= 1;
}

export function sectionInParsha(
  range: ParshaRange,
  section: Pick<ParshaRange, 'startChapter' | 'startVerse' | 'endChapter' | 'endVerse'>,
): boolean {
  const start = { chapter: section.startChapter, verse: section.startVerse };
  const end = { chapter: section.endChapter, verse: section.endVerse };
  if (!pointInParsha(range, start) || !pointInParsha(range, end)) return false;
  return (
    section.endChapter > section.startChapter ||
    (section.endChapter === section.startChapter && section.endVerse >= section.startVerse)
  );
}

const HAS_HEBREW = /[\u0590-\u05FF]/;

/** Keep only well-formed hover-hint terms: a Hebrew-script surface plus a short
 *  English meaning, deduped by surface (first entry wins, so a section's own
 *  terms can outrank the whole-parsha pool when concatenated ahead of it). */
export function sanitizeParshaTerms(value: unknown, cap = 24): ParshaTerm[] {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: ParshaTerm[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const he = String((item as Record<string, unknown>).he ?? '').trim();
    const en = String((item as Record<string, unknown>).en ?? '').trim();
    if (!he || !en || he.length > 60 || en.length > 120) continue;
    if (!HAS_HEBREW.test(he) || HAS_HEBREW.test(en)) continue;
    if (seen.has(he)) continue;
    seen.add(he);
    out.push({ he, en });
  }
  return out.slice(0, cap);
}

export interface TermMentionPart {
  kind: 'text' | 'term';
  value: string;
  term?: ParshaTerm;
}

/** Split prose into plain-text and term-mention parts, matching ONLY the
 *  Hebrew surfaces — the English meanings are everyday words ("blessing",
 *  "curse") and matching them would mis-fire, whereas Hebrew script inside
 *  English prose is unambiguous. Longest surface wins at a position; a match
 *  must not touch adjacent Hebrew letters (so a prefixed form like הברכה is
 *  left alone rather than half-underlined). Pure, shared with tests. */
export function tokenizeTermMentions(
  text: string,
  terms: readonly ParshaTerm[],
): TermMentionPart[] {
  if (!text) return [];
  const usable = terms.filter((t) => t.he && HAS_HEBREW.test(t.he));
  if (!usable.length) return [{ kind: 'text', value: text }];
  const bySurface = new Map<string, ParshaTerm>();
  for (const t of usable) if (!bySurface.has(t.he)) bySurface.set(t.he, t);
  const surfaces = [...bySurface.keys()]
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<![\\u0590-\\u05FF])(${surfaces.join('|')})(?![\\u0590-\\u05FF])`, 'gu');
  const out: TermMentionPart[] = [];
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const term = bySurface.get(m[1]);
    if (!term) continue;
    if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) });
    out.push({ kind: 'term', value: m[1], term });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

/** How far into the portion a verse sits, counted in verses from its first —
 *  the one coordinate every layer of the map shares. Null if the point falls
 *  outside the portion or a chapter length is missing. `chapterLengths` is
 *  1-indexed by chapter number (Sefaria's book shape). */
export function verseOffset(
  range: ParshaRange,
  chapterLengths: readonly number[],
  point: { chapter: number; verse: number },
): number | null {
  if (!pointInParsha(range, point)) return null;
  // pointInParsha only bounds the point by the portion's ends, so a verse that
  // doesn't exist in a chapter the portion passes THROUGH (18:99) would sail
  // past it and place a span off the end of the strip.
  const own = chapterLengths[point.chapter - 1];
  if (!Number.isFinite(own) || point.verse > own) return null;
  let offset = 0;
  for (let chapter = range.startChapter; chapter < point.chapter; chapter++) {
    const length = chapterLengths[chapter - 1];
    if (!Number.isFinite(length) || length < 1) return null;
    offset += chapter === range.startChapter ? length - range.startVerse + 1 : length;
  }
  return (
    offset +
    (point.chapter === range.startChapter ? point.verse - range.startVerse : point.verse - 1)
  );
}

function spanOf(
  range: ParshaRange,
  chapterLengths: readonly number[],
  section: Pick<ParshaRange, 'startChapter' | 'startVerse' | 'endChapter' | 'endVerse'>,
  index: number,
): ParshaSpan | null {
  if (!sectionInParsha(range, section)) return null;
  const start = verseOffset(range, chapterLengths, {
    chapter: section.startChapter,
    verse: section.startVerse,
  });
  const end = verseOffset(range, chapterLengths, {
    chapter: section.endChapter,
    verse: section.endVerse,
  });
  if (start === null || end === null || end < start) return null;
  return { index, offset: start, verses: end - start + 1 };
}

/**
 * Lay the portion out on one verse axis: the AI's flow units, the landmarks,
 * the seven aliyot, and the chapter starts, each as an offset + length. Pure —
 * the route supplies the book's chapter lengths, everything else is arithmetic.
 *
 * Returns null when the portion itself can't be measured. Individual layers
 * degrade independently: a unit that doesn't sit inside the portion is dropped
 * from the map (it still renders in the list), and an unparseable aliyah ref
 * costs only that band.
 */
export function buildParshaMap(input: {
  range: ParshaRange;
  chapterLengths: readonly number[];
  flow: readonly Pick<
    ParshaFlowSection,
    'startChapter' | 'startVerse' | 'endChapter' | 'endVerse'
  >[];
  landmarks: readonly { chapter: number; verse: number }[];
  aliyot: readonly string[];
}): ParshaMap | null {
  const { range, chapterLengths } = input;
  const last = verseOffset(range, chapterLengths, {
    chapter: range.endChapter,
    verse: range.endVerse,
  });
  if (last === null) return null;
  const totalVerses = last + 1;

  const units: ParshaSpan[] = [];
  input.flow.forEach((section, index) => {
    const span = spanOf(range, chapterLengths, section, index);
    if (span) units.push(span);
  });

  const landmarks: ParshaSpan[] = [];
  input.landmarks.forEach((landmark, index) => {
    const offset = verseOffset(range, chapterLengths, landmark);
    if (offset !== null) landmarks.push({ index, offset, verses: 1 });
  });

  // The calendar lists seven aliyot plus maftir, and maftir re-reads the tail
  // of the seventh — so only the seven divide the portion.
  const aliyot: ParshaAliyahSpan[] = [];
  input.aliyot.slice(0, 7).forEach((ref, index) => {
    const parsed = parseParshaRef(ref);
    if (!parsed || parsed.book !== range.book) return;
    const span = spanOf(range, chapterLengths, parsed, index);
    if (span) aliyot.push({ ...span, n: index + 1, ref });
  });

  const chapters: { chapter: number; offset: number }[] = [];
  for (let chapter = range.startChapter; chapter <= range.endChapter; chapter++) {
    const offset =
      chapter === range.startChapter
        ? 0
        : verseOffset(range, chapterLengths, { chapter, verse: 1 });
    if (offset !== null) chapters.push({ chapter, offset });
  }

  return { totalVerses, units, landmarks, aliyot, chapters };
}

/** One move's place in the drawn column: where its stretch of the ribbon
 *  actually is, and where its title can be written without landing on its
 *  neighbour's. */
export interface ParshaColumnRow {
  index: number;
  /** The ribbon segment — exactly proportional, never nudged. */
  segTop: number;
  segHeight: number;
  /** The title's baseline row, pushed down where the segment is too short to
   *  hold a line of text. */
  labelTop: number;
}

/**
 * Lay the portion out as a vertical column: the ribbon keeps true proportions
 * (it is the map, and a nudged map lies), while the titles beside it are
 * pushed down just enough to stay legible.
 *
 * A two-verse unit is four pixels tall on a 430px column — its title has to
 * sit lower than its segment or overlap the next one. Each label therefore
 * takes the later of its own segment top and `minGap` below the previous
 * label, and the column grows if the last one runs past the bottom.
 */
export function layoutParshaColumn(
  spans: readonly ParshaSpan[],
  options: { totalVerses: number; height: number; minGap: number },
): { rows: ParshaColumnRow[]; height: number } {
  const { totalVerses, height, minGap } = options;
  if (!(totalVerses > 0) || !(height > 0)) return { rows: [], height };
  const rows: ParshaColumnRow[] = [];
  let previous = Number.NEGATIVE_INFINITY;
  for (const span of [...spans].sort((a, b) => a.offset - b.offset)) {
    const segTop = (span.offset / totalVerses) * height;
    const segHeight = (span.verses / totalVerses) * height;
    const labelTop = Math.max(segTop, previous + minGap);
    previous = labelTop;
    rows.push({ index: span.index, segTop, segHeight, labelTop });
  }
  const last = rows.at(-1);
  return { rows, height: last ? Math.max(height, last.labelTop + minGap) : height };
}

/**
 * The share of the PORTION each kind of reading takes, counted verse by verse
 * off the anchored units.
 *
 * Deliberately painted rather than summed: units are supposed to tile the
 * portion, but nothing forces them to. Summing unit lengths would double-count
 * an overlap and would quietly renormalize a gap away — ten law verses in a
 * hundred-verse portion reporting "law 100%". Painting each verse once (a
 * later unit wins the overlap, exactly as it wins on the drawn strip) makes
 * the percentages shares of the whole portion, so an incompletely covered
 * portion honestly totals less than 100.
 *
 * Largest-remainder rounding, so a fully covered portion totals exactly 100
 * and a kind with any verses at all never rounds away to nothing. Kinds with
 * no verses are absent rather than zero.
 */
export function measureComposition(
  totalVerses: number,
  units: readonly { kind: ParshaSectionKind; offset: number; verses: number }[],
): Partial<Record<ParshaSectionKind, number>> {
  if (!(totalVerses > 0)) return {};
  const painted: (ParshaSectionKind | undefined)[] = new Array(totalVerses);
  for (const unit of units) {
    if (!PARSHA_KINDS.includes(unit.kind) || !(unit.verses > 0)) continue;
    const from = Math.max(0, unit.offset);
    const to = Math.min(totalVerses, unit.offset + unit.verses);
    for (let at = from; at < to; at += 1) painted[at] = unit.kind;
  }
  const verses = new Map<ParshaSectionKind, number>();
  let counted = 0;
  for (const kind of painted) {
    if (!kind) continue;
    verses.set(kind, (verses.get(kind) ?? 0) + 1);
    counted += 1;
  }
  if (!counted) return {};
  const shares = [...verses.entries()].map(([kind, n]) => {
    const exact = (n / totalVerses) * 100;
    const floor = Math.floor(exact);
    return { kind, whole: Math.max(1, floor), remainder: exact - floor };
  });
  // Hand out whatever the floors left over (or claw back what the min-1 floor
  // overspent) one point at a time, largest fractional part first. The target
  // is the COVERED share, not a flat 100 — an uncovered stretch of the portion
  // is left uncounted instead of being handed to whichever kind rounds best.
  const target = Math.round((counted / totalVerses) * 100);
  let slack = target - shares.reduce((sum, s) => sum + s.whole, 0);
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder);
  for (let step = 0; slack > 0 && step < 100; step += 1) {
    byRemainder[step % byRemainder.length].whole += 1;
    slack -= 1;
  }
  const bySize = [...shares].sort((a, b) => b.whole - a.whole);
  for (let step = 0; slack < 0 && step < 100; step += 1) {
    const share = bySize[step % bySize.length];
    if (share.whole <= 1) continue;
    share.whole -= 1;
    slack += 1;
  }
  const out: Partial<Record<ParshaSectionKind, number>> = {};
  for (const kind of PARSHA_KINDS) {
    const share = shares.find((s) => s.kind === kind);
    if (share) out[kind] = share.whole;
  }
  return out;
}
