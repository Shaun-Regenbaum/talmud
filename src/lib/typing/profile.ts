/**
 * @fileoverview Section typing — P1: the deterministic TypeProfile composition.
 *
 * The app already extracts independent, overlapping mark layers over the same
 * text (argument / argument-move = dialectical base; halacha / aggadata /
 * pesukim = content overlays). What was missing is the RELATION between them.
 * This module computes it deterministically — no LLM — by intersecting the
 * other layers' instance ranges with a unit's range and emitting a TypeProfile.
 *
 * Design: docs/section-typing.md. Key idea — type is multi-label and granular,
 * not a flat enum:
 *   - the dialectical base (argument-move `role`) is ALWAYS present, so a unit
 *     with no content overlay is `pure-dialectic`, a real type, not a gap;
 *   - content overlays (halacha/aggadata/pesukim) add dimensions; one becomes
 *     `primary` when it MATERIALLY covers the unit (coverage × confidence ×
 *     layer-priority), else `primary` falls back to `pure-dialectic`;
 *   - nesting is native: a small overlay inside a big unit is just a claim with
 *     low `coverage` — it appears in `claims` but doesn't win `primary`.
 *
 * Pure + DOM-free + env-free → lives in src/lib and is unit-testable. Tuning
 * constants (PRIMARY_FLOOR, LAYER_PRIORITY) are documented open questions in the
 * design doc; they're isolated here so empirical tuning is a one-line change.
 */

export type OverlayLayer = 'halacha' | 'aggadata' | 'pesukim';
export type LayerId = 'argument' | 'argument-move' | OverlayLayer | 'rabbi' | 'places';
export type PrimaryType = 'pure-dialectic' | OverlayLayer;

/** The textual register of a unit — what KIND of text it is, an axis orthogonal
 *  to the content `primary` (a unit can be a `mishnah` that is `halacha`, or a
 *  `gemara` that is `pure-dialectic`). Derived deterministically from the
 *  mishnah-in-talmud segment ranges; `baraita` is intentionally absent until a
 *  deterministic signal for it exists (the source only labels mishnah). */
export type Register = 'mishnah' | 'gemara';

export interface UnitRange {
  tractate: string;
  page: string;
  startSegIdx: number;
  endSegIdx: number;
}

/** One mark instance, reduced to what composition needs: its layer, an id, the
 *  segment range it spans, and an optional grounding confidence. */
export interface LayerInstance {
  layer: LayerId;
  instanceId: string;
  startSegIdx: number;
  endSegIdx: number;
  confidence?: number;
}

/** A layer's claim on a unit: which of the unit's segments it covers, and how
 *  much of the unit that is. */
export interface LayerClaim {
  layer: LayerId;
  instanceId: string;
  /** The unit segments this claim covers (sorted, unique). */
  segs: number[];
  /** 0..1 — fraction of the unit's segments the claim covers. */
  coverage: number;
  confidence?: number;
}

export interface TypeProfile {
  unit: UnitRange;
  /** Every layer claim that touches the unit (≥1 segment), coverage-desc. */
  claims: LayerClaim[];
  /** Dominant content dimension, or `pure-dialectic` when no overlay clears
   *  the floor (the always-present dialectical base). Derived, not stored. */
  primary: PrimaryType;
  /** True only when the argument structure over the unit has real opposing
   *  voices (≥1 `opposes` edge) AND the unit actually contains a NAMED speaker
   *  (`hasNamedSpeaker`). Gates dispute rendering (P2). Orthogonal to `primary`:
   *  a כולכם dispute with no content overlay is `primary: 'pure-dialectic'`,
   *  `isDispute: true`. The named-speaker conjunct is the anti-hallucination
   *  guard: an anonymous Stam-only section can't host a real מחלוקת, so an
   *  `opposes` edge there is a fabrication (the model inventing a dispute from
   *  tractate memory) and must not register as one. */
  isDispute: boolean;
  /** True when ≥1 of the unit's argument-moves names an actual speaker
   *  (move `rabbiNames` non-empty). Deterministic — derived from the cached
   *  move marks, so it's available even before the (LLM) voices graph warms.
   *  The voices map's render gate ANDs this with live opposition so a section
   *  with a confidently-wrong fabricated dispute (no named speaker to ground it)
   *  is suppressed. Defaults to `true` when unknown (permissive). */
  hasNamedSpeaker: boolean;
  /** The unit's textual register — `mishnah` when the majority of its segments
   *  fall in the daf's mishnah-in-talmud ranges, else `gemara`. Orthogonal to
   *  `primary`. `gemara` when no mishnah ranges were supplied (the common case;
   *  mishnah is the labeled minority). */
  register: Register;
}

/** An overlay must cover at least this fraction of the unit to win `primary`;
 *  below it the overlay is a NESTED claim and `primary` stays the dialectical
 *  base. (Design open question #2 — tune empirically.) */
export const PRIMARY_FLOOR = 0.5;

/** Tiebreak weight when more than one overlay clears the floor: a story
 *  dominates a ruling dominates a bare verse citation. (Design open question
 *  #1 — tune empirically.) */
