/**
 * Label placement for GeoMap — deciding which point labels can be drawn, and
 * where, so a crowded map stays readable.
 *
 * The markers themselves are already de-overlapped (GeoMap spirals co-located
 * dots apart), but their text was not: a chapter like Numbers 33, whose forty
 * encampments cluster in the Sinai, drew forty labels on top of each other and
 * none of them could be read.
 *
 * This is the cartographer's answer, not a layout trick: try each label in
 * priority order at a few positions near its dot, keep the first that collides
 * with nothing already placed, and DROP the ones that don't fit. A dropped
 * label is not lost information — every marker carries its name as a native
 * tooltip and as its accessible name — whereas an overlapping one takes its
 * neighbour down with it.
 *
 * Pure and viewport-agnostic so the rules are testable.
 */

export interface LabelCandidate {
  /** Index into the caller's own array — placement is returned by reference. */
  index: number;
  /** The dot's centre. */
  x: number;
  y: number;
  /** Rendered text; an empty one is skipped. */
  text: string;
  /** Which side of the dot the text runs, and from which edge it is anchored. */
  anchorX: number;
  anchor: 'start' | 'end';
  /** Ranked first — a starred or selected point keeps its label. */
  priority?: boolean;
}

export interface PlacedLabel {
  index: number;
  /** Baseline position for the <text>. */
  x: number;
  y: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Vertical offsets tried in order, as a multiple of the line height: beside
 *  the dot first, then just above, then a line below, and so on outward. */
const DY_STEPS = [0.3, -0.85, 1.45, -2, 2.6, -3.15];

export interface PlaceLabelsOptions {
  /** Canvas size — a label may not hang outside it. */
  width: number;
  height: number;
  /** Radius of the markers themselves, treated as obstacles: a name printed
   *  across someone else's dot is as unreadable as one printed across their
   *  name, and it also hides the dot. */
  dotRadius?: number;
  /** Rendered line height in px (the label font size). */
  lineHeight: number;
  /** Mean glyph width as a fraction of the font size. Latin ~0.52; the Hebrew
   *  face is wider. Only used to estimate a box, so a rough value is fine. */
  charWidth: number;
  /** Padding around each box, so neighbours don't touch. */
  pad?: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Choose label positions, dropping the ones that cannot be placed clear of
 * their neighbours. Returns only the labels to draw, in the caller's order.
 *
 * Priority order decides who wins a contested spot: flagged points first
 * (starred / selected), then top-to-bottom so the result is stable as the map
 * re-renders — never by input order, which would let an arbitrary array
 * position decide what the reader can read.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  options: PlaceLabelsOptions,
): PlacedLabel[] {
  const { width, height, lineHeight, charWidth } = options;
  const pad = options.pad ?? 1;
  const r = options.dotRadius ?? 0;
  // Every marker is an obstacle from the start, including those whose own
  // label is placed later — otherwise the first labels claim space over dots
  // not yet considered. A label is exempt from its OWN dot: it is drawn right
  // beside it by design, and counting it would reject every first choice.
  const dots: { owner: number; rect: Rect }[] = r
    ? candidates.map((c) => ({
        owner: c.index,
        rect: { x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r },
      }))
    : [];
  const placed: Rect[] = [];
  const out: PlacedLabel[] = [];

  const ordered = [...candidates]
    .filter((c) => c.text.length > 0)
    .sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || a.y - b.y || a.x - b.x);

  for (const c of ordered) {
    const w = c.text.length * charWidth * lineHeight;
    const x0 = c.anchor === 'start' ? c.anchorX : c.anchorX - w;
    for (const step of DY_STEPS) {
      const baseline = c.y + step * lineHeight;
      const box: Rect = {
        x0: x0 - pad,
        y0: baseline - lineHeight + pad,
        x1: x0 + w + pad,
        y1: baseline + pad,
      };
      // A label that would hang off the canvas is not a placement — the SVG
      // clips it, so it would read as truncated text rather than a clean drop.
      if (box.x0 < 0 || box.x1 > width || box.y0 < 0 || box.y1 > height) continue;
      if (placed.some((p) => overlaps(box, p))) continue;
      if (dots.some((d) => d.owner !== c.index && overlaps(box, d.rect))) continue;
      placed.push(box);
      out.push({ index: c.index, x: c.anchorX, y: baseline });
      break;
    }
  }

  // Back to the caller's order, so the rendered output is index-stable.
  return out.sort((a, b) => a.index - b.index);
}
