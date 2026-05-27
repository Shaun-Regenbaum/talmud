/**
 * @fileoverview Tosfos-DH anchor matcher (stage-2, high confidence).
 *
 * dafyomi.co.il Tosfos pieces carry the Hebrew "Dibur ha'Maschil" opening
 * words verbatim, and Sefaria's tosafot pieces begin with those same words.
 * Each Sefaria tosafot piece has a "S:P" pieceKey whose S is the 1-based
 * segment it sits under, so matching DH -> tosafot piece -> segment promotes a
 * Tosfos item from amud-level to a specific segment. Unmatched items are left
 * untouched (they keep their amud anchor).
 */

import type { ContextItem } from '../types.ts';
import { refreshHighlight } from '../types.ts';

export interface TosafotPieces {
  pieces?: string[];
  /** Sefaria "S:P" position strings, parallel to `pieces`. S is 1-based segment. */
  pieceKeys?: string[];
}

function normHe(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')          // niqqud / cantillation
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First `n` words of a normalized Hebrew string. */
function firstWords(s: string, n: number): string {
  return s.split(' ').slice(0, n).join(' ');
}

/**
 * Promote Tosfos-piece items to segment anchors using Sefaria's tosafot
 * pieces. Mutates matched items in place. Returns the count promoted.
 */
export function matchTosfos(items: ContextItem[], tosafot: TosafotPieces | undefined): number {
  const pieces = tosafot?.pieces ?? [];
  const keys = tosafot?.pieceKeys ?? [];
  if (pieces.length === 0 || keys.length !== pieces.length) return 0;

  const norm = pieces.map((p, i) => ({
    head: firstWords(normHe(p), 6),
    segIdx: segOf(keys[i]),
    used: false,
  }));

  let promoted = 0;
  for (const item of items) {
    if (item.kind !== 'tosfos-piece') continue;
    const dh = item.match?.dhNormalized;
    if (!dh) continue;
    const dhHead = firstWords(dh, 6);
    const hit = norm.find((p) => !p.used && p.segIdx != null && headsMatch(p.head, dhHead));
    if (!hit) continue;
    hit.used = true;
    item.anchor = { kind: 'segment', segIdx: hit.segIdx! };
    item.anchorMatched = true;
    refreshHighlight(item);
    promoted++;
  }
  return promoted;
}

function segOf(key: string | undefined): number | null {
  if (!key) return null;
  const s = parseInt(key.split(':')[0], 10);
  return Number.isFinite(s) ? s - 1 : null; // 1-based -> 0-based
}

/** A DH matches a tosafot piece when either's opening words prefix the other —
 *  the DH is usually 1-3 words, the piece head a few more. */
function headsMatch(pieceHead: string, dhHead: string): boolean {
  if (!pieceHead || !dhHead) return false;
  return pieceHead.startsWith(dhHead) || dhHead.startsWith(firstWords(pieceHead, dhHead.split(' ').length));
}
