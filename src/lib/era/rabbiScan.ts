/**
 * Browser-safe rabbi-name detection for segments.
 *
 * Mirrors the worker's KNOWN_RABBIS_HE index (src/worker/index.ts:3593–3619)
 * and its expandAbbreviations / hasHebrewWordBoundaryMatch helpers. Kept as a
 * deliberate copy so the experiment page is self-contained; once the era
 * feature graduates to the main view we should consolidate into a shared
 * src/lib/hebrew/ module.
 */

import rabbiPlacesData from '../data/rabbi-places.json';
import type { GenerationId } from '../../client/generations';
import { GENERATION_BY_ID } from '../../client/generations';

interface RabbiPlacesEntry {
  canonical: string;
  canonicalHe?: string | null;
  generation?: string | null;
  region?: 'israel' | 'bavel' | null;
}
interface RabbiPlacesFile {
  rabbis: Record<string, RabbiPlacesEntry>;
}
const RABBI_PLACES = rabbiPlacesData as unknown as RabbiPlacesFile;

export function normalizeHe(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expandAbbreviations(s: string): string {
  const edge = (lhs: RegExp) =>
    new RegExp(`(^|\\s)${lhs.source}(?=\\s|$)`, 'g');
  return s
    .replace(/(^|\s)(דברי|לדברי|כדברי|אמר|ואמר)\s+ר["״]מ(?=\s|$)/g, '$1$2 רבי מאיר')
    .replace(/(^|\s)ר["״]מ\s+(וחכמים|אומר)(?=\s|$)/g, '$1רבי מאיר $2')
    .replace(edge(/אר["״]י/),  (_m, p) => `${p}אמר רבי יוחנן`)
    .replace(edge(/אר["״]ל/),  (_m, p) => `${p}אמר ריש לקיש`)
    .replace(edge(/אר["״]ז/),  (_m, p) => `${p}אמר רבי זירא`)
    .replace(edge(/ריב["״]ל/), (_m, p) => `${p}רבי יהושע בן לוי`)
    .replace(edge(/רשב["״]י/), (_m, p) => `${p}רבי שמעון בר יוחאי`)
    .replace(/א["״]ר(?=\s)/g, 'רבי')
    .replace(/(^|\s)ר['׳](?=\s)/g, '$1רבי');
}

export function hasHebrewWordBoundaryMatch(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return false;
    const beforeOk = idx === 0 || /\s/.test(haystack[idx - 1]);
    const afterIdx = idx + needle.length;
    const afterOk = afterIdx === haystack.length || /\s/.test(haystack[afterIdx]);
    if (beforeOk && afterOk) return true;
    from = idx + 1;
  }
}

const RABBI_HE_TITLE_RE = /^(רבי|רב|ר'|מר|רבן|רבה|רבא|רבינא)\s/;
const RABBI_HE_STANDALONE = new Set([
  'רבא', 'רבינא', 'אבא', 'רבה', 'רב', 'מר',
  'שמואל', 'הלל', 'שמאי', 'עולא', 'זעירי',
  'אביי', 'רבינא השני',
]);

export interface KnownRabbi {
  slug: string;
  canonical: string;
  nameHe: string;
  nameHeNorm: string;
  generation: GenerationId;
}

function asGenerationId(raw: string | null | undefined): GenerationId {
  if (raw && raw in GENERATION_BY_ID) return raw as GenerationId;
  return 'unknown';
}

export const KNOWN_RABBIS: KnownRabbi[] = (() => {
  const out: KnownRabbi[] = [];
  for (const [slug, r] of Object.entries(RABBI_PLACES.rabbis)) {
    const he = r.canonicalHe;
    if (!he) continue;
    const norm = normalizeHe(he);
    if (!norm || norm.length < 2 || norm.includes('(')) continue;
    if (!RABBI_HE_TITLE_RE.test(norm) && !RABBI_HE_STANDALONE.has(norm)) continue;
    out.push({
      slug,
      canonical: r.canonical,
      nameHe: he,
      nameHeNorm: norm,
      generation: asGenerationId(r.generation),
    });
  }
  // Longer first so רבי יוחנן בן זכאי matches before רבי יוחנן claims it.
  out.sort((a, b) => b.nameHeNorm.length - a.nameHeNorm.length);
  return out;
})();

export interface RabbiHit {
  rabbi: KnownRabbi;
  /** Was this rabbi the SPEAKER (preceded by an attribution verb in a window)? */
  isSpeaker: boolean;
  /** True when the name appears inside a דתניא/דתנן explicit Tannaitic citation. */
  inTannaiticCitation: boolean;
}

const ATTRIBUTION_VERBS_BEFORE: ReadonlySet<string> = new Set([
  'אמר', 'דאמר', 'ואמר', 'איתמר', 'תני', 'דתני', 'אומר', 'מתני',
]);

const TANNAITIC_QUOT_INTRO: ReadonlySet<string> = new Set([
  'דתנן', 'דתניא', 'דתני', 'תניא',
]);

/**
 * Find rabbi names in a normalized, abbreviation-expanded segment.
 *
 * For each hit:
 *   - isSpeaker = true when the previous 1–3 tokens contain an attribution verb
 *   - inTannaiticCitation = true when דתניא/דתנן/תניא appears within the
 *     preceding 6 tokens (rough scope of the quoted teaching)
 */
export function findRabbisInSegment(normalizedExpanded: string): RabbiHit[] {
  if (!normalizedExpanded) return [];
  const tokens = normalizedExpanded.split(/\s+/).filter(Boolean);
  const hits: RabbiHit[] = [];
  const seenSlugs = new Set<string>();

  for (const k of KNOWN_RABBIS) {
    if (!hasHebrewWordBoundaryMatch(normalizedExpanded, k.nameHeNorm)) continue;
    if (seenSlugs.has(k.slug)) continue;
    seenSlugs.add(k.slug);

    // Locate the first token-position where this rabbi's name starts.
    const nameTokens = k.nameHeNorm.split(/\s+/);
    let startIdx = -1;
    outer: for (let i = 0; i <= tokens.length - nameTokens.length; i++) {
      for (let j = 0; j < nameTokens.length; j++) {
        if (tokens[i + j] !== nameTokens[j]) continue outer;
      }
      startIdx = i;
      break;
    }

    let isSpeaker = false;
    let inTannaiticCitation = false;
    if (startIdx > 0) {
      const prev1 = tokens[startIdx - 1];
      const prev2 = startIdx >= 2 ? tokens[startIdx - 2] : '';
      isSpeaker = ATTRIBUTION_VERBS_BEFORE.has(prev1) || ATTRIBUTION_VERBS_BEFORE.has(prev2);
      const lookbackStart = Math.max(0, startIdx - 6);
      for (let i = lookbackStart; i < startIdx; i++) {
        if (TANNAITIC_QUOT_INTRO.has(tokens[i])) { inTannaiticCitation = true; break; }
      }
    }
    hits.push({ rabbi: k, isSpeaker, inTannaiticCitation });
  }
  return hits;
}
