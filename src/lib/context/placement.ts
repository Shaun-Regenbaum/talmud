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
 * Producers (the deterministic matchers, the AI placer) write the fields;
 * everyone else — the workbench panel, and downstream anchors/enrichments —
 * reads through here so "what context applies here, at what level, how sure"
 * has one answer.
 */

import type { ContextItem } from './types.ts';

export type PlacementLevel = 'words' | 'segment' | 'amud' | 'daf';

/** Coarsest→finest, for ranking "most specific grounding wins". */
export const LEVEL_RANK: Record<PlacementLevel, number> = { daf: 0, amud: 1, segment: 2, words: 3 };

export interface Placement {
  /** The finest granularity this grounding reached. */
  level: PlacementLevel;
  /** Main-text segments it covers (set for 'segment' and 'words'). */
  segs: number[];
  /** Exact HB word indices (set only for 'words'). */
  words?: number[];
  /** Side of the daf, when known (set for 'amud', carried for finer levels). */
  amud?: 'a' | 'b';
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
export function placementOf(it: ContextItem): Placement | null {
  const via = it.hbVia ?? it.via;
  const confidence = it.hbConfidence ?? it.confidence;

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

/** Word-precise: a real phrase/AI-quote landing, not a whole-segment fallback. */
export function isPrecise(it: ContextItem): boolean {
  return placementLevel(it) === 'words';
}

/** Placed at any level at all (words / segment / amud / whole-daf). */
export function isGrounded(it: ContextItem): boolean {
  return placementOf(it) != null;
}

/** Grounded by the AI semantic placer (so an AI pass shouldn't re-offer it). */
export function isAiGrounded(it: ContextItem): boolean {
  return it.via === 'ai' || it.hbVia === 'ai-phrase' || it.hbVia === 'ai-segment' || it.hbVia === 'ai-daf';
}

/** What an enrichment/anchor asks for: a specific segment, or the whole daf. */
export type GroundingTarget = { seg: number } | { daf: true };

/**
 * The context items whose grounding applies to `target`, most-specific and
 * most-confident first. For a segment target: items grounded ON that segment
 * (words/segment whose `segs` include it) plus whole-daf items (they apply
 * everywhere). For a daf target: everything that's grounded at all. Unplaced
 * items are excluded. (Amud-level items match a daf target but not a bare
 * segment target, since the seg→amud map isn't known here.)
 */
export function contextForTarget(items: ContextItem[], target: GroundingTarget): ContextItem[] {
  const seg = 'seg' in target ? target.seg : null;
  const hits: { it: ContextItem; p: Placement }[] = [];
  for (const it of items) {
    const p = placementOf(it);
    if (!p) continue;
    const applies =
      'daf' in target
        ? true
        : p.level === 'daf' || ((p.level === 'words' || p.level === 'segment') && seg != null && p.segs.includes(seg));
    if (applies) hits.push({ it, p });
  }
  hits.sort((a, b) => LEVEL_RANK[b.p.level] - LEVEL_RANK[a.p.level] || (b.p.confidence ?? 0) - (a.p.confidence ?? 0));
  return hits.map((h) => h.it);
}
