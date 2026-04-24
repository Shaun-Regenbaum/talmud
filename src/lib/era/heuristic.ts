/**
 * Per-segment era classifier — pure TS, browser & worker safe.
 *
 * Signal precedence (sharp, never weighted):
 *   1. Named speaker (attribution verb + known rabbi) → speaker's generation
 *   2. Structural marker (מתני׳, דתניא, תנו רבנן, …)  → tanna-5 / tanna-4
 *   3. Language register (lexicon scoring)            → tanna-5 / amora-* / EY
 *   4. Default                                        → amora-bavel-8 (Stam)
 *
 * The user explicitly chose "no uncertainty UI": every segment commits to one
 * GenerationId, no nulls, no confidence band. The `why` string preserves the
 * reasoning for the /experiment debug view.
 */

import type { GenerationId } from '../../client/generations';
import { extractTalmudContent } from '../sefref/alignment';
import { expandAbbreviations, findRabbisInSegment, normalizeHe } from './rabbiScan';
import { scoreRegisters } from './lexicons';
import type { SegmentEra, DafEraContext } from './types';

// Rough chronological start year per generation. Used to pick the "latest"
// speaker when a segment cites multiple rabbis (the framing voice in Bavli
// redaction is later than its sources).
const ERA_START_YEAR: Record<GenerationId, number> = {
  'zugim': -170,
  'tanna-1': 10,
  'tanna-2': 80,
  'tanna-3': 120,
  'tanna-4': 140,
  'tanna-5': 165,
  'tanna-6': 200,
  'amora-ey-1': 220,
  'amora-ey-2': 250,
  'amora-ey-3': 290,
  'amora-ey-4': 320,
  'amora-ey-5': 360,
  'amora-bavel-1': 220,
  'amora-bavel-2': 250,
  'amora-bavel-3': 290,
  'amora-bavel-4': 320,
  'amora-bavel-5': 350,
  'amora-bavel-6': 375,
  'amora-bavel-7': 427,
  'amora-bavel-8': 460,
  'savora': 500,
  'unknown': -9999,
};

/** Order two generations chronologically; later wins ties via Bavel preference. */
function isLater(a: GenerationId, b: GenerationId): boolean {
  const ya = ERA_START_YEAR[a];
  const yb = ERA_START_YEAR[b];
  if (ya !== yb) return ya > yb;
  // Tie-break: prefer Bavel over EY (Bavli redaction context).
  if (a.startsWith('amora-bavel') && b.startsWith('amora-ey')) return true;
  return false;
}

// Structural marker detection. Operates on normalized, abbreviation-expanded
// tokens of the segment.
//
// Confidence ranking (only fire when CONFIDENT):
//   - מתני׳ / מתניתין / משנה  → tanna-5 (mishna voice itself)
//   - דתנן                      → tanna-5 (mishna citation: "as we learned")
//   - תנו רבנן                   → tanna-4 (Sages-taught baraita, two-token)
//   - דתניא                     → tanna-4 (baraita citation)
//   - תניא                      → tanna-4 (baraita citation, unless followed by stam-pointer)
//   - תנא דבי X                 → tanna-4 (school baraita)
//
// Deliberately DROPPED from the broad-marker set (too ambiguous):
//   - bare תנא            ("תנא היכא קאי" = stam asking about the Mishna's tanna)
//   - bare דתני           ("דתני בערבית בריישא" = stam discussing the Mishna's wording)
// These slip through to the register/speaker stages, which is the right call —
// the tradeoff is a few false-Stam-default picks vs many wrong-tanna-4 picks
// that drown the timeline.
const MARKER_MISHNA: ReadonlySet<string> = new Set([
  'מתני', 'מתניתין', 'משנה',
]);

// Tokens that indicate a stam reference to the Mishna's tanna rather than a
// baraita citation. If "תניא" is followed by one of these, it's almost
// certainly stam framing (e.g. "תניא היכא קאי").
const STAM_TANNA_LOOKAHEAD: ReadonlySet<string> = new Set([
  'היכא', 'קאי', 'קתני', 'דקתני', 'פתח', 'אקרא',
]);

