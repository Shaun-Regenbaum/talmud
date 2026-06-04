/**
 * @fileoverview The grounding layer: where a piece of context sits on a daf,
 * as a first-class typed concept — the "step before precise anchoring."
 *
 * Any content (a dafyomi note, a Sefaria comment, later an enrichment) is
 * *grounded* at the coarsest-to-finest level the evidence justifies:
 *
 *   words   — exact HebrewBooks word indices (a phrase/AI-quote landing)
 *   segment — one or more Sefaria main-text segments (which map to HB words)
 *   amud    — a side of the daf, when nothing finer is known
 *   daf     — the whole page (a general note, deliberately placed there)
 *
 * `placementOf` is the single reader that turns a ContextItem's stored fields
 * (`segs`/`via`/`confidence` from the server pool + the client-resolved
 * `hbWords`/`hbVia`/`hbConfidence`) into a normalized `Placement`. Granularity
 * is DERIVED, not stored, so it can never drift from the underlying anchors.
 * Producers (the deterministic matchers, the AI placer) write the fields; the
 * alignment workbench (the source panel + the auto-grounding loop) reads through
 * here so "what landed where, at what level, how sure" has one answer.
 *
 * Scope note: this is a CLIENT-side workbench helper. Downstream enrichments do
 * NOT read placements — they consume the segment grounding (`segs`) directly via
 * `contextForAnchor` in select.ts. So the `words` level is a debugging nicety,
 * not a precision the rest of the app can act on; the panel renders accordingly.
 */

import type { ContextItem } from './types.ts';
import { type AnchorCoord, type DafRef, isCrossDaf } from './coord.ts';

/** `cross-daf` is orthogonal to the in-daf granularities: the item's home is a
 *  segment on ANOTHER page, so relative to the daf in view it is the least
 *  "here" — hence it ranks below `daf`. Only derived when `placementOf` is
 *  given the current daf AND the item carries an off-daf `coord`. */
export type PlacementLevel = 'cross-daf' | 'words' | 'segment' | 'amud' | 'daf';

export interface Placement {
  /** The finest granularity this grounding reached. */
  level: PlacementLevel;
  /** Main-text segments it covers (set for 'segment' and 'words'). */
  segs: number[];
  /** Exact HB word indices (set only for 'words'). */
  words?: number[];
  /** Side of the daf, when known (set for 'amud', carried for finer levels). */
  amud?: 'a' | 'b';
  /** Off-daf target (set only for 'cross-daf'). */
  coord?: AnchorCoord;
  /** How it was placed: 'tosfos-dh' | 'pieceKeys' | 'mishnah' | 'ai' |
   *  'phrase'|'phrase-in-seg'|'phrase-fuzzy' | 'ai-phrase'|'ai-segment'|'ai-daf' | … */
  via?: string;
  /** 0..1 confidence in the placement. */
  confidence?: number;
}

/** `hbVia` values that mean a tight word landing (vs. a whole-segment span). */
const WORD_VIAS = new Set(['phrase', 'phrase-in-seg', 'phrase-fuzzy', 'ai-phrase']);

/**
 * Normalize an item's grounding into a `Placement`, or `null` if it isn't
 * grounded at all (no words, no segments, no amud, no whole-daf decision).
 */
export function placementOf(it: ContextItem, currentDaf?: DafRef): Placement | null {
  const via = it.hbVia ?? it.via;
  const confidence = it.hbConfidence ?? it.confidence;

  // Cross-daf: the item's true home is a segment on another page. Only derived
  // when the caller supplies the daf in view AND the item's coord points off it
  // — so existing single-arg callers see unchanged behavior.
  if (it.coord && currentDaf && isCrossDaf(it.coord, currentDaf)) {
    return { level: 'cross-daf', segs: [], coord: it.coord, via, confidence };
  }

  // Whole-daf: a deliberate daf-level grounding (the AI placer's null segStart),
  // but only when nothing finer is known. `ai-daf` is the client-resolved
  // marker; `via:'ai' + no anchors` is the same decision before HB resolution.
  // A known amud is more specific, so don't collapse those to whole-daf.
  if (it.hbVia === 'ai-daf' || (it.via === 'ai' && it.segs.length === 0 && !it.hbWords?.length && !it.amud)) {
    return { level: 'daf', segs: [], via, confidence };
  }

  // Resolved onto HB words: 'words' when it's a tight phrase landing, else a
  // whole-segment span (e.g. the coarse 'segment'/'ai-segment' fallback).
  if (it.hbWords?.length) {
    const level: PlacementLevel = it.hbVia && WORD_VIAS.has(it.hbVia) ? 'words' : 'segment';
    return { level, segs: it.segs, words: it.hbWords, amud: it.amud, via, confidence };
  }

  // Segment-level grounding without (or before) HB word resolution.
  if (it.segs.length) return { level: 'segment', segs: it.segs, amud: it.amud, via, confidence };

  // Nothing finer than a known side of the daf.
  if (it.amud) return { level: 'amud', segs: [], amud: it.amud, via, confidence };

  return null; // unplaced
}

/** The grounding level, or null when unplaced. */
export function placementLevel(it: ContextItem): PlacementLevel | null {
  return placementOf(it)?.level ?? null;
}

/** Anchored to a span of the text (a segment or exact words) — "located". */
export function isLocated(it: ContextItem): boolean {
  const l = placementLevel(it);
  return l === 'words' || l === 'segment';
}

/** Grounded by the AI semantic placer (so an AI pass shouldn't re-offer it). */
export function isAiGrounded(it: ContextItem): boolean {
  return it.via === 'ai' || it.hbVia === 'ai-phrase' || it.hbVia === 'ai-segment' || it.hbVia === 'ai-daf';
}

/** Sources that are daf-level REFERENCE context by nature (halachic cross-refs,
 *  topic tags) — not tied to a specific line. The workbench leaves these at
 *  their coarse level rather than force-grounding them onto a segment. */
export const REFERENCE_SOURCES: ReadonlySet<string> = new Set(['sefaria-halacha', 'sefaria-topic']);
export function isReferenceSource(it: ContextItem): boolean {
  return REFERENCE_SOURCES.has(it.source);
}

