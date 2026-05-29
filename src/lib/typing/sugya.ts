/**
 * @fileoverview Sugya stitching — group argument sections into continuous
 * discussion units (sugyot), across daf boundaries, deterministically.
 *
 * Section typing types each section; the argument-overview flow relates sections
 * to each other (continues / resolves / depends-on / parallels / …). A *sugya*
 * is a maximal run of sections joined by "same-thread" flow edges — and it can
 * straddle dapim (Shabbat 125b–126b). This module is the deterministic core of
 * the cross-page sugya map: given section coordinates (in cross-daf coord.ts
 * coordinates) and flow edges, it returns the connected sugya units.
 *
 * It is pure graph grouping (union-find over the binding edges) — no LLM. The
 * hard, separate problem is *producing* the cross-daf flow edges (the
 * boundary-finder, a later pass); once those exist, the grouping is exactly
 * this. Lives in src/lib, DOM-free, unit-testable.
 */

import { type AnchorCoord, type AnchorSpan, coordKey, normalizeSpan, spanByDaf } from '../context/coord.ts';

export type SugyaFlowKind = 'continues' | 'resolves' | 'depends-on' | 'parallels' | 'contrasts' | 'generalizes' | 'cites';

/** A flow relation between two sections (each a cross-daf coordinate). */
export interface SugyaFlowEdge {
  from: AnchorCoord;
  to: AnchorCoord;
  kind: SugyaFlowKind | string;
}

export interface SugyaUnit {
  /** Every section coordinate in this sugya, normalized (deduped + ordered). */
  span: AnchorSpan;
  /** Per-daf section lists, ordered — the cross-page map's row model. */
  dapim: { tractate: string; page: string; segs: number[] }[];
  /** True when the sugya straddles more than one daf. */
  crossesDaf: boolean;
}

/** Flow kinds that join two sections into ONE continuous sugya thread. The
 *  others (parallels / contrasts / generalizes / cites) are cross-references
 *  between distinct sugyot, so they don't merge. Tunable per call. */
export const SUGYA_BINDING_KINDS: ReadonlySet<string> = new Set(['continues', 'resolves', 'depends-on']);

/**
 * Group `sections` into sugya units: maximal connected components over the
 * binding flow edges. Sections with no binding edge are their own singleton
 * sugya. Edges whose endpoints aren't in `sections` are ignored. Deterministic:
 * components and their contents are returned in stable coordinate order.
 */
export function stitchSugyot(
  sections: readonly AnchorCoord[],
  edges: readonly SugyaFlowEdge[],
  opts: { bindingKinds?: ReadonlySet<string> } = {},
): SugyaUnit[] {
  const binding = opts.bindingKinds ?? SUGYA_BINDING_KINDS;

  // Dedupe section coords by key; keep one coord per key.
  const coordByKey = new Map<string, AnchorCoord>();
  for (const c of sections) {
    const k = coordKey(c);
    if (!coordByKey.has(k)) coordByKey.set(k, c);
  }

  // Union-find over the section keys.
  const parent = new Map<string, string>();
  for (const k of coordByKey.keys()) parent.set(k, k);
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra > rb ? ra : rb, ra > rb ? rb : ra); // smaller key as root → stable
  };

  for (const e of edges) {
    if (!binding.has(e.kind)) continue;
    const a = coordKey(e.from), b = coordKey(e.to);
    if (a === b || !parent.has(a) || !parent.has(b)) continue;
    union(a, b);
  }

  // Gather components.
  const groups = new Map<string, AnchorCoord[]>();
  for (const k of coordByKey.keys()) {
    const root = find(k);
    const g = groups.get(root) ?? [];
    g.push(coordByKey.get(k)!);
    groups.set(root, g);
  }

  const units: SugyaUnit[] = [...groups.values()].map((coords) => {
    const span = normalizeSpan(coords);
    const dapim = spanByDaf(span);
    return { span, dapim, crossesDaf: dapim.length > 1 };
  });
  // Stable order: by the first (normalized) coordinate of each sugya.
  units.sort((u, v) => coordKey(u.span[0]).localeCompare(coordKey(v.span[0])));
  return units;
}
