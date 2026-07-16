/**
 * Pure layout for the sage arc diagram — TRUNKED at generation level.
 *
 * Levels of abstraction:
 *   L1 (default)  one era-colored TRUNK per (generation, direction) — out
 *                 above the axis, in below — ending at a single cluster pill
 *                 per generation. Thickness = total interaction volume.
 *   L2 (expand)   a clicked generation fans open: its pill splits into named
 *                 partner dots with per-partner arcs; other generations stay
 *                 trunked. Small networks (<= AUTO_EXPAND_MAX partners)
 *                 auto-expand everything.
 *   L3            partner rows / daf receipts (outside this module).
 *
 * DOM-free; rendered by SageNetworkSection.tsx.
 */

import type { EgoRow } from './egoNetwork';
import { GENERATION_IDS } from './generations';

export const AUTO_EXPAND_MAX = 8;
export const ARC_MAX_PARTNERS_PER_GEN = 14; // fan cap inside one expanded generation

const DOT_GAP = 34; // px between partner dots inside an EXPANDED generation
const GROUP_PAD = 16;
const COLLAPSED_W = 64; // fixed width of a trunked (collapsed) generation group
const EDGE_PAD = 20;
const CENTER_EXTRA = 16;
const MIN_R = 4.5;
const MAX_R = 10;
const PILL_MIN_R = 6;
const PILL_MAX_R = 13;
const TRUNK_MIN = 2.5;
const TRUNK_MAX = 13;
const FAN_MIN = 1.5;
const FAN_MAX = 5.5;
const ARC_HEIGHT_RATIO = 0.32;
const ARC_RY_MIN = 16;
const ARC_RY_MAX = 120;

const GEN_ORDER = new Map<string, number>(GENERATION_IDS.map((id, i) => [id, i]));
const UNKNOWN_ORDER = GENERATION_IDS.length;

export function genOrder(gen: string | null | undefined): number {
  return gen ? (GEN_ORDER.get(gen) ?? UNKNOWN_ORDER) : UNKNOWN_ORDER;
}

/** One partner dot inside an expanded generation. */
export interface ArcDot {
  row: EgoRow;
  x: number;
  r: number;
}

/** A generation group on the axis. */
export interface ArcGroup {
  gen: string | null;
  x: number; // group start
  width: number;
  expanded: boolean;
  isCenterGroup: boolean;
  /** Cluster pill (only when collapsed and it has partners). */
  pill: { x: number; r: number; partnerCount: number } | null;
  dots: ArcDot[]; // only when expanded
  total: number; // summed weight with this generation
  byKind: { kind: string; weight: number }[];
  partnerCount: number;
}

/** An arc — either a generation trunk or an expanded partner fan line. */
export interface ArcEdge {
  kind: 'trunk' | 'fan';
  gen: string | null; // target generation (hover keying at L1)
  slug: string | null; // partner slug (fan only)
  x1: number;
  x2: number;
  ry: number;
  stroke: number;
  above: boolean; // out = above, in = below
  weight: number;
}

export interface ArcLayoutResult {
  width: number;
  center: { x: number; r: number; gen: string | null };
  groups: ArcGroup[];
  edges: ArcEdge[];
  maxAbove: number;
  maxBelow: number;
  autoExpanded: boolean;
  /** Partners not drawn inside an expanded generation (fan cap). */
  fanOverflow: number;
}

function scaled(weight: number, maxWeight: number, min: number, max: number): number {
  const t = Math.sqrt(Math.max(1, weight)) / Math.sqrt(Math.max(1, maxWeight));
  return min + t * (max - min);
}

function ryFor(span: number): number {
  return Math.min(ARC_RY_MAX, Math.max(ARC_RY_MIN, span * ARC_HEIGHT_RATIO));
}

