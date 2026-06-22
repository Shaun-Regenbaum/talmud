/**
 * Real data for the "show, don't tell" worked example on #howitworks. A spine
 * IS the text, so we show the actual daf: Berakhot 2a's ordered segments
 * (/api/daf), with the real `argument` sections (/api/daf-view) as the spans a
 * piece can anchor to. The page demonstrates spine -> anchor -> artifact ->
 * producer on this live content.
 */
import { createResource, type Resource } from 'solid-js';

const TRACTATE = 'berakhot';
const PAGE = '2a';

/** Strip Sefaria/HebrewBooks markup so a segment/title is plain text. */
export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Section {
  idx: number;
  title: string;
  startSeg: number;
  endSeg: number;
}

export interface WorkedExample {
  tractate: string;
  page: string;
  /** The producer that discovers the sections. */
  producerId: string;
  segsHe: string[];
  segsEn: string[];
  sections: Section[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

interface RawInstance {
  startSegIdx?: number;
  endSegIdx?: number;
  fields?: Record<string, unknown>;
}

/** Pure: project a /api/daf-view response into the section spans. */
export function sectionsFromView(view: unknown): Section[] {
  const pieces = (view as { pieces?: Record<string, { parsed?: unknown }> })?.pieces;
  const parsed = pieces?.argument?.parsed as { instances?: RawInstance[] } | undefined;
  const insts = parsed?.instances;
  if (!Array.isArray(insts)) return [];
  return insts.map((i, idx) => ({
    idx,
    title: stripHtml(str(i.fields?.title)) || `Section ${idx + 1}`,
    startSeg: num(i.startSegIdx),
    endSeg: num(i.endSegIdx),
  }));
}

async function fetchExample(): Promise<WorkedExample> {
  const [dafR, viewR] = await Promise.allSettled([
    fetch(`/api/daf/${TRACTATE}/${PAGE}?source=sefaria`),
    fetch(`/api/daf-view/${TRACTATE}/${PAGE}`),
  ]);

  let segsHe: string[] = [];
  let segsEn: string[] = [];
  if (dafR.status === 'fulfilled' && dafR.value.ok) {
    const j = (await dafR.value.json()) as { mainSegmentsHe?: string[]; mainSegmentsEn?: string[] };
    segsHe = (j.mainSegmentsHe ?? []).map(stripHtml);
    segsEn = (j.mainSegmentsEn ?? []).map(stripHtml);
  }

  let sections: Section[] = [];
  if (viewR.status === 'fulfilled' && viewR.value.ok) {
    sections = sectionsFromView(await viewR.value.json());
  }

  return { tractate: TRACTATE, page: PAGE, producerId: 'argument', segsHe, segsEn, sections };
}

export function useWorkedExample(): Resource<WorkedExample> {
  const [example] = createResource(fetchExample);
  return example;
}
