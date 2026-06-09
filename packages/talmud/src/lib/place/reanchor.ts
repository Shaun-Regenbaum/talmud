/**
 * Pure re-anchoring of mark instances against a segment grid. These are the
 * exact algorithms that lived inline in src/worker/index.ts's postProcessX
 * functions, lifted out so they (a) share the one verbatim matcher and (b) are
 * unit-testable against captured production output (tests/golden-anchors.test.ts).
 *
 * Each function MUTATES + returns the parsed object, identical to the original
 * inline code. The worker's postProcessX wrappers now just fetch the gemara
 * slice and delegate here. Behavior must stay byte-identical — pinned by golden.
 */

import { partitionSections } from '../argumentMoves';
import { buildVerbatimGrid, findExcerpt, type VerbatimGrid } from './verbatim';

// ---------------------------------------------------------------------------
// argument (section start/end + clean partition)
// ---------------------------------------------------------------------------

export function reanchorArgument(parsed: unknown, segmentsHe: string[]): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = parsed as { instances?: unknown };
  if (!Array.isArray(obj.instances)) return parsed;
  if (segmentsHe.length === 0) return parsed;
  const grid = buildVerbatimGrid(segmentsHe);

  const findExcerptSeg = (excerpt: string, fromIdx: number, toIdx: number): number =>
    findExcerpt(grid, excerpt, fromIdx, toIdx)?.seg ?? -1;

  type Section = {
    startSegIdx: number;
    endSegIdx: number;
    fields: { excerpt: string; endExcerpt?: string; [k: string]: unknown };
  };
  const instances = obj.instances as Section[];
  const lastSeg = segmentsHe.length - 1;

  // Pass 1: anchor each section's start to its excerpt.
  let prevStart = 0;
  for (const inst of instances) {
    if (!inst || typeof inst !== 'object') continue;
    const f = inst.fields ?? ({} as Section['fields']);
    const llmStart = typeof inst.startSegIdx === 'number' ? inst.startSegIdx : prevStart;
    const llmEnd = typeof inst.endSegIdx === 'number' ? inst.endSegIdx : lastSeg;
    const startEx = typeof f.excerpt === 'string' ? f.excerpt : '';
    const m = findExcerptSeg(startEx, prevStart, lastSeg);
    inst.startSegIdx = m >= 0 ? m : Math.max(prevStart, llmStart);
    inst.endSegIdx = Math.max(inst.startSegIdx, llmEnd);
    inst.fields = f;
    prevStart = inst.startSegIdx + 1;
  }

  // Pass 2: anchor each section's end to its endExcerpt.
  for (let i = 0; i < instances.length; i++) {
    const cur = instances[i];
    if (!cur) continue;
    const next = instances[i + 1];
    const upperBound = next ? Math.max(cur.startSegIdx, next.startSegIdx - 1) : lastSeg;
    const endEx = typeof cur.fields?.endExcerpt === 'string' ? cur.fields.endExcerpt : '';
    let endSeg = -1;
    if (endEx) endSeg = findExcerptSeg(endEx, cur.startSegIdx, upperBound);
    if (endSeg < 0) {
      cur.endSegIdx = upperBound;
      if (endEx) {
        console.warn(
          `[argument] endExcerpt "${endEx}" not found in section starting at seg ${cur.startSegIdx} (search [${cur.startSegIdx},${upperBound}])`,
        );
      }
    } else {
      cur.endSegIdx = endSeg;
    }
    if (cur.endSegIdx < cur.startSegIdx) cur.endSegIdx = cur.startSegIdx;
    if (cur.endSegIdx > lastSeg) cur.endSegIdx = lastSeg;
  }

  // Pass 3: collapse a doubled/overlapping partition into one clean tiling.
  obj.instances = partitionSections(instances, lastSeg);
  return obj;
}

// ---------------------------------------------------------------------------
// argument-move (per-move start + token offsets, cursor-ordered)
// ---------------------------------------------------------------------------

