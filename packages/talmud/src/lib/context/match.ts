/**
 * @fileoverview Matcher output + applier.
 *
 * Every matcher — deterministic (Tosfos-DH, pieceKeys, Mishna ranges) or AI —
 * emits `SegMatch[]`. `applyMatches` is the one place that writes a placement
 * onto an item (`segs` + provenance), so the workbench and any future
 * enrichment path treat all matchers alike.
 */

import type { ContextItem } from './types.ts';
import type { AnchorCoord } from '@corpus/core/context/coord';

export interface SegMatch {
  /** ContextItem.key this placement applies to. */
  key: string;
  /** Segments the item maps to. Empty = leave unplaced (no-op) UNLESS
   *  `wholeDaf` is set, which is a deliberate daf-level placement. */
  segs: number[];
  /** Cross-daf anchor: set by a matcher when the item's true home is a segment
   *  on ANOTHER daf (parallel sugya, citation target). Additive — in-daf
   *  matchers leave it undefined and only fill `segs`. When present, the match
   *  counts as a placement even if `segs` is empty. */
  coord?: AnchorCoord;
  /** Matcher id, e.g. 'tosfos-dh' | 'ai' | 'pieceKeys'. */
  via: string;
  /** 0..1 confidence (AI matchers set this; deterministic ones may omit). */
  confidence?: number;
  /** Optional verbatim Hebrew phrase the item is about (AI matcher emits this);
   *  the client resolves it to exact HB word positions via the HB locator. */
  quote?: string;
  /** The matcher grounded this item at WHOLE-DAF level on purpose (no single
   *  segment fits — a general note). A placement, not a failure; `segs` stays
   *  empty and the item is marked placed so the workbench shows "whole daf". */
  wholeDaf?: boolean;
}

/** Write placements onto items in place. Returns the number changed. */
export function applyMatches(items: ContextItem[], matches: SegMatch[]): number {
  const byKey = new Map(matches.map((m) => [m.key, m]));
  let changed = 0;
  for (const item of items) {
    const m = byKey.get(item.key);
    if (!m) continue;
    if (!m.wholeDaf && m.segs.length === 0 && !m.coord) continue; // unplaced no-op
    item.segs = m.wholeDaf ? [] : dedupeSorted(m.segs);
    item.via = m.via; // a whole-daf AI placement is `via:'ai'` + `segs:[]`
    item.confidence = m.confidence;
    if (m.coord) item.coord = m.coord; // cross-daf target (additive)
    changed++;
  }
  return changed;
}

/** Inclusive segment range [start..end] as an array. */
export function segRange(start: number, end?: number | null): number[] {
  if (end == null || end <= start) return [start];
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function dedupeSorted(segs: number[]): number[] {
  return Array.from(new Set(segs)).sort((a, b) => a - b);
}
