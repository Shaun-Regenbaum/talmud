/**
 * The pesukim STUDY VIEW: every verse a daf quotes, with the verse text and the
 * reader's pasuk-card explanations, assembled into one plain shape.
 *
 * This is what a chavruta actually asks ("what is this pasuk doing here?") and
 * it already existed on the page — as a mark (`pesukim`) plus five per-verse
 * enrichments a caller had to know how to join. GET /api/pesukim/:t/:p does
 * the join; this module is the pure part (no KV), so it is testable.
 */

import type { PasukDetail } from './pasuk';

/** The per-verse enrichments the study view shows, in card order, with the
 *  prose field each one's parsed output carries. */
export const PESUKIM_VIEW_ENRICHMENTS = [
  { id: 'pesukim.synthesis', field: 'synthesis', out: 'synthesis' },
  { id: 'pesukim.tanach-context', field: 'context', out: 'tanachContext' },
  { id: 'pesukim.why-here', field: 'why_here', out: 'whyHere' },
  { id: 'pesukim.mechanism', field: 'mechanism', out: 'mechanism' },
  { id: 'pesukim.landing', field: 'landing', out: 'landing' },
] as const;

export type PesukimEnrichmentId = (typeof PESUKIM_VIEW_ENRICHMENTS)[number]['id'];

/** A `pesukim` mark instance as cached (segInstances shape). */
export interface PesukimInstance {
  startSegIdx?: unknown;
  endSegIdx?: unknown;
  fields?: Record<string, unknown>;
}

export interface PesukimVerse {
  /** Sefaria-style ref as the mark wrote it, e.g. "Proverbs 3:12". */
  ref: string;
  heRef: string | null;
  hebrew: string | null;
  english: string | null;
  /** The verse's chapter on tanach.dev (commentary, context, the whole perek). */
  tanachUrl: string | null;
  /** How the daf cites it: the anchored gemara span + the mark's own summary. */
  citation: {
    style: string | null;
    excerpt: string | null;
    endExcerpt: string | null;
    summary: string | null;
    startSegIdx: number | null;
    endSegIdx: number | null;
  };
  /** The pasuk card, section by section. null = not generated yet. */
  synthesis: string | null;
  tanachContext: string | null;
  whyHere: string | null;
  mechanism: string | null;
  landing: string | null;
  /** Enrichment ids still missing for this verse (empty when the card is whole). */
  missing: PesukimEnrichmentId[];
}

/** The chapter page on tanach.dev for a "Book C:V" ref; null when unparseable. */
export function tanachChapterUrl(ref: string): string | null {
  const m = ref.trim().match(/^(.+?)\s+(\d+)(?::\d+(?:-\d+)?)?$/);
  if (!m) return null;
  const q = new URLSearchParams({ book: m[1], chapter: m[2] });
  return `https://tanach.dev/?${q.toString()}`;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Which verse a mark instance cites (the join key to the verse text). */
export function instanceVerseRef(inst: PesukimInstance): string | null {
  return str(inst.fields?.verseRef);
}

/**
 * Join one mark instance with its enrichment outputs and verse text.
 * `enrichments` maps enrichment id -> parsed output (or null when not cached).
 */
export function assemblePesukimVerse(
  inst: PesukimInstance,
  enrichments: Partial<Record<PesukimEnrichmentId, Record<string, unknown> | null>>,
  verse: PasukDetail | null,
): PesukimVerse {
  const f = inst.fields ?? {};
  const ref = instanceVerseRef(inst) ?? '';
  const prose: Record<string, string | null> = {};
  const missing: PesukimEnrichmentId[] = [];
  for (const e of PESUKIM_VIEW_ENRICHMENTS) {
    const parsed = enrichments[e.id];
    const text = parsed ? str(parsed[e.field]) : null;
    prose[e.out] = text;
    if (!parsed) missing.push(e.id);
  }
  return {
    ref,
    heRef: verse?.heRef ?? null,
    hebrew: verse?.he || null,
    english: verse?.en || null,
    tanachUrl: ref ? tanachChapterUrl(ref) : null,
    citation: {
      style: str(f.citationStyle),
      excerpt: str(f.excerpt),
      endExcerpt: str(f.endExcerpt),
      summary: str(f.summary),
      startSegIdx: num(inst.startSegIdx),
      endSegIdx: num(inst.endSegIdx),
    },
    synthesis: prose.synthesis ?? null,
    tanachContext: prose.tanachContext ?? null,
    whyHere: prose.whyHere ?? null,
    mechanism: prose.mechanism ?? null,
    landing: prose.landing ?? null,
    missing,
  };
}

/** Producer ids that still need generating, for the view's `cold` list. The
 *  mark itself missing means everything is cold; otherwise any enrichment that
 *  is missing on at least one verse. */
export function pesukimColdProducers(markCached: boolean, verses: PesukimVerse[]): string[] {
  if (!markCached) return ['pesukim', ...PESUKIM_VIEW_ENRICHMENTS.map((e) => e.id)];
  const cold = new Set<string>();
  for (const v of verses) for (const id of v.missing) cold.add(id);
  return PESUKIM_VIEW_ENRICHMENTS.map((e) => e.id).filter((id) => cold.has(id));
}
