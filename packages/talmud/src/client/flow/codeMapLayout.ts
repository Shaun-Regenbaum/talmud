/**
 * Pure layout helpers for the codification map (CodificationMap.tsx) — the
 * halacha lineage rendered in the Voices visual grammar. Kept separate from the
 * component so the geometry + colour mapping are unit-testable without a DOM.
 *
 * The map is time-as-Y (lineage top→bottom): a left spine threads the codifier
 * cards (the "transmits" thread), and relation edges (agrees / disagrees /
 * cites) draw in a right gutter as rounded connectors — the same shape as
 * ArgumentFlowGraph's lane connectors, the same colours as ArgumentVoiceMap's
 * edges, so the two maps read as one component language.
 */

import type { CatalogKey } from '../i18n';

/** Which dispute side a node sits on → its badge / spine-dot colour. Mirrors
 *  ArgumentVoiceMap's side palette (A blue, B red) plus a green "source" for the
 *  gemara node and a slate "neutral" for an undisputed codifier. */
export type NodeSide = 'source' | 'a' | 'b' | 'neutral';

export const SIDE_COLOR: Record<NodeSide, string> = {
  source: '#3f6212', // gemara — green
  a: '#1d4ed8', // position A — blue   (matches ArgumentVoiceMap COLOR_A)
  b: '#b91c1c', // position B — red    (matches ArgumentVoiceMap COLOR_B)
  neutral: '#475569', // undisputed codifier — slate
};

/** The relations an edge can express in the codification lineage. */
export type RelationKind = 'transmits' | 'agrees' | 'disagrees' | 'cites';

const REL_COLOR: Record<RelationKind, string> = {
  transmits: '#cfc9bb', // the lineage spine — warm grey
  agrees: '#15803d', // green   (ArgumentVoiceMap EDGE_SUPPORT)
  disagrees: '#b91c1c', // red     (ArgumentVoiceMap EDGE_OPPOSE)
  cites: '#475569', // slate   (ArgumentFlowGraph cites)
};

/** Stroke colour + dash for a relation edge. Only `disagrees` is dashed,
 *  matching the Voices map's opposes style (5 3). */
export function relationStyle(kind: RelationKind): { color: string; dash?: string } {
  return { color: REL_COLOR[kind], dash: kind === 'disagrees' ? '5 3' : undefined };
}

/**
 * Rounded right-gutter connector between two card mid-Ys. Exits the cards' right
 * edge, runs to the lane, turns with a quarter-circle, runs vertically, turns
 * back, and re-enters at the lower card's right edge — never diagonal.
 *
 * @param y1 mid-Y of the from-card
 * @param y2 mid-Y of the to-card
 * @param rightX the cards' right edge (where the connector attaches)
 * @param laneX the vertical lane x in the right gutter (rightX < laneX)
 */