export function layoutSageArcs(
  centerGen: string | null,
  rows: readonly EgoRow[],
  expandedGen?: string | null,
): ArcLayoutResult {
  const autoExpanded = rows.length <= AUTO_EXPAND_MAX;

  // Group rows by generation, chronological order; ensure the center's group.
  const byGen = new Map<string | null, EgoRow[]>();
  for (const r of rows) {
    const g = r.other.generation ?? null;
    const arr = byGen.get(g) ?? [];
    arr.push(r);
    byGen.set(g, arr);
  }
  if (!byGen.has(centerGen ?? null)) byGen.set(centerGen ?? null, []);
  const genKeys = [...byGen.keys()].sort((a, b) => genOrder(a) - genOrder(b));
  const centerOrder = genOrder(centerGen ?? null);

  const maxGenTotal = Math.max(
    1,
    ...genKeys.map((g) => (byGen.get(g) ?? []).reduce((s, r) => s + r.totalWeight, 0)),
  );
  const maxPartnerW = Math.max(1, ...rows.map((r) => r.totalWeight));
  const maxPartnerCount = Math.max(1, ...genKeys.map((g) => (byGen.get(g) ?? []).length));

  const groups: ArcGroup[] = [];
  let centerX = EDGE_PAD;
  let x = EDGE_PAD;
  let fanOverflow = 0;

  for (const gen of genKeys) {
    let members = byGen.get(gen) ?? [];
    const isCenterGroup = gen === (centerGen ?? null);
    // expandedGen uses '?' as the key for the unknown (null) generation, so
    // "no expansion" (null/undefined) never collides with a real group.
    const expanded = autoExpanded || (expandedGen != null && (gen ?? '?') === expandedGen);
    // Strongest tie nearest the center (earlier groups sit left of it).
    if (genOrder(gen) < centerOrder) members = [...members].reverse();

    let drawn = members;
    if (expanded && members.length > ARC_MAX_PARTNERS_PER_GEN) {
      // Keep the heaviest; count the rest (they stay in the row list).
      const byWeight = [...members].sort((a, b) => b.totalWeight - a.totalWeight);
      const keep = new Set(byWeight.slice(0, ARC_MAX_PARTNERS_PER_GEN).map((r) => r.other.slug));
      fanOverflow += members.length - ARC_MAX_PARTNERS_PER_GEN;
      drawn = members.filter((r) => keep.has(r.other.slug));
    }

    const slots = expanded ? drawn.length : drawn.length > 0 ? 1 : 0;
    const innerW = expanded
      ? Math.max(0, slots - 1) * DOT_GAP
      : slots > 0
        ? Math.max(0, COLLAPSED_W - GROUP_PAD * 2)
        : 0;
    const width =
      GROUP_PAD * 2 + innerW + (isCenterGroup ? CENTER_EXTRA + (slots > 0 ? DOT_GAP : 0) : 0);
    const start = x;
    let slotX = start + GROUP_PAD;
    if (isCenterGroup) {
      centerX = slotX;
      slotX += DOT_GAP + CENTER_EXTRA;
    }

    const total = members.reduce((s, r) => s + r.totalWeight, 0);
    const byKindTotals = new Map<string, number>();
    for (const r of members)
      for (const c of r.chips) byKindTotals.set(c.kind, (byKindTotals.get(c.kind) ?? 0) + c.weight);

    const dots: ArcDot[] = [];
    let pill: ArcGroup['pill'] = null;
    if (expanded) {
      for (const row of drawn) {
        dots.push({ row, x: slotX, r: scaled(row.totalWeight, maxPartnerW, MIN_R, MAX_R) });
        slotX += DOT_GAP;
      }
    } else if (drawn.length > 0) {
      pill = {
        x: start + width / 2 + (isCenterGroup ? CENTER_EXTRA / 2 : 0),
        r: scaled(members.length, maxPartnerCount, PILL_MIN_R, PILL_MAX_R),
        partnerCount: members.length,
      };
    }

    groups.push({
      gen,
      x: start,
      width,
      expanded,
      isCenterGroup,
      pill,
      dots,
      total,
      byKind: [...byKindTotals.entries()]
        .map(([kind, weight]) => ({ kind, weight }))
        .sort((a, b) => b.weight - a.weight),
      partnerCount: members.length,
    });
    x = start + width;
  }
  const width = x + EDGE_PAD;

  // Edges. Collapsed group => up to two TRUNKS (out above / in below) to its
  // pill. Expanded group => one FAN line per partner per direction present,
  // thickness from that partner's directional weight.
  const edges: ArcEdge[] = [];
  let maxAbove = 0;
  let maxBelow = 0;
  const push = (e: ArcEdge) => {
    edges.push(e);
    if (e.above) maxAbove = Math.max(maxAbove, e.ry);
    else maxBelow = Math.max(maxBelow, e.ry);
  };

  for (const g of groups) {
    if (!g.expanded && g.pill) {
      const members = byGen.get(g.gen) ?? [];
      for (const above of [true, false]) {
        const w = members.reduce(
          (s, r) =>
            s +
            r.chips.reduce((cs, c) => cs + ((c.direction === 'out') === above ? c.weight : 0), 0),
          0,
        );
        if (w <= 0) continue;
        push({
          kind: 'trunk',
          gen: g.gen,
          slug: null,
          x1: centerX,
          x2: g.pill.x,
          ry: ryFor(Math.abs(g.pill.x - centerX)),
          stroke: scaled(w, maxGenTotal, TRUNK_MIN, TRUNK_MAX),
          above,
          weight: w,
        });
      }
    } else if (g.expanded) {
      for (const d of g.dots) {
        for (const above of [true, false]) {
          const w = d.row.chips.reduce(
            (cs, c) => cs + ((c.direction === 'out') === above ? c.weight : 0),
            0,
          );
          if (w <= 0) continue;
          push({
            kind: 'fan',
            gen: g.gen,
            slug: d.row.other.slug,
            x1: centerX,
            x2: d.x,
            ry: ryFor(Math.abs(d.x - centerX)),
            stroke: scaled(w, maxPartnerW, FAN_MIN, FAN_MAX),
            above,
            weight: w,
          });
        }
      }
    }
  }

  return {
    width,
    center: { x: centerX, r: MAX_R + 2, gen: centerGen ?? null },
    groups,
    edges,
    maxAbove,
    maxBelow,
    autoExpanded,
    fanOverflow,
  };
}

