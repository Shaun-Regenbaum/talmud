/**
 * @fileoverview Tosfos-DH matcher (deterministic, high confidence).
 *
 * dafyomi.co.il Tosfos items carry the Hebrew "Dibur ha'Maschil" opening words
 * (`dhNormalized`); Sefaria's tosafot pieces start with those same words and
 * each has a "S:P" pieceKey whose S is the 1-based segment. Matching DH ->
 * piece -> segment places the item. Unmatched items are left unplaced.
 */

import type { ContextItem } from '@corpus/core/context/types';

export interface TosafotPieces {
  pieces?: string[];
  /** Sefaria "S:P" position strings, parallel to `pieces`. S is 1-based. */
  pieceKeys?: string[];
}

function normHe(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstWords(s: string, n: number): string {
  return s.split(' ').slice(0, n).join(' ');
}

/** Place dafyomi Tosfos items onto segments via Sefaria's tosafot pieceKeys.
 *  Mutates matched items (sets `segs`/`via`). Returns the count placed. */
export function matchTosfos(items: ContextItem[], tosafot: TosafotPieces | undefined): number {
  const pieces = tosafot?.pieces ?? [];
  const keys = tosafot?.pieceKeys ?? [];
  if (pieces.length === 0 || keys.length !== pieces.length) return 0;

  const norm = pieces.map((p, i) => ({
    head: firstWords(normHe(p), 6),
    seg: segOf(keys[i]),
    used: false,
  }));
  let placed = 0;
  for (const item of items) {
    if (item.kind !== 'tosfos-piece' || !item.dhNormalized) continue;
    const dhHead = firstWords(item.dhNormalized, 6);
    const hit = norm.find((p) => !p.used && p.seg != null && headsMatch(p.head, dhHead));
    if (!hit) continue;
    hit.used = true;
    item.segs = [hit.seg!];
    item.via = 'tosfos-dh';
    placed++;
  }
  return placed;
}

function segOf(key: string | undefined): number | null {
  if (!key) return null;
  const s = parseInt(key.split(':')[0], 10);
  return Number.isFinite(s) ? s - 1 : null; // 1-based -> 0-based
}

function headsMatch(pieceHead: string, dhHead: string): boolean {
  if (!pieceHead || !dhHead) return false;
  return (
    pieceHead.startsWith(dhHead) ||
    dhHead.startsWith(firstWords(pieceHead, dhHead.split(' ').length))
  );
}
