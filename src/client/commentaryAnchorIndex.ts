/**
 * Bidirectional commentary anchor index. For a given daf, builds two maps
 * from Sefaria's link data:
 *
 *   segToPieces: dafSegIdx → { rashi: pieceKey[], tosafot: pieceKey[] }
 *   pieceToSegs: ('rashi'|'tosafot' + ':' + pieceKey) → dafSegIdx[]
 *
 * Each Sefaria link carries:
 *   - anchorRef.sentenceIndexStart / sentenceIndexEnd → daf segment range
 *     this commentary piece is glossing
 *   - ref → the commentary's own canonical ref. Talmud commentary refs are
 *     depth-2 ("Rashi on Berakhot 2a:S:P" — segment S, piece P, both
 *     1-based). We keep the trailing "S:P" as a string key so it matches
 *     the data-piece-key attribute the renderer emits on each piece span.
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
  /** dafSegIdx → which Rashi/Tosafot pieces (by "S:P" key) gloss this
   *  segment. */
  segToPieces: Map<number, { rashi: string[]; tosafot: string[] }>;
  /** "rashi:S:P" | "tosafot:S:P" → dafSegIdx[] this piece is anchored to. */
  pieceToSegs: Map<string, number[]>;
}

/** Extract the "S:P" piece key from a Talmud commentary ref. Sefaria stores
 *  Talmud Rashi/Tosafot as depth-2 arrays, and their canonical refs are
 *  "<Book> on <Tractate> <Daf>:S:P" — both numbers 1-based. We return them
 *  verbatim as the string "S:P" so the key matches the data-piece-key the
 *  renderer emits. Returns null when the ref doesn't match the depth-2
 *  shape (defensive — refs lacking the piece slot would otherwise alias
 *  unrelated pieces). */
function pieceKeyFromCommentaryRef(ref: string): string | null {
  // Match the trailing ":S:P" — both required. Sub-indices like ".1" are
  // tolerated on the piece number but stripped.
  const m = ref.match(/:(\d+):(\d+)(?:\.\d+)?$/);
  if (!m) return null;
  const s = parseInt(m[1], 10);
  const p = parseInt(m[2], 10);
  if (!Number.isFinite(s) || s < 1) return null;
  if (!Number.isFinite(p) || p < 1) return null;
  return `${s}:${p}`;
}

function buildIndex(links: SefariaLink[]): CommentaryAnchorIndex {
  const segToPieces = new Map<number, { rashi: string[]; tosafot: string[] }>();
  const pieceToSegs = new Map<string, number[]>();

  for (const link of links) {
    if (link.commentaryType !== 'rashi' && link.commentaryType !== 'tosafot') continue;
    const pieceKey = pieceKeyFromCommentaryRef(link.ref);
    if (!pieceKey) continue;

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
      if (!bucket[link.commentaryType].includes(pieceKey)) {
        bucket[link.commentaryType].push(pieceKey);
      }
    }

    // Reverse: piece → segs.
    const key = `${link.commentaryType}:${pieceKey}`;
    const prev = pieceToSegs.get(key) ?? [];
    for (const s of segs) {
      if (!prev.includes(s)) prev.push(s);
    }
    pieceToSegs.set(key, prev);
  }

  // Sort each list for stable iteration order. Piece keys "S:P" are sorted
  // numerically by (S, P) so callers get the same order regardless of link
  // arrival order from Sefaria.
  const cmpKey = (a: string, b: string): number => {
    const [as, ap] = a.split(':').map((n) => parseInt(n, 10));
    const [bs, bp] = b.split(':').map((n) => parseInt(n, 10));
    return as - bs || ap - bp;
  };
  for (const bucket of segToPieces.values()) {
    bucket.rashi.sort(cmpKey);
    bucket.tosafot.sort(cmpKey);
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
