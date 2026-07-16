/**
 * Pure layout for the sage arc diagram: partners placed on a generation-ordered
 * (chronological) axis, arcs from the center sage to each partner — OUTGOING
 * relations arch above the axis, INCOMING below, so direction never needs an
 * arrowhead. Arc thickness scales with sighting weight; a per-generation
 * stacked breakdown (by relation kind) runs under the axis. DOM-free.
 */

import type { EgoChip, EgoRow } from './egoNetwork';
import { GENERATION_IDS } from './generations';

export const ARC_MAX_PARTNERS = 36;

const DOT_GAP = 26; // px between partner dots inside a generation group
const GROUP_PAD = 18; // px padding on each side of a generation group
const EDGE_PAD = 24; // outer margins
const CENTER_EXTRA = 14; // extra room the center dot claims in its group
const MIN_R = 4;
const MAX_R = 10;
const MIN_STROKE = 1.5;
const MAX_STROKE = 6.5;
const ARC_HEIGHT_RATIO = 0.36; // arc ry = span * ratio, clamped below
const ARC_RY_MIN = 18;
const ARC_RY_MAX = 150;
const KIND_NEST_STEP = 5; // extra ry per additional kind between the same pair

const GEN_ORDER = new Map<string, number>(GENERATION_IDS.map((id, i) => [id, i]));
const UNKNOWN_ORDER = GENERATION_IDS.length;

export function genOrder(gen: string | null | undefined): number {
  return gen ? (GEN_ORDER.get(gen) ?? UNKNOWN_ORDER) : UNKNOWN_ORDER;
}

export interface ArcTick {
  gen: string | null;
  x: number; // group start
  width: number;
  total: number; // summed weight of interactions with this generation
  byKind: { kind: string; weight: number }[]; // stacked-bar segments, weight desc
}

export interface ArcDot {
  row: EgoRow;
  x: number;
  r: number;
}

export interface ArcPath {
  slug: string; // partner slug (for hover keying)
  chip: EgoChip;
  x1: number; // center x
  x2: number; // partner x
  ry: number;
  stroke: number;
  above: boolean; // out = above, in = below
}

export interface ArcLayoutResult {
  width: number;
  center: { x: number; r: number; gen: string | null };
  ticks: ArcTick[];
  dots: ArcDot[];
  arcs: ArcPath[];
  maxAbove: number; // tallest arc ry above the axis (for viewBox sizing)
  maxBelow: number;
  overflow: number; // partners beyond ARC_MAX_PARTNERS (still in the row list)
}

function strokeFor(weight: number, maxWeight: number): number {
  const t = Math.sqrt(Math.max(1, weight)) / Math.sqrt(Math.max(1, maxWeight));
  return MIN_STROKE + t * (MAX_STROKE - MIN_STROKE);
}

function radiusFor(weight: number, maxWeight: number): number {
  const t = Math.sqrt(Math.max(1, weight)) / Math.sqrt(Math.max(1, maxWeight));
  return MIN_R + t * (MAX_R - MIN_R);
}

