/**
 * @fileoverview Matcher output + applier.
 *
 * Every matcher — deterministic (Tosfos-DH, pieceKeys, Mishna ranges) or AI —
 * emits `SegMatch[]`. `applyMatches` is the one place that writes a placement
 * onto an item (`segs` + provenance), so the workbench and any future
 * enrichment path treat all matchers alike.
 */

import type { ContextItem } from './types.ts';

export interface SegMatch {
  /** ContextItem.key this placement applies to. */
  key: string;
  /** Segments the item maps to. Empty = leave unplaced (no-op). */
  segs: number[];
  /** Matcher id, e.g. 'tosfos-dh' | 'ai' | 'pieceKeys'. */
  via: string;
  /** 0..1 confidence (AI matchers set this; deterministic ones may omit). */
  confidence?: number;
}

/** Write placements onto items in place. Returns the number changed. */
export function applyMatches(items: ContextItem[], matches: SegMatch[]): number {
  const byKey = new Map(matches.map((m) => [m.key, m]));
  let changed = 0;
  for (const item of items) {
    const m = byKey.get(item.key);
    if (!m || m.segs.length === 0) continue;
    item.segs = dedupeSorted(m.segs);
    item.via = m.via;
    item.confidence = m.confidence;
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
