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

/** Which dispute side a node sits on → its badge / spine-dot colour. Mirrors
 *  ArgumentVoiceMap's side palette (A blue, B red) plus a green "source" for the
 *  gemara node and a slate "neutral" for an undisputed codifier. */
export type NodeSide = 'source' | 'a' | 'b' | 'neutral';

export const SIDE_COLOR: Record<NodeSide, string> = {
  source: '#3f6212',  // gemara — green
  a: '#1d4ed8',       // position A — blue   (matches ArgumentVoiceMap COLOR_A)
  b: '#b91c1c',       // position B — red    (matches ArgumentVoiceMap COLOR_B)
  neutral: '#475569', // undisputed codifier — slate
};

/** The relations an edge can express in the codification lineage. */
export type RelationKind = 'transmits' | 'agrees' | 'disagrees' | 'cites';

const REL_COLOR: Record<RelationKind, string> = {
  transmits: '#cfc9bb', // the lineage spine — warm grey
  agrees: '#15803d',    // green   (ArgumentVoiceMap EDGE_SUPPORT)
  disagrees: '#b91c1c', // red     (ArgumentVoiceMap EDGE_OPPOSE)
  cites: '#475569',     // slate   (ArgumentFlowGraph cites)
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