export const LAYER_PRIORITY: Record<OverlayLayer, number> = { aggadata: 3, halacha: 2, pesukim: 1 };

/** A unit is `mishnah` when at least this fraction of its segments fall in the
 *  daf's mishnah ranges; otherwise `gemara`. Majority rule so a section that
 *  merely brushes a mishnah boundary stays gemara. */
export const REGISTER_FLOOR = 0.5;

/** The unit's register from the daf's mishnah segment set. Pure; `gemara` when
 *  no mishnah set is supplied (unknown → the common case, not mishnah). */
export function registerOf(unit: UnitRange, mishnaSegs?: ReadonlySet<number>): Register {
  const segs = rangeSegs(unit.startSegIdx, unit.endSegIdx);
  if (!mishnaSegs || mishnaSegs.size === 0 || segs.length === 0) return 'gemara';
  const inMishna = segs.filter((s) => mishnaSegs.has(s)).length;
  return inMishna / segs.length >= REGISTER_FLOOR ? 'mishnah' : 'gemara';
}

const OVERLAYS: ReadonlySet<LayerId> = new Set<LayerId>(['halacha', 'aggadata', 'pesukim']);

/** Inclusive [start..end] as a set of segment indices (empty if inverted). */
function rangeSegs(start: number, end: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

/** A minimal voices-graph shape (argument.voices output) for the dispute test. */
export interface VoicesGraph { edges?: { kind?: string }[] }

/** True when the voices graph carries a real opposition (an `opposes` edge). */
export function hasOpposingVoices(voices?: VoicesGraph | null): boolean {
  return !!voices?.edges?.some((e) => e?.kind === 'opposes');
}

/**
 * Compose a TypeProfile for `unit` from the other layers' instances. Pure +
 * deterministic. `instances` is the flat list of every layer's instances on the
 * daf (argument/halacha/aggadata/pesukim/…); only those overlapping the unit
 * contribute claims. Pass the unit's `argument.voices` graph (when available) to
 * derive `isDispute`; omit it and `isDispute` is false (unknown → not a dispute).
 * Pass `mishnaSegs` (the daf's mishnah segment indices) to derive `register`;
 * omit it and `register` is `gemara`.
 */
export function composeTypeProfile(
  unit: UnitRange,
  instances: readonly LayerInstance[],
  opts: { voices?: VoicesGraph | null; mishnaSegs?: ReadonlySet<number>; hasNamedSpeaker?: boolean } = {},
): TypeProfile {
  const unitSegs = rangeSegs(unit.startSegIdx, unit.endSegIdx);
  const unitSet = new Set(unitSegs);
  const denom = unitSegs.length || 1;

  const claims: LayerClaim[] = [];
  for (const inst of instances) {
    const covered = rangeSegs(inst.startSegIdx, inst.endSegIdx).filter((s) => unitSet.has(s));
    if (covered.length === 0) continue; // doesn't touch the unit
    claims.push({
      layer: inst.layer,
      instanceId: inst.instanceId,
      segs: covered,
      coverage: covered.length / denom,
      confidence: inst.confidence,
    });
  }
  claims.sort((a, b) => b.coverage - a.coverage);

  // primary: the highest-scoring overlay that materially covers the unit;
  // otherwise the always-present dialectical base.
  let primary: PrimaryType = 'pure-dialectic';
  let bestScore = 0;
  for (const c of claims) {
    if (!OVERLAYS.has(c.layer) || c.coverage < PRIMARY_FLOOR) continue;
    const score = c.coverage * (c.confidence ?? 1) * LAYER_PRIORITY[c.layer as OverlayLayer];
    if (score > bestScore) { bestScore = score; primary = c.layer as OverlayLayer; }
  }

  const hasNamedSpeaker = opts.hasNamedSpeaker ?? true; // unknown → permissive
  return {
    unit,
    claims,
    primary,
    isDispute: hasOpposingVoices(opts.voices) && hasNamedSpeaker,
    hasNamedSpeaker,
    register: registerOf(unit, opts.mishnaSegs),
  };
}

/**
 * P0 coverage helper: the unit segments NOT covered by any CONTENT overlay
 * (halacha/aggadata/pesukim). These are the "pure dialectic" segments — covered
 * by the argument base but no content dimension. Not a gap; the dialectical
 * type. Used by the coverage audit to measure how much of a daf is bare שקלא
 * וטריא vs. content-covered.
 */
export function overlayUncoveredSegs(unit: UnitRange, instances: readonly LayerInstance[]): number[] {
  const unitSegs = rangeSegs(unit.startSegIdx, unit.endSegIdx);
  const coveredByOverlay = new Set<number>();
  for (const inst of instances) {
    if (!OVERLAYS.has(inst.layer)) continue;
    for (const s of rangeSegs(inst.startSegIdx, inst.endSegIdx)) coveredByOverlay.add(s);
  }
  return unitSegs.filter((s) => !coveredByOverlay.has(s));
}
