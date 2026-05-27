/**
 * Shared orthogonal edge router for the SVG flowchart components
 * (ArgumentVoiceMap, RabbiLineageTree, …). Connector segments are ALWAYS
 * axis-aligned — horizontal, vertical, or an L-shape through a midline — so a
 * connector can never render as a diagonal line. A single segment where both
 * x and y change at once is exactly the "random diagonal" we want to forbid.
 *
 * Routing, decided purely from geometry (caller order is irrelevant):
 *   - Same row (equal top edge)      -> one horizontal segment between the
 *                                       nearer vertical edges.
 *   - Same column (equal mid-x)      -> one vertical segment between the
 *                                       nearer horizontal edges.
 *   - Otherwise                      -> L-shape: vertical out of the upper
 *                                       box, horizontal across a midline Y,
 *                                       vertical into the lower box.
 */

export interface EdgeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function orthogonalEdgePath(from: EdgeRect, to: EdgeRect): string {
  const fromMidX = from.x + from.w / 2;
  const toMidX = to.x + to.w / 2;

  // Same row -> straight horizontal between the nearer vertical edges. Use a
  // single Y for both endpoints so unequal heights can't introduce a tilt.
  if (from.y === to.y) {
    const y = from.y + from.h / 2;
    const startX = toMidX > fromMidX ? from.x + from.w : from.x;
    const endX = toMidX > fromMidX ? to.x : to.x + to.w;
    return `M ${startX} ${y} L ${endX} ${y}`;
  }

  // Same column -> straight vertical between the nearer horizontal edges.
  if (Math.abs(fromMidX - toMidX) < 1) {
    if (to.y > from.y) return `M ${fromMidX} ${from.y + from.h} L ${fromMidX} ${to.y}`;
    return `M ${fromMidX} ${from.y} L ${fromMidX} ${to.y + to.h}`;
  }

  // Otherwise -> L-shape (vertical, horizontal, vertical) through a midline Y.
  if (to.y > from.y) {
    const midY = (from.y + from.h + to.y) / 2;
    return `M ${fromMidX} ${from.y + from.h} L ${fromMidX} ${midY} L ${toMidX} ${midY} L ${toMidX} ${to.y}`;
  }
  const midY = (to.y + to.h + from.y) / 2;
  return `M ${fromMidX} ${from.y} L ${fromMidX} ${midY} L ${toMidX} ${midY} L ${toMidX} ${to.y + to.h}`;
}