export function reanchorArgumentMove(parsed: unknown, segmentsHe: string[]): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = parsed as { instances?: unknown };
  if (!Array.isArray(obj.instances)) return parsed;
  if (segmentsHe.length === 0) return parsed;
  const grid: VerbatimGrid = buildVerbatimGrid(segmentsHe);
  const { segNorms, segWords } = grid;

  const find = (
    excerpt: string,
    fromIdx: number,
    toIdx: number,
  ): { seg: number; tokenStart: number; matchLen: number } => {
    const h = findExcerpt(grid, excerpt, fromIdx, toIdx, { fullMatchLen: true });
    return h
      ? { seg: h.seg, tokenStart: h.tok, matchLen: h.matchLen }
      : { seg: -1, tokenStart: -1, matchLen: 0 };
  };

  type Move = {
    startSegIdx: number;
    endSegIdx: number;
    fields: {
      sectionStartSegIdx: number;
      sectionEndSegIdx: number;
      moveOrder: number;
      excerpt: string;
      endExcerpt?: string;
      tokenStart?: number;
      tokenEnd?: number;
      [k: string]: unknown;
    };
  };
  const instances = obj.instances as Move[];

  // Pass 1: locate each move's startSegIdx + tokenStart by excerpt search.
  let lastSection = -1;
  let searchFromSeg = 0;
  let prevMatchSeg = -1;
  for (const inst of instances) {
    if (!inst || typeof inst !== 'object') continue;
    const f = inst.fields ?? ({} as Move['fields']);
    const sStart = typeof f.sectionStartSegIdx === 'number' ? f.sectionStartSegIdx : 0;
    const sEnd = typeof f.sectionEndSegIdx === 'number' ? f.sectionEndSegIdx : segNorms.length - 1;
    if (sStart !== lastSection) {
      lastSection = sStart;
      searchFromSeg = sStart;
      prevMatchSeg = -1;
    }
    const excerpt = typeof f.excerpt === 'string' ? f.excerpt : '';
    let m = find(excerpt, searchFromSeg, sEnd);
    if (m.seg < 0) m = find(excerpt, sStart, sEnd);
    if (m.seg < 0) {
      const fallbackSeg = prevMatchSeg >= 0 ? Math.min(prevMatchSeg + 1, sEnd) : sStart;
      inst.startSegIdx = fallbackSeg;
      f.tokenStart = 0;
      searchFromSeg = fallbackSeg + 1;
      prevMatchSeg = fallbackSeg;
    } else {
      inst.startSegIdx = m.seg;
      f.tokenStart = m.tokenStart;
      searchFromSeg = m.seg + 1;
      prevMatchSeg = m.seg;
    }
    inst.fields = f;
  }

  // Pass 2: derive endSegIdx + tokenEnd.
  for (let i = 0; i < instances.length; i++) {
    const cur = instances[i];
    if (!cur) continue;
    const sStart =
      typeof cur.fields?.sectionStartSegIdx === 'number'
        ? cur.fields.sectionStartSegIdx
        : cur.startSegIdx;
    const sEnd =
      typeof cur.fields?.sectionEndSegIdx === 'number'
        ? cur.fields.sectionEndSegIdx
        : cur.startSegIdx;
    if (cur.startSegIdx < sStart) cur.startSegIdx = sStart;
    if (cur.startSegIdx > sEnd) cur.startSegIdx = sEnd;
    const next = instances[i + 1];
    const nextInSameSection =
      next && next.fields?.sectionStartSegIdx === cur.fields?.sectionStartSegIdx;
    const curTokStart = typeof cur.fields?.tokenStart === 'number' ? cur.fields.tokenStart : 0;

    const endEx = typeof cur.fields?.endExcerpt === 'string' ? cur.fields.endExcerpt : '';
    let resolved = false;
    if (endEx) {
      const upperSeg = nextInSameSection ? Math.min(sEnd, next.startSegIdx) : sEnd;
      const m = find(endEx, cur.startSegIdx, upperSeg);
      if (m.seg >= 0) {
        cur.endSegIdx = m.seg;
        const tokEnd = m.tokenStart + Math.max(1, m.matchLen) - 1;
        const wordsInSeg = segWords[m.seg]?.length ?? 0;
        cur.fields.tokenEnd = Math.max(0, Math.min(tokEnd, wordsInSeg - 1));
        if (m.seg === cur.startSegIdx && (cur.fields.tokenEnd ?? 0) < curTokStart) {
          resolved = false;
        } else {
          resolved = true;
        }
      }
    }

    if (!resolved) {
      if (nextInSameSection && next.startSegIdx === cur.startSegIdx) {
        cur.endSegIdx = cur.startSegIdx;
        const nextTok =
          typeof next.fields?.tokenStart === 'number'
            ? next.fields.tokenStart
            : segWords[cur.startSegIdx].length;
        cur.fields.tokenEnd = Math.max(curTokStart, nextTok - 1);
      } else if (nextInSameSection) {
        cur.endSegIdx = Math.max(cur.startSegIdx, next.startSegIdx - 1);
        const wordsInLast = segWords[cur.endSegIdx]?.length ?? 0;
        cur.fields.tokenEnd = Math.max(0, wordsInLast - 1);
      } else {
        cur.endSegIdx = sEnd;
        const wordsInLast = segWords[cur.endSegIdx]?.length ?? 0;
        cur.fields.tokenEnd = Math.max(0, wordsInLast - 1);
        if (endEx) {
          console.warn(
            `[argument-move] endExcerpt "${endEx}" not found for last move in section ${sStart}-${sEnd}; defaulting to section end`,
          );
        }
      }
    }
    if (cur.endSegIdx < cur.startSegIdx) cur.endSegIdx = cur.startSegIdx;
    if (cur.endSegIdx > sEnd) cur.endSegIdx = sEnd;
  }

  return obj;
}

