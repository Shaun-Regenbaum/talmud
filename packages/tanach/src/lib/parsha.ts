export type ParshaSectionKind = 'narrative' | 'law' | 'discourse';

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
  composition: Record<ParshaSectionKind, number>;
  flow: ParshaFlowSection[];
  landmarks: ParshaLandmark[];
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

/** Normalize an editorial percentage estimate so the three visible bars total 100. */
export function normalizeParshaComposition(value: unknown): Record<ParshaSectionKind, number> {
  const input = (value ?? {}) as Partial<Record<ParshaSectionKind, unknown>>;
  const raw = (['narrative', 'law', 'discourse'] as const).map((key) => {
    const n = Number(input[key]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const total = raw.reduce((sum, n) => sum + n, 0);
  if (!total) return { narrative: 0, law: 0, discourse: 100 };
  const rounded = raw.map((n) => Math.round((n / total) * 100));
  rounded[2] += 100 - rounded.reduce((sum, n) => sum + n, 0);
  return { narrative: rounded[0], law: rounded[1], discourse: rounded[2] };
}
