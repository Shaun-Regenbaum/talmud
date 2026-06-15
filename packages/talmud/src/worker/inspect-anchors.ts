/**
 * inspect-anchors — pure helpers for the BY-ANCHOR inspector view.
 *
 * Today the inspector lists one aggregated row per PRODUCER ("argument.synthesis
 * 5/5"). But each instance is a distinct PIECE pinned to a distinct ANCHOR (a
 * pasuk / section / move / rabbi / ...). This reorganizes the daf into ANCHOR
 * GROUPS: each anchored instance, with the producer-pieces that sit on it.
 *
 * The join: a daf-index entry carries the instance id `i` but no label; the
 * mark's stored instance carries the label + segment range. They join on
 * `instanceIdOf(markInstance) === meta.i` — the SAME id the warm path and the
 * index writer used, so it matches by construction (no label needed to join; the
 * label is cosmetic and can be empty, e.g. rishonim).
 */

import { instanceIdOf } from './cache-keys';

export const WHOLE_DAF_ANCHOR = '__whole_daf__';

/** The bits of a stored mark instance (parsed.instances[i]) the anchor needs. */
export interface RawInstanceLike {
  startSegIdx?: unknown;
  endSegIdx?: unknown;
  segIdx?: unknown;
  fields?: Record<string, unknown>;
}

/** Where a piece sits — the join key (instanceId) + a human label + the range,
 *  plus the raw instance so the client can pass it as ?instance= to drill into
 *  that anchor's build-tree. */
export interface AnchorRef {
  markId: string;
  instanceId: string;
  label: string;
  segRange: [number, number] | null;
  instanceJson: unknown;
}

/** One producer's result for one anchor (or for the whole daf). */
export interface AnchorPiece {
  producerId: string;
  label: string;
  kind: 'llm' | 'computed';
  model?: string;
  cached: boolean;
  cost: number | null;
  cold_ms: number | null;
  tokens: number | null;
}

export interface AnchorGroup {
  anchor: AnchorRef;
  pieces: AnchorPiece[];
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Human label for an anchor: the same identity fields instanceLabel uses, plus
 *  `name` (rabbi/places) and `yerushalmiRef`, then a `seg N` fallback (rishonim
 *  carries no label field), then the mark id. Cosmetic — never the join key. */
export function anchorLabelOf(markId: string, inst: RawInstanceLike): string {
  const f = inst.fields ?? {};
  for (const k of [
    'title',
    'topic',
    'theme',
    'caption',
    'verseRef',
    'yerushalmiRef',
    'name',
    'summary',
  ]) {
    const v = f[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const seg = num(inst.startSegIdx) ?? num(inst.segIdx);
  return seg != null ? `seg ${seg}` : markId;
}

function segRangeOf(inst: RawInstanceLike): [number, number] | null {
  const s = num(inst.startSegIdx) ?? num(inst.segIdx);
  if (s == null) return null;
  return [s, num(inst.endSegIdx) ?? s];
}

/** Build the anchor ref for one mark instance (id via instanceIdOf — THE join
 *  key — plus label, range, and the raw instance for drill-in). */
export async function anchorRefOf(markId: string, inst: RawInstanceLike): Promise<AnchorRef> {
  return {
    markId,
    instanceId: await instanceIdOf(inst),
    label: anchorLabelOf(markId, inst),
    segRange: segRangeOf(inst),
    instanceJson: inst,
  };
}

/** Partition placed pieces into anchor groups (+ the whole-daf pieces, anchor =
 *  null). Groups are ordered by mark id, then segment start, then label. */
export function groupByAnchor(placed: Array<{ piece: AnchorPiece; anchor: AnchorRef | null }>): {
  groups: AnchorGroup[];
  wholeDaf: AnchorPiece[];
} {
  const byKey = new Map<string, AnchorGroup>();
  const wholeDaf: AnchorPiece[] = [];
  for (const { piece, anchor } of placed) {
    if (!anchor) {
      wholeDaf.push(piece);
      continue;
    }
    const key = `${anchor.markId}:${anchor.instanceId}`;
    const g = byKey.get(key);
    if (g) g.pieces.push(piece);
    else byKey.set(key, { anchor, pieces: [piece] });
  }
  const groups = [...byKey.values()].sort((a, b) => {
    if (a.anchor.markId !== b.anchor.markId) return a.anchor.markId.localeCompare(b.anchor.markId);
    const as = a.anchor.segRange?.[0] ?? Number.MAX_SAFE_INTEGER;
    const bs = b.anchor.segRange?.[0] ?? Number.MAX_SAFE_INTEGER;
    return as !== bs ? as - bs : a.anchor.label.localeCompare(b.anchor.label);
  });
  return { groups, wholeDaf };
}
