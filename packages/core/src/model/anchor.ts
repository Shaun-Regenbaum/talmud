/**
 * Anchor — THE one shape for "where a piece sits". Every legacy placement
 * vocabulary (AnchorCoord, ContextItem.segs/amud, SegMatch, the seven studio
 * AnchorOutput variants) maps into it — see model/compat.ts.
 *
 * Precision notes:
 * - 'cross-daf' is NOT a precision. Whether a span is cross-daf is DERIVED at
 *   render time by comparing the span's unit path (e.g. [tractate, page]) to
 *   the unit currently in view; the anchor itself just says where it sits.
 * - Whole-daf is a TRUNCATED path ([tractate, page], precision 'unit') — this
 *   retires the DAF_SEG=-1 sentinel in the new model.
 */

import type { RefPart } from './spine.ts';

export interface AnchorPoint {
  /** Reference path into the spine, outermost level first. May be truncated
   *  (a division/unit/work address) — see spine.ts. */
  path: RefPart[];
  /** Token window [start, end] within the leaf segment, when known. */
  tokens?: [number, number];
  /** Verbatim excerpt at this point (display / fallback matching only — not
   *  part of the anchor's identity, see {@link anchorKey}). */
  excerpt?: string;
}

export interface AnchorRange {
  start: AnchorPoint;
  end: AnchorPoint;
}

export type Span = (AnchorPoint | AnchorRange)[];

export type AnchorPrecision = 'token' | 'segment' | 'division' | 'unit' | 'work' | 'external';

export interface Anchor {
  /** Spine id this anchor addresses (see model/spine.ts). */
  spine: string;
  span: Span;
  precision: AnchorPrecision;
  /** How the anchor was earned: 'tosfos-dh' | 'ai' | 'extractor' | 'human' | … */
  via?: string;
  /** 0..1 (AI-earned anchors carry this). */
  confidence?: number;
}

export function isRange(p: AnchorPoint | AnchorRange): p is AnchorRange {
  return 'start' in p;
}

/**
 * The anchor for a piece that sits on an ENTITY spine (`entity:rabbi`,
 * `entity:place`) rather than a text position — a one-level address whose single
 * path component is the entity id. `precision:'unit'` (the whole entity is the
 * addressable unit; entity spines are unordered, so there is no finer grain).
 *
 * `id` MUST be the canonical identity slug (cache/keys `slugId`) so the anchor's
 * id is byte-identical to the global enrichment's cache `instance_id` — the
 * invariant that lets these pieces be expressed on a spine WITHOUT changing any
 * cache key. `via` records how the placement was earned (defaults to 'entity').
 */
export function entityAnchor(spineId: string, id: string, via = 'entity'): Anchor {
  return { spine: spineId, span: [{ path: [id] }], precision: 'unit', via };
}

const PRECISION_RANK: Record<AnchorPrecision, number> = {
  token: 5,
  segment: 4,
  division: 3,
  unit: 2,
  work: 1,
  external: 0,
};

/** Finer precision = higher rank. */
export function precisionRank(p: AnchorPrecision): number {
  return PRECISION_RANK[p];
}

/** > 0 when `a` is finer than `b`, < 0 when coarser, 0 when equal. */
export function comparePrecision(a: AnchorPrecision, b: AnchorPrecision): number {
  return precisionRank(a) - precisionRank(b);
}

/** Identity key of one span element. Excerpt is deliberately excluded — it is
 *  display data, not location; two anchors at the same place with different
 *  excerpts are the same anchor. JSON keeps '2' and 2 distinct. */
function elementKey(p: AnchorPoint | AnchorRange): string {
  if (isRange(p)) return `R${pointKey(p.start)}|${pointKey(p.end)}`;
  return `P${pointKey(p)}`;
}

function pointKey(p: AnchorPoint): string {
  return JSON.stringify([p.path, p.tokens ?? null]);
}

/** Dedupe + sort a span deterministically (same span always serializes the
 *  same way, regardless of producer emission order). */
export function normalizeAnchor(a: Anchor): Anchor {
  const seen = new Set<string>();
  const out: Span = [];
  for (const el of a.span) {
    const k = elementKey(el);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(el);
    }
  }
  out.sort((x, y) => (elementKey(x) < elementKey(y) ? -1 : elementKey(x) > elementKey(y) ? 1 : 0));
  return { ...a, span: out };
}

/** Stable string id for an anchor's LOCATION (spine + precision + normalized
 *  span). via/confidence/excerpts are provenance/display, not identity. */
export function anchorKey(a: Anchor): string {
  const n = normalizeAnchor(a);
  return `${n.spine}|${n.precision}|${n.span.map(elementKey).join(';')}`;
}

/** Safety bound for numeric range expansion (a daf has tens of segments; a
 *  range wider than this is a malformed anchor, not a real span). */
const MAX_RANGE_EXPANSION = 10_000;

/**
 * Expand a span to points. A range expands to one point per index ONLY when
 * both endpoints' leaf path components are numbers on the SAME parent path
 * (e.g. [t, p, 3]..[t, p, 6] → 3,4,5,6) and the width is bounded; otherwise
 * the range contributes its two endpoints as-is.
 */
export function pointsOf(span: Span): AnchorPoint[] {
  const out: AnchorPoint[] = [];
  for (const el of span) {
    if (!isRange(el)) {
      out.push(el);
      continue;
    }
    const s = el.start.path;
    const e = el.end.path;
    const sLeaf = s[s.length - 1];
    const eLeaf = e[e.length - 1];
    const sameParent = s.length === e.length && s.slice(0, -1).every((part, i) => part === e[i]);
    // Endpoints carrying token windows must survive verbatim — synthesized
    // intermediate points would silently drop the token metadata.
    const hasTokens = el.start.tokens !== undefined || el.end.tokens !== undefined;
    if (
      !hasTokens &&
      sameParent &&
      typeof sLeaf === 'number' &&
      typeof eLeaf === 'number' &&
      eLeaf >= sLeaf &&
      eLeaf - sLeaf + 1 <= MAX_RANGE_EXPANSION
    ) {
      const parent = s.slice(0, -1);
      for (let i = sLeaf; i <= eLeaf; i++) out.push({ path: [...parent, i] });
    } else {
      out.push(el.start, el.end);
    }
  }
  return out;
}
