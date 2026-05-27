/**
 * @fileoverview The one context model.
 *
 * Every external source (dafyomi.co.il content types, Sefaria commentary text,
 * Mishnayot, Rishonim, …) maps into a flat `ContextItem`. The only anchor is
 * `segs` — the main-text segment indices the item touches; `[]` means it's not
 * localized to a segment (whole-daf, optionally narrowed to an `amud`). A
 * matcher (deterministic or AI) "places" an item by filling in `segs`.
 */

import type { DafyomiContentType, DafyomiText } from '../sefref/dafyomi/schema.ts';

export type ContextSource =
  | 'sefaria-rashi'
  | 'sefaria-tosafot'
  | 'sefaria-rishonim'
  | 'sefaria-halacha'
  | 'sefaria-mishnah'
  | 'sefaria-topic'
  | `dafyomi:${DafyomiContentType}`;

export interface ContextItem {
  source: ContextSource;
  /** Human-readable source label, e.g. "Insights", "Rashi". */
  sourceLabel: string;
  /** Sub-kind within the source, e.g. 'tosfos-piece', 'glossary', 'rishon'. */
  kind: string;
  /** Stable id, unique within a daf's items. */
  key: string;
  title?: DafyomiText;
  body?: DafyomiText;
  /** Source URL for attribution / click-through. */
  url?: string;

  /** Main-text segments this item maps to (0-based, sorted, unique). `[]` =
   *  not localized to a segment. This is the only anchor. */
  segs: number[];
  /** Coarse locator when known but not segment-mapped (display only). */
  amud?: 'a' | 'b';
  /** How `segs` was produced: 'pieceKeys' | 'mishnah' | 'tosfos-dh' | 'ai'. */
  via?: string;
  /** Matcher confidence 0..1 (AI matches carry this). */
  confidence?: number;

  /** Tosfos-DH matcher input: niqqud-stripped DH opening words. Only set on
   *  dafyomi Tosfos items; lets the matcher place them via Sefaria pieceKeys. */
  dhNormalized?: string;

  /** Structured comparison table (dafyomi Hebrew charts) — kept so the card can
   *  render a real table instead of the flattened pipe-text in `body`. Cells are
   *  display-ready Hebrew; the first cell of each row is the row label. */
  table?: {
    headers: string[];
    rows: string[][];
    notes?: { marker: string; text: string }[];
  };

  /** Client-side HB placement (computed in the alignment workbench, not from
   *  the server pool): the exact HebrewBooks word indices this item maps to,
   *  plus how it was located and a confidence. Drives word-level highlighting. */
  hbWords?: number[];
  hbVia?: string;
  hbConfidence?: number;
}

/** A short human label for an item's segment placement (for card chips). */
export function rangeLabel(segs: number[], amud?: 'a' | 'b'): string {
  if (segs.length === 0) return amud ? `amud ${amud}` : 'whole daf';
  if (segs.length === 1) return `seg ${segs[0]}`;
  const sorted = [...segs].sort((a, b) => a - b);
  const contiguous = sorted.every((s, i) => i === 0 || s === sorted[i - 1] + 1);
  if (contiguous) return `seg ${sorted[0]}–${sorted[sorted.length - 1]}`;
  const shown = sorted.slice(0, 4).join(', ');
  return `segs ${shown}${sorted.length > 4 ? '…' : ''}`;
}