interface MarkerDetect {
  era: GenerationId | null;
  why: string;
}

function detectStructuralMarker(tokens: string[]): MarkerDetect {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1] ?? '';

    if (MARKER_MISHNA.has(t)) return { era: 'tanna-5', why: `marker: ${t} (mishna voice)` };

    // Mishna citation — "as we learned in the Mishna"
    if (t === 'דתנן') return { era: 'tanna-5', why: 'marker: דתנן (mishna citation)' };

    // Strong baraita signals
    if (t === 'תנו' && next === 'רבנן') return { era: 'tanna-4', why: 'marker: תנו רבנן' };
    if (t === 'דתניא') return { era: 'tanna-4', why: 'marker: דתניא (baraita citation)' };
    if (t === 'תניא') {
      if (STAM_TANNA_LOOKAHEAD.has(next)) continue; // stam reference, not a baraita
      return { era: 'tanna-4', why: 'marker: תניא (anonymous baraita)' };
    }

    // School-attribution baraita ("תנא דבי רבי ישמעאל / דבי רב")
    if (t === 'תנא' && next === 'דבי') {
      return { era: 'tanna-4', why: 'marker: תנא דבי (school baraita)' };
    }

    // Bare תנא and bare דתני are intentionally NOT matched (see header).
  }
  return { era: null, why: '' };
}

export interface ClassifySegmentInput {
  segIdx: number;
  /** Sefaria segment HTML (will be stripped + normalized). */
  hebrewHtml: string;
}

export function classifySegment(input: ClassifySegmentInput): SegmentEra {
  const plain = extractTalmudContent(input.hebrewHtml);
  const normalized = normalizeHe(expandAbbreviations(plain));
  const tokens = normalized.split(/\s+/).filter(Boolean);

  // 1. Named speakers.
  const rabbiHits = findRabbisInSegment(normalized);
  const speakers = rabbiHits.filter((h) => h.isSpeaker);
  // Filter unknown-generation speakers — they can't pin an era.
  const usableSpeakers = speakers.filter((h) => h.rabbi.generation !== 'unknown');

  if (usableSpeakers.length > 0) {
    // Pick latest framing voice. Exception: explicit Tannaitic-citation-only
    // (no Amora speaker present) → keep the Tannaitic speaker even though
    // technically the framing voice is later, because the segment IS the
    // tannaitic teaching being quoted.
    let chosen = usableSpeakers[0];
    for (const h of usableSpeakers) {
      if (isLater(h.rabbi.generation, chosen.rabbi.generation)) chosen = h;
    }
    return {
      segIdx: input.segIdx,
      era: chosen.rabbi.generation,
      source: 'speaker',
      why: `speaker: ${chosen.rabbi.canonical}${
        usableSpeakers.length > 1 ? ` (latest of ${usableSpeakers.length})` : ''
      }`,
      speakers: usableSpeakers.map((h) => ({ nameHe: h.rabbi.nameHe, era: h.rabbi.generation })),
    };
  }

  // 2. Structural markers.
  const marker = detectStructuralMarker(tokens);
  if (marker.era) {
    return { segIdx: input.segIdx, era: marker.era, source: 'marker', why: marker.why };
  }

  // 3. Language register.
  const scores = scoreRegisters(tokens);
  const top = [...scores].sort((a, b) => b.score - a.score)[0];
  if (top && top.score >= 0.05) {
    return {
      segIdx: input.segIdx,
      era: top.era,
      source: 'register',
      why: `register: ${top.era} (${top.hits.slice(0, 4).join(', ') || '—'}, score=${top.score.toFixed(2)})`,
    };
  }

  // 4. Default to Stam.
  return {
    segIdx: input.segIdx,
    era: 'amora-bavel-8',
    source: 'stam-default',
    why: 'no signals — default Stam',
  };
}

export function classifyDaf(segmentsHe: string[]): DafEraContext {
  const segments = segmentsHe.map((html, segIdx) => classifySegment({ segIdx, hebrewHtml: html }));
  const generationsPresent = Array.from(new Set(segments.map((s) => s.era)));
  return { segments, generationsPresent, computedAt: Date.now() };
}