/** Stacked-bar segments for a group's kind breakdown: one consistent
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
export function arcPath(a: Pick<ArcEdge, 'x1' | 'x2' | 'ry' | 'above'>, axisY: number): string {
  const sweep = a.above ? (a.x2 > a.x1 ? 1 : 0) : a.x2 > a.x1 ? 0 : 1;
  const rx = Math.abs(a.x2 - a.x1) / 2;
  return `M ${a.x1} ${axisY} A ${rx} ${a.ry} 0 0 ${sweep} ${a.x2} ${axisY}`;
}

/** Compact generation tick label: "Tanna 4" / "E.Y. 1" / "Bavel 2" / "?" —
 *  short enough that adjacent narrow groups don't collide. */
export function shortGenLabel(gen: string | null, he: boolean): string {
  if (!gen) return '?';
  const m = gen.match(
    /^(zugim|tanna|amora-ey|amora-bavel|savora|geonim|rishonim|achronim)(?:-(\d+))?$/,
  );
  if (!m) return gen;
  const n = m[2] ? ` ${m[2]}` : '';
  const names: Record<string, [string, string]> = {
    zugim: ['Zugim', 'זוגות'],
    tanna: ['Tanna', 'תנאים'],
    'amora-ey': ['E.Y.', 'א״י'],
    'amora-bavel': ['Bavel', 'בבל'],
    savora: ['Savora', 'סבוראים'],
    geonim: ['Geonim', 'גאונים'],
    rishonim: ['Rishonim', 'ראשונים'],
    achronim: ['Achronim', 'אחרונים'],
  };
  const pair = names[m[1]];
  return pair ? `${pair[he ? 1 : 0]}${n}` : gen;
}
