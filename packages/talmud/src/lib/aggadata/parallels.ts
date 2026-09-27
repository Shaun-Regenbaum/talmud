/**
 * Grounded parallels for an aggadic story: the passages Sefaria links to the
 * story's own daf lines (its Mesorat HaShas cross-references, Yerushalmi,
 * Tosefta, Midrash, Mishnah and Tanakh links), each with its real text.
 *
 * The aggadata.parallels enrichment used to name parallels from memory. On a
 * 151-parallel sample most were wrong: the ref existed, but the passage did not
 * contain what the card said (Tosefta Berakhot 1:3 for Rabban Gamliel's sons,
 * which never mentions him). Now the model only judges these candidates, and
 * the aggadata-ground pass drops any ref that is not one of them.
 *
 * Pure: the fetch lives in the Sefaria client, the cache in source-cache.
 */

import type { LineRange } from '../halacha/codifiers';

/** Where a candidate comes from, in the order candidates are preferred. */
export type ParallelSource =
  | 'mesorat-hashas'
  | 'yerushalmi'
  | 'tosefta'
  | 'midrash'
  | 'bavli'
  | 'mishnah'
  | 'tanakh';

export const PARALLEL_SOURCE_ORDER: readonly ParallelSource[] = [
  'mesorat-hashas',
  'yerushalmi',
  'tosefta',
  'midrash',
  'bavli',
  'mishnah',
  'tanakh',
];

const SOURCE_LABEL: Record<ParallelSource, string> = {
  'mesorat-hashas': 'Bavli (Mesorat HaShas cross-reference)',
  yerushalmi: 'Yerushalmi',
  tosefta: 'Tosefta',
  midrash: 'Midrash',
  bavli: 'Bavli',
  mishnah: 'Mishnah',
  tanakh: 'Tanakh',
};

/** One passage Sefaria links to the daf, with every daf line it is linked from. */
export interface ParallelCandidate {
  ref: string;
  source: ParallelSource;
  /** 0-indexed daf line ranges linking to this passage. */
  anchors: Array<{ segStart: number; segEnd: number }>;
  hebrew: string;
  english: string;
}

/** A Sefaria related-link, reduced to what the classifier reads. */
export interface RelatedLinkLite {
  ref: string;
  category: string;
  type?: string;
  index_title?: string;
}

/**
 * Classify a Sefaria link from a daf as a parallel candidate, or null. Skips
 * what is not a parallel: commentary of every kind, Ein Yaakov (the Bavli's own
 * aggadot collected, so it only ever repeats this daf), the Mishnah this daf
 * quotes ("mishnah in talmud"), and links back to the same daf.
 */
export function classifyParallelLink(
  l: RelatedLinkLite,
  daf: { tractate: string; page: string },
): ParallelSource | null {
  const ref = (l.ref ?? '').trim();
  if (!ref) return null;
  if (/^Ein Yaakov\b/.test(l.index_title ?? ref)) return null;
  switch (l.category) {
    case 'Talmud': {
      if (/^Jerusalem Talmud\b/.test(ref)) return 'yerushalmi';
      if (ref.startsWith(`${daf.tractate} ${daf.page}`)) return null;
      return l.type === 'mesorat hashas' ? 'mesorat-hashas' : 'bavli';
    }
    case 'Tosefta':
      return 'tosefta';
    case 'Midrash':
      return 'midrash';
    case 'Mishnah':
      return l.type === 'mishnah in talmud' ? null : 'mishnah';
    case 'Tanakh':
      return 'tanakh';
    default:
      return null;
  }
}

/** How far outside a story's lines a link may sit and still be offered. */
export const PARALLEL_NEAR_LINES = 2;
/** At most this many candidates go to the model per story. */
export const MAX_CANDIDATES_PER_STORY = 12;

function distance(a: { segStart: number; segEnd: number }, r: LineRange): number {
  if (a.segEnd < r.start) return r.start - a.segEnd;
  if (a.segStart > r.end) return a.segStart - r.end;
  return 0;
}

/**
 * The candidates for one story: passages linked from its lines or within
 * PARALLEL_NEAR_LINES of them, nearest first, then by source order. A Tanakh
 * verse must be linked from the story's own lines: a verse quoted a line away
 * belongs to the sugya around the story, and on the bench those were the most
 * common wrong "the story draws on this verse" claims. With no range, every
 * candidate on the daf.
 */
export function candidatesForLines(
  all: ParallelCandidate[] | undefined,
  range: LineRange | null,
): ParallelCandidate[] {
  const scored = (all ?? [])
    .map((c) => ({
      c,
      d: range ? Math.min(...c.anchors.map((a) => distance(a, range))) : 0,
    }))
    .filter(({ c, d }) => (c.source === 'tanakh' ? d === 0 : d <= PARALLEL_NEAR_LINES));
  scored.sort(
    (a, b) =>
      a.d - b.d ||
      PARALLEL_SOURCE_ORDER.indexOf(a.c.source) - PARALLEL_SOURCE_ORDER.indexOf(b.c.source),
  );
  return scored.slice(0, MAX_CANDIDATES_PER_STORY).map(({ c }) => c);
}

const PROMPT_TEXT_CAP = 1200;
const cap = (s: string) => (s.length > PROMPT_TEXT_CAP ? `${s.slice(0, PROMPT_TEXT_CAP - 1)}…` : s);

/** The candidates as a prompt block, each with its source and real text. */
export function formatParallelCandidatesForPrompt(cands: ParallelCandidate[]): string {
  if (!cands.length) return '(Sefaria links no parallel passage to these lines of the daf)';
  return cands
    .map((c) => {
      const lines = [`- ${c.ref} [${SOURCE_LABEL[c.source]}]`];
      if (c.hebrew) lines.push(`  HE: ${cap(c.hebrew)}`);
      if (c.english) lines.push(`  EN: ${cap(c.english)}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

/** Loose ref equality: case, spacing, and "Yerushalmi X" for "Jerusalem Talmud X". */
export function sameParallelRef(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/^(?:yerushalmi|talmud yerushalmi)\s+/, 'jerusalem talmud ')
      .replace(/\s+/g, ' ');
  return norm(a) !== '' && norm(a) === norm(b);
}
