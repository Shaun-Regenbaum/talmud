/**
 * Real data for the "show, don't tell" worked example on #howitworks. Pulls the
 * actual sections of a daf (Berakhot 2a) so the page demonstrates
 * spine -> anchor -> artifact -> producer on live content — a shorter cousin of
 * the #spine statement view.
 *
 * The sections are the real `argument` mark instances (each a titled span of
 * the daf), read from /api/daf-view. They double as the artifact in the walk:
 * a discovered section IS an artifact.
 */
import { createResource, type Resource } from 'solid-js';

const TRACTATE = 'berakhot';
const PAGE = '2a';

/** Strip Sefaria/HebrewBooks markup so a title is plain text. */
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
  /** The producer that discovers these sections. */
  producerId: string;
  sections: Section[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

interface RawInstance {
  startSegIdx?: number;
  endSegIdx?: number;
  fields?: Record<string, unknown>;
}

/** Pure: project a /api/daf-view response into the section cards. */
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
  let sections: Section[] = [];
  try {
    const res = await fetch(`/api/daf-view/${TRACTATE}/${PAGE}`);
    if (res.ok) sections = sectionsFromView(await res.json());
  } catch {
    sections = [];
  }
  return { tractate: TRACTATE, page: PAGE, producerId: 'argument', sections };
}

export function useWorkedExample(): Resource<WorkedExample> {
  const [example] = createResource(fetchExample);
  return example;
}
