/**
 * Pure helpers for the halacha card's list of codes (HalachaCodes in
 * ArgumentSidebar). The list itself comes from Sefaria — GET
 * /api/halacha-text?start=&end= returns the Rambam / Tur / Shulchan Aruch refs
 * linked to the topic's daf lines. The AI's one-line summaries
 * (halacha.codification) are only ATTACHED to a row whose ref they name, so a ref
 * the model cited that Sefaria does not link to these lines never shows.
 */

import { type CodifierId, sameCodeRef, type TopicCodifier } from '../lib/halacha/codifiers';
import type { CatalogKey } from './i18n';

/** Dispute side → dot colour, in the Voices map palette (A blue, B red). */
export const SIDE_COLOR: Record<'a' | 'b' | 'neutral', string> = {
  a: '#34506f', // position A: ink blue
  b: '#9c4a36', // position B: brick
  neutral: '#5b5f66', // slate
};

/** The halacha.codification enrichment output: one ruling per codifier. */
export interface CodificationRuling {
  ref: string;
  ruling: string;
}
export interface CodificationData {
  mishnehTorah: CodificationRuling | null;
  tur: CodificationRuling | null;
  shulchanAruch: CodificationRuling | null;
  rema: CodificationRuling | null;
  prose: string;
}

const FIELD_BY_CODIFIER: Partial<Record<CodifierId, keyof CodificationData>> = {
  'mishneh-torah': 'mishnehTorah',
  tur: 'tur',
  'shulchan-aruch': 'shulchanAruch',
};

export const CODIFIER_LABEL_KEY: Partial<Record<CodifierId, CatalogKey>> = {
  'mishneh-torah': 'source.rambam',
  tur: 'source.tur',
  'shulchan-aruch': 'source.shulchanAruch',
};

function rulingOf(v: unknown): CodificationRuling | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<CodificationRuling>;
  return typeof r.ref === 'string' && typeof r.ruling === 'string' && r.ruling.trim()
    ? { ref: r.ref, ruling: r.ruling }
    : null;
}

/** The AI summary for one listed code ref, or '' when the codification did not
 *  cite that ref for that codifier. */
export function summaryFor(
  codification: CodificationData | undefined,
  codifier: CodifierId,
  ref: string,
): string {
  const field = FIELD_BY_CODIFIER[codifier];
  const r = field && codification ? rulingOf(codification[field]) : null;
  return r && sameCodeRef(r.ref, ref) ? r.ruling : '';
}

/** The AI summary of the Rema's gloss on a listed Shulchan Aruch ref, or ''. */
export function remaSummaryFor(codification: CodificationData | undefined, ref: string): string {
  const r = rulingOf(codification?.rema);
  return r && sameCodeRef(r.ref, ref) ? r.ruling : '';
}

/** Sefaria page for a code ref ("Shulchan Arukh, Orach Chayim 235:1"). */
export function sefariaUrl(ref: string): string {
  return `https://www.sefaria.org/${encodeURIComponent(ref.replace(/ /g, '_'))}`;
}

/** The codes response for a topic (GET /api/halacha-text?start=&end=). */
export async function fetchTopicCodes(args: {
  tractate: string;
  page: string;
  start: number;
  end: number;
}): Promise<TopicCodifier[]> {
  try {
    const r = await fetch(
      `/api/halacha-text/${encodeURIComponent(args.tractate)}/${encodeURIComponent(args.page)}?start=${args.start}&end=${args.end}`,
    );
    if (!r.ok) return [];
    return ((await r.json()) as { codes?: TopicCodifier[] }).codes ?? [];
  } catch {
    return [];
  }
}
