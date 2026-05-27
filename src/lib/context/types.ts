/**
 * @fileoverview Normalized cross-source "context item" model for the alignment
 * workbench.
 *
 * Every external source (dafyomi.co.il content types, Sefaria commentaries, …)
 * maps into a `ContextItem` so the workbench can show, hover-highlight, and
 * judge anchoring uniformly. `AnchorState` is a ladder: items start at
 * `whole-daf`/`amud` and get *promoted* toward `segment`/`segment-range`/
 * `phrase` by the matchers in `./anchor/`. Promotion is always optional —
 * an unmatched item stays at its coarse anchor and is never dropped.
 */

import type { DafyomiContentType, DafyomiText, DafyomiRef } from '../sefref/dafyomi/schema.ts';

export type AnchorState =
  | { kind: 'whole-daf' }
  | { kind: 'amud'; amud: 'a' | 'b' }
  | { kind: 'segment'; segIdx: number }
  | { kind: 'segment-range'; startSegIdx: number; endSegIdx: number }
  | { kind: 'phrase'; segIdx: number; excerpt: string };

export type ContextSource = 'sefaria-commentary' | `dafyomi:${DafyomiContentType}`;

/** Extra fields the anchor matchers read; not shown directly. */
export interface ContextMatchHints {
  /** Tosfos: niqqud-stripped DH opening words. */
  dhNormalized?: string;
  /** Background glossary: the Hebrew term. */
  termHe?: string;
  /** Points: the interleaved Hebrew source text + English, for fuzzy matching. */
  pointsHe?: string;
  pointsEn?: string;
}

export interface ContextItem {
  source: ContextSource;
  /** Human-readable source label, e.g. "Insights", "Tosfos", "Rashi". */
  sourceLabel: string;
  /** Sub-kind within the source, e.g. 'tosfos-piece', 'glossary', 'commentary'. */
  kind: string;
  /** Stable-ish identifier (unique within a daf's items of one source). */
  key: string;
  title?: DafyomiText;
  body?: DafyomiText;
  refs?: DafyomiRef[];
  /** Source URL for attribution / click-through. */
  url?: string;
  anchor: AnchorState;
  /** True once an anchor has been promoted past whole-daf/amud by a matcher. */
  anchorMatched: boolean;
  /** Segments to highlight on the daf when this item is hovered. */
  highlightSegs: number[];
  match?: ContextMatchHints;
}

/** Segments an anchor lights up. whole-daf / amud highlight nothing (we have no
 *  amud→segment map), segment/phrase one, segment-range an inclusive span. */
export function highlightSegsFor(anchor: AnchorState): number[] {
  switch (anchor.kind) {
    case 'segment': return [anchor.segIdx];
    case 'phrase': return [anchor.segIdx];
    case 'segment-range': {
      const out: number[] = [];
      for (let i = anchor.startSegIdx; i <= anchor.endSegIdx; i++) out.push(i);
      return out;
    }
    default: return [];
  }
}

/** Re-derive highlightSegs after a matcher mutates an item's anchor. */
export function refreshHighlight(item: ContextItem): ContextItem {
  item.highlightSegs = highlightSegsFor(item.anchor);
  return item;
}