// ---------------------------------------------------------------------------
// pesukim (citation start/end + token offsets, whole-daf search, +1 slack)
// ---------------------------------------------------------------------------

export function reanchorPesukim(parsed: unknown, segmentsHe: string[]): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = parsed as { instances?: unknown };
  if (!Array.isArray(obj.instances)) return parsed;
  if (segmentsHe.length === 0) return parsed;
  const grid = buildVerbatimGrid(segmentsHe);
  const { segNorms, segWords } = grid;

  type Pasuk = {
    startSegIdx: number;
    endSegIdx: number;
    fields: {
      excerpt?: string;
      endExcerpt?: string;
      tokenStart?: number;
      tokenEnd?: number;
      [k: string]: unknown;
    };
  };
  const instances = obj.instances as Pasuk[];

  for (const inst of instances) {
    if (!inst || typeof inst !== 'object') continue;
    const f = inst.fields ?? ({} as Pasuk['fields']);
    const startExcerpt = typeof f.excerpt === 'string' ? f.excerpt : '';
    const endExcerpt = typeof f.endExcerpt === 'string' ? f.endExcerpt : '';

    const startHit = findExcerpt(grid, startExcerpt, 0, segNorms.length - 1);
    if (!startHit) {
      inst.fields = f;
      continue;
    }
    inst.startSegIdx = startHit.seg;
    f.tokenStart = startHit.tok;

    const llmEndSeg =
      typeof inst.endSegIdx === 'number' && inst.endSegIdx >= startHit.seg
        ? inst.endSegIdx
        : startHit.seg;
    const upperSeg = Math.min(segNorms.length - 1, llmEndSeg + 1);
    let endHit = endExcerpt ? findExcerpt(grid, endExcerpt, startHit.seg, upperSeg) : null;
    if (endHit) {
      const beforeStart =
        endHit.seg < startHit.seg || (endHit.seg === startHit.seg && endHit.tok < startHit.tok);
      if (beforeStart) endHit = null;
    }

    if (endHit) {
      inst.endSegIdx = endHit.seg;
      const wordsInEndSeg = segWords[endHit.seg]?.length ?? 0;
      f.tokenEnd = Math.max(0, Math.min(endHit.tok + endHit.matchLen - 1, wordsInEndSeg - 1));
    } else {
      inst.endSegIdx = startHit.seg;
      f.tokenEnd = startHit.tok + startHit.matchLen - 1;
      if (endExcerpt) {
        console.warn(
          `[pesukim] endExcerpt "${endExcerpt}" not found in [${startHit.seg},${upperSeg}]`,
        );
      }
    }
    inst.fields = f;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// aggadata (story start/end + token offsets, +2 slack, last-occurrence close)
// ---------------------------------------------------------------------------

export function reanchorAggadata(parsed: unknown, segmentsHe: string[]): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = parsed as { instances?: unknown };
  if (!Array.isArray(obj.instances)) return parsed;
  if (segmentsHe.length === 0) return parsed;
  const grid = buildVerbatimGrid(segmentsHe);
  const { segNorms, segWords } = grid;

  type Story = {
    startSegIdx?: number;
    endSegIdx?: number;
    fields: {
      excerpt?: string;
      endExcerpt?: string;
      tokenStart?: number;
      tokenEnd?: number;
      [k: string]: unknown;
    };
  };
  const instances = obj.instances as Story[];

  for (const inst of instances) {
    if (!inst || typeof inst !== 'object') continue;
    const f = inst.fields ?? ({} as Story['fields']);
    const startExcerpt = typeof f.excerpt === 'string' ? f.excerpt : '';
    const endExcerpt = typeof f.endExcerpt === 'string' ? f.endExcerpt : '';

    const startHit = findExcerpt(grid, startExcerpt, 0, segNorms.length - 1);
    if (!startHit) {
      inst.fields = f;
      continue;
    }
    inst.startSegIdx = startHit.seg;
    f.tokenStart = startHit.tok;

    const llmEndSeg =
      typeof inst.endSegIdx === 'number' && inst.endSegIdx >= startHit.seg
        ? inst.endSegIdx
        : startHit.seg;
    const upperSeg = Math.min(segNorms.length - 1, llmEndSeg + 2);
    let endHit = endExcerpt
      ? findExcerpt(grid, endExcerpt, startHit.seg, upperSeg, { last: true })
      : null;
    if (endHit) {
      const beforeStart =
        endHit.seg < startHit.seg || (endHit.seg === startHit.seg && endHit.tok < startHit.tok);
      if (beforeStart) endHit = null;
    }

    if (endHit) {
      inst.endSegIdx = endHit.seg;
      const wordsInEndSeg = segWords[endHit.seg]?.length ?? 0;
      f.tokenEnd = Math.max(0, Math.min(endHit.tok + endHit.matchLen - 1, wordsInEndSeg - 1));
    } else {
      inst.endSegIdx = startHit.seg;
      f.tokenEnd = startHit.tok + startHit.matchLen - 1;
      if (endExcerpt) {
        console.warn(
          `[aggadata] endExcerpt "${endExcerpt}" not found in [${startHit.seg},${upperSeg}]`,
        );
      }
    }
    inst.fields = f;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// rabbi-evidence (rabbi.relationships.evidence / rabbi.geography.evidence)
// ---------------------------------------------------------------------------

/**
 * Resolve each evidence entry's verbatim `excerpt` to a single-segment anchor
 * (startSegIdx === endSegIdx) plus token offsets, so the sidebar can paint a
 * click-to-highlight range. Unlike the mark re-anchorers the excerpt sits at the
 * TOP level of each entry (not under `fields`), and the search spans the whole
 * daf. Entries with no match keep their note/place name but get no seg/token
 * fields. Byte-identical to the former inline postProcessRabbiEvidence:
 * findExcerpt over [0, last] with default opts is exactly its prefix-fallback +
 * word-aligned/substring matcher and `matchLen = matched-prefix length`.
 */
export function reanchorRabbiEvidence(parsed: unknown, segmentsHe: string[]): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = parsed as { evidence?: unknown };
  if (!Array.isArray(obj.evidence)) return parsed;
  if (segmentsHe.length === 0) return parsed;
  const grid = buildVerbatimGrid(segmentsHe);

  type Evidence = {
    excerpt?: string;
    startSegIdx?: number;
    endSegIdx?: number;
    tokenStart?: number;
    tokenEnd?: number;
    [k: string]: unknown;
  };
  for (const e of obj.evidence as Evidence[]) {
    if (!e || typeof e !== 'object') continue;
    const ex = typeof e.excerpt === 'string' ? e.excerpt : '';
    if (!ex) continue;
    const hit = findExcerpt(grid, ex, 0, segmentsHe.length - 1);
    if (hit) {
      e.startSegIdx = hit.seg;
      e.endSegIdx = hit.seg;
      e.tokenStart = hit.tok;
      e.tokenEnd = hit.tok + hit.matchLen - 1;
    }
  }
  return obj;
}

// ---------------------------------------------------------------------------
// argument.narrative beats (section typing P2b — narrative move layer)
// ---------------------------------------------------------------------------

/**
 * Anchor each narrative beat to its segment via its verbatim `excerpt`, so the
 * story beats become the narrative section's first-class, clickable move layer
 * (parallel to argument-move for disputes). Same single-segment, whole-daf
 * resolution as rabbi-evidence: beats sit at the top level under `beats`, each
 * with a verbatim `excerpt`. Beats with no match keep their text but get no
 * seg/token fields (rendered un-clickable).
 */
export function reanchorNarrative(parsed: unknown, segmentsHe: string[]): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = parsed as { beats?: unknown };
  if (!Array.isArray(obj.beats)) return parsed;
  if (segmentsHe.length === 0) return parsed;
  const grid = buildVerbatimGrid(segmentsHe);

  type Beat = {
    excerpt?: string;
    startSegIdx?: number;
    endSegIdx?: number;
    tokenStart?: number;
    tokenEnd?: number;
    [k: string]: unknown;
  };
  for (const b of obj.beats as Beat[]) {
    if (!b || typeof b !== 'object') continue;
    const ex = typeof b.excerpt === 'string' ? b.excerpt : '';
    if (!ex) continue;
    const hit = findExcerpt(grid, ex, 0, segmentsHe.length - 1);
    if (hit) {
      b.startSegIdx = hit.seg;
      b.endSegIdx = hit.seg;
      b.tokenStart = hit.tok;
      b.tokenEnd = hit.tok + hit.matchLen - 1;
    }
  }
  return obj;
}
