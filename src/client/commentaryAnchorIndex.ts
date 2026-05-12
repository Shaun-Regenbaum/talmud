/**
 * Bidirectional commentary anchor index. For a given daf, builds two maps
 * from Sefaria's link data:
 *
 *   segToPieces: dafSegIdx → { rashi: pieceIdx[], tosafot: pieceIdx[] }
 *   pieceToSegs: ('rashi'|'tosafot' + ':' + pieceIdx) → dafSegIdx[]
 *
 * Each Sefaria link carries:
 *   - anchorRef.sentenceIndexStart / sentenceIndexEnd → daf segment range
 *     this commentary piece is glossing
 *   - ref → the commentary's own canonical ref, e.g. "Rashi on Berakhot 2a:5"
 *     where the trailing number is the 1-based piece index in the commentary
 *     array. We convert to 0-based to match the DOM data-piece-idx markers
 *     emitted by DafViewer's tokenized renderer.
 *
 * One Rashi piece can anchor to a range of base segments (multi-seg gloss),
 * and one base segment can be referenced by multiple Rashi/Tosafot pieces
 * (the common case for dense pages).
 *
 * Used by the daf↔commentary click-anchor: clicking a word in the main
 * column reads segToPieces to find which commentary pieces to highlight in
 * the inner / outer columns; clicking a commentary piece reads pieceToSegs
 * to highlight the matching main-column segments.
 */

import { getSefariaLinks, type SefariaLink } from '../lib/sefref/sefaria/links';

export type Comm = 'rashi' | 'tosafot';

export interface CommentaryAnchorIndex {
  /** dafSegIdx → which Rashi/Tosafot pieces (by index in the rendered
   *  array) gloss this segment. */
  segToPieces: Map<number, { rashi: number[]; tosafot: number[] }>;
  /** "rashi:N" | "tosafot:N" → dafSegIdx[] this piece is anchored to. */
  pieceToSegs: Map<string, number[]>;
}

/** Extract the piece index from a commentary ref. Sefaria's commentary
 *  refs end with a colon and a number that is the 1-based piece index
 *  (e.g. "Rashi on Berakhot 2a:5" → 4). Returns -1 when the ref doesn't
 *  match the expected shape. */
function pieceIndexFromCommentaryRef(ref: string): number {
  // The last colon-separated segment is the piece number. Some refs have
  // sub-indices like "Rashi on Berakhot 2a:5.1" — take the integer part
  // before any dot.
  const m = ref.match(/:(\d+)(?:\.\d+)?$/);
  if (!m) return -1;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return -1;
  return n - 1;
}

function buildIndex(links: SefariaLink[]): CommentaryAnchorIndex {
  const segToPieces = new Map<number, { rashi: number[]; tosafot: number[] }>();
  const pieceToSegs = new Map<string, number[]>();

  for (const link of links) {
    if (link.commentaryType !== 'rashi' && link.commentaryType !== 'tosafot') continue;
    const piece = pieceIndexFromCommentaryRef(link.ref);
    if (piece < 0) continue;

    const start = link.sentenceIndexStart;
    const end = link.sentenceIndexEnd ?? start;
    if (!Number.isFinite(start)) continue;

    const segs: number[] = [];
    for (let s = start; s <= end; s++) segs.push(s);

    // Forward: seg → pieces.
    for (const s of segs) {
      let bucket = segToPieces.get(s);
      if (!bucket) {
        bucket = { rashi: [], tosafot: [] };
        segToPieces.set(s, bucket);
      }
      if (!bucket[link.commentaryType].includes(piece)) {
        bucket[link.commentaryType].push(piece);
      }
    }

    // Reverse: piece → segs.
    const key = `${link.commentaryType}:${piece}`;
    const prev = pieceToSegs.get(key) ?? [];
    for (const s of segs) {
      if (!prev.includes(s)) prev.push(s);
    }
    pieceToSegs.set(key, prev);
  }

  // Sort each list for stable iteration order.
  for (const bucket of segToPieces.values()) {
    bucket.rashi.sort((a, b) => a - b);
    bucket.tosafot.sort((a, b) => a - b);
  }
  for (const [k, v] of pieceToSegs) pieceToSegs.set(k, v.sort((a, b) => a - b));

  return { segToPieces, pieceToSegs };
}

/** Session cache keyed by `{tractate}:{daf}` so re-mounts within the same
 *  page session don't refetch. */
const sessionCache = new Map<string, CommentaryAnchorIndex>();

export async function fetchCommentaryAnchorIndex(
  tractate: string,
  daf: string,
): Promise<CommentaryAnchorIndex> {
  const key = `${tractate}:${daf}`;
  const cached = sessionCache.get(key);
  if (cached) return cached;
  const links = await getSefariaLinks(tractate, daf);
  const idx = buildIndex(links);
  sessionCache.set(key, idx);
  return idx;
}