export function gutterEdgePath(y1: number, y2: number, rightX: number, laneX: number): string {
  const dir = y2 >= y1 ? 1 : -1;
  const r = Math.max(0, Math.min(10, Math.abs(y2 - y1) / 2, laneX - rightX));
  return [
    `M ${rightX} ${y1}`,
    `L ${laneX - r} ${y1}`,
    `Q ${laneX} ${y1} ${laneX} ${y1 + dir * r}`,
    `L ${laneX} ${y2 - dir * r}`,
    `Q ${laneX} ${y2} ${laneX - r} ${y2}`,
    `L ${rightX} ${y2}`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Map model + mapper from the codification enrichment shape
// ---------------------------------------------------------------------------

/** One node in the lineage (a codifier, or the gemara source at the top). */
export interface CodeMapNode {
  id: string;
  /** Authority handle shown bold (e.g. "Rambam", "Shulchan Aruch", "Gemara").
   *  English fallback; prefer `labelKey` for the localized surface. */
  label: string;
  /** i18n catalog key for the authority handle, so the card localizes (Hebrew
   *  mode shows "רמב״ם" / "גמרא" rather than the English label). */
  labelKey?: CatalogKey;
  /** Citation shown in link-blue (e.g. "OC 235:3"). */
  ref?: string;
  /** A short, plain ruling line under the heading. */
  ruling?: string;
  /** Small uppercase tag after the label (e.g. "source"). English fallback. */
  era?: string;
  /** i18n catalog key for the `era` tag, so it localizes too. */
  eraKey?: CatalogKey;
  /** Dispute side → badge / spine-dot colour. */
  side: NodeSide;
  /** Optional practice chip (Sephardi / Ashkenazi / accepted-by-all). */
  practice?: { en: string; he?: string; tone: 'sef' | 'ashk' | 'both' };
}

export interface CodeMapEdge {
  from: string;
  to: string;
  kind: RelationKind;
}

/** The codification enrichment's current output shape (one ruling per codifier).
 *  `rema` non-null encodes the Mechaber/Rema divergence. */
export interface CodificationRuling {
  ref: string;
  ruling: string;
}
export interface CodificationData {
  mishnehTorah: CodificationRuling | null;
  tur: CodificationRuling | null;
  shulchanAruch: CodificationRuling | null;
  rema: CodificationRuling | null;
  prose: string;
}

const hasRef = (r: CodificationRuling | null | undefined): r is CodificationRuling =>
  !!r && typeof r.ref === 'string' && r.ref.trim().length > 0;

/**
 * Build the codification map from the enrichment output: a gemara source node
 * on top, then the present codifiers in lineage order (Rambam → Tur → Shulchan
 * Aruch). When Rema diverges, it becomes a second side-B node bracketed to the
 * Shulchan Aruch (side A) by a `disagrees` edge — the Mechaber/Rema split folded
 * into the lineage. The gemara→first-codifier edge is `cites`; the rest of the
 * spine is `transmits`.
 */
export function codeMapFromCodification(
  d: CodificationData,
  dafRef: string,
): { nodes: CodeMapNode[]; edges: CodeMapEdge[] } {
  const nodes: CodeMapNode[] = [
    {
      id: 'gemara',
      label: 'Gemara',
      labelKey: 'source.gemara',
      ref: dafRef,
      era: 'source',
      eraKey: 'source.badge',
      side: 'source',
    },
  ];
  const edges: CodeMapEdge[] = [];
  // The Mechaber/Rema split only makes sense when the Shulchan Aruch is present
  // (Rema glosses it). A Rema without an SA node has nothing to disagree with.
  const disputed = hasRef(d.rema) && hasRef(d.shulchanAruch);
  const spine: Array<[keyof CodificationData, string, CatalogKey]> = [
    ['mishnehTorah', 'Rambam', 'source.rambam'],
    ['tur', 'Tur', 'source.tur'],
    [
      'shulchanAruch',
      disputed ? 'Mechaber' : 'Shulchan Aruch',
      disputed ? 'source.mechaber' : 'source.shulchanAruch',
    ],
  ];
  let prev = 'gemara';
  let firstCodifier = true;
  for (const [key, label, labelKey] of spine) {
    const r = d[key] as CodificationRuling | null;
    if (!hasRef(r)) continue;
    const side: NodeSide = disputed && key === 'shulchanAruch' ? 'a' : 'neutral';
    nodes.push({ id: key, label, labelKey, ref: r.ref, ruling: r.ruling, side });
    edges.push({ from: prev, to: key, kind: firstCodifier ? 'cites' : 'transmits' });
    prev = key;
    firstCodifier = false;
  }
  if (disputed) {
    nodes.push({
      id: 'rema',
      label: 'Rema',
      labelKey: 'source.rema',
      ref: d.rema!.ref,
      ruling: d.rema!.ruling,
      side: 'b',
    });
    edges.push({ from: 'shulchanAruch', to: 'rema', kind: 'disagrees' });
  }
  return { nodes, edges };
}