export function layoutArcs(centerGen: string | null, rows: readonly EgoRow[]): ArcLayoutResult {
  const drawn = rows.slice(0, ARC_MAX_PARTNERS);
  const overflow = rows.length - drawn.length;
  const maxWeight = drawn.reduce((m, r) => Math.max(m, r.totalWeight), 1);

  // Group partners by generation, chronological; the center sage occupies a
  // slot in its own generation group (created even if it has no partners).
  const groups = new Map<string | null, EgoRow[]>();
  for (const r of drawn) {
    const g = r.other.generation ?? null;
    const arr = groups.get(g) ?? [];
    arr.push(r);
    groups.set(g, arr);
  }
  if (!groups.has(centerGen ?? null)) groups.set(centerGen ?? null, []);
  const genKeys = [...groups.keys()].sort((a, b) => genOrder(a) - genOrder(b));
  const centerOrder = genOrder(centerGen ?? null);

  const ticks: ArcTick[] = [];
  const dots: ArcDot[] = [];
  let centerX = EDGE_PAD;
  let x = EDGE_PAD;
  for (const gen of genKeys) {
    let members = groups.get(gen) ?? [];
    const isCenterGroup = gen === (centerGen ?? null);
    // Strongest tie nearest the center: groups EARLIER than the center's
    // generation sit to its left, so reverse their weight-desc order (heaviest
    // ends up rightmost = shortest arc). Later groups keep weight-desc.
    if (genOrder(gen) < centerOrder) members = [...members].reverse();
    const slots = members.length + (isCenterGroup ? 1 : 0);
    const width =
      GROUP_PAD * 2 + Math.max(0, slots - 1) * DOT_GAP + (isCenterGroup ? CENTER_EXTRA : 0);
    const start = x;
    let slotX = start + GROUP_PAD;
    if (isCenterGroup) {
      centerX = slotX;
      slotX += DOT_GAP + CENTER_EXTRA;
    }
    // members arrive weight-sorted from groupEgoEdges; keep that order.
    const byKindTotals = new Map<string, number>();
    let total = 0;
    for (const row of members) {
      dots.push({ row, x: slotX, r: radiusFor(row.totalWeight, maxWeight) });
      slotX += DOT_GAP;
      total += row.totalWeight;
      for (const c of row.chips)
        byKindTotals.set(c.kind, (byKindTotals.get(c.kind) ?? 0) + c.weight);
    }
    ticks.push({
      gen,
      x: start,
      width,
      total,
      byKind: [...byKindTotals.entries()]
        .map(([kind, weight]) => ({ kind, weight }))
        .sort((a, b) => b.weight - a.weight),
    });
    x = start + width;
  }
  const width = x + EDGE_PAD;

  // Arcs: one per (partner, chip); same-pair chips nest at increasing radii.
  const arcs: ArcPath[] = [];
  let maxAbove = 0;
  let maxBelow = 0;
  const dotX = new Map(dots.map((d) => [d.row.other.slug, d.x]));
  for (const row of drawn) {
    const x2 = dotX.get(row.other.slug);
    if (x2 === undefined) continue;
    const span = Math.abs(x2 - centerX);
    const baseRy = Math.min(ARC_RY_MAX, Math.max(ARC_RY_MIN, span * ARC_HEIGHT_RATIO));
    let aboveN = 0;
    let belowN = 0;
    for (const chip of row.chips) {
      const above = chip.direction === 'out';
      const nest = above ? aboveN++ : belowN++;
      const ry = baseRy + nest * KIND_NEST_STEP;
      arcs.push({
        slug: row.other.slug,
        chip,
        x1: centerX,
        x2,
        ry,
        stroke: strokeFor(chip.weight, maxWeight),
        above,
      });
      if (above) maxAbove = Math.max(maxAbove, ry);
      else maxBelow = Math.max(maxBelow, ry);
    }
  }

  return {
    width,
    center: { x: centerX, r: MAX_R + 2, gen: centerGen ?? null },
    ticks,
    dots,
    arcs,
    maxAbove,
    maxBelow,
    overflow,
  };
}

/** Stacked-bar segments for a tick's kind breakdown: one consistent
 *  rendered-width model (min width, fixed gap, x advances by RENDERED width)
 *  so segments can never overlap. `x` is relative to the bar's left edge. */
export function barSegments(
  byKind: readonly { kind: string; weight: number }[],
  total: number,
  barWidth: number,
  gap = 2,
  minW = 1.5,
): { kind: string; weight: number; x: number; w: number }[] {
  if (total <= 0 || barWidth <= 0) return [];
  const out: { kind: string; weight: number; x: number; w: number }[] = [];
  let x = 0;
  for (const seg of byKind) {
    const w = Math.max(minW, (seg.weight / total) * barWidth - gap);
    out.push({ kind: seg.kind, weight: seg.weight, x, w });
    x += w + gap;
  }
  return out;
}

/** SVG path for one arc: half-ellipse from (x1, axisY) to (x2, axisY). */
export function arcPath(a: ArcPath, axisY: number): string {
  const sweep = a.above ? (a.x2 > a.x1 ? 1 : 0) : a.x2 > a.x1 ? 0 : 1;
  const rx = Math.abs(a.x2 - a.x1) / 2;
  return `M ${a.x1} ${axisY} A ${rx} ${a.ry} 0 0 ${sweep} ${a.x2} ${axisY}`;
}
