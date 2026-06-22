/**
 * Real data for the "show, don't tell" worked example on #howitworks. Pulls an
 * actual daf (Berakhot 2a) and one real piece anchored to it, so the page
 * demonstrates spine -> anchor -> artifact -> producer on live content rather
 * than describing it.
 *
 *  - /api/daf       -> the spine: the daf's ordered segments (real text)
 *  - /api/daf-view  -> a real cached `pesukim` instance: a biblical citation
 *                      anchored to one segment (body + segment range)
 */
import { createResource, type Resource } from 'solid-js';

const TRACTATE = 'berakhot';
const PAGE = '2a';

/** Strip Sefaria/HebrewBooks markup so a segment preview is plain text. */
export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface WorkedArtifact {
  producerId: string; // the producer that made it, e.g. 'pesukim'
  kind: string; // 'mark-instance'
  title: string; // e.g. 'Deuteronomy 6:7'
  body: string; // the produced summary
  excerpt?: string; // the Hebrew phrase it cites
  startSeg: number;
  endSeg: number;
}

export interface WorkedExample {
  tractate: string;
  page: string;
  segsEn: string[];
  segsHe: string[];
  artifact: WorkedArtifact | null;
}

interface RawInstance {
  startSegIdx?: number;
  endSegIdx?: number;
  fields?: Record<string, unknown>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function pickPesukim(view: unknown): WorkedArtifact | null {
  const pieces = (view as { pieces?: Record<string, { parsed?: unknown }> })?.pieces;
  const parsed = pieces?.pesukim?.parsed as { instances?: RawInstance[] } | undefined;
  const inst = parsed?.instances?.find((i) => typeof i.startSegIdx === 'number');
  if (!inst) return null;
  const f = inst.fields ?? {};
  return {
    producerId: 'pesukim',
    kind: 'mark-instance',
    title: str(f.verseRef) || 'a biblical citation',
    body: str(f.summary),
    excerpt: str(f.excerpt) || undefined,
    startSeg: inst.startSegIdx ?? 0,
    endSeg: inst.endSegIdx ?? inst.startSegIdx ?? 0,
  };
}

async function fetchExample(): Promise<WorkedExample> {
  const [dafR, viewR] = await Promise.allSettled([
    fetch(`/api/daf/${TRACTATE}/${PAGE}?source=sefaria`),
    fetch(`/api/daf-view/${TRACTATE}/${PAGE}`),
  ]);

  let segsEn: string[] = [];
  let segsHe: string[] = [];
  if (dafR.status === 'fulfilled' && dafR.value.ok) {
    const j = (await dafR.value.json()) as { mainSegmentsEn?: string[]; mainSegmentsHe?: string[] };
    segsEn = (j.mainSegmentsEn ?? []).map(stripHtml);
    segsHe = (j.mainSegmentsHe ?? []).map(stripHtml);
  }

  let artifact: WorkedArtifact | null = null;
  if (viewR.status === 'fulfilled' && viewR.value.ok) {
    artifact = pickPesukim(await viewR.value.json());
  }

  return { tractate: TRACTATE, page: PAGE, segsEn, segsHe, artifact };
}

export function useWorkedExample(): Resource<WorkedExample> {
  const [example] = createResource(fetchExample);
  return example;
}
