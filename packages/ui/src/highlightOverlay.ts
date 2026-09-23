/**
 * Continuous-block text highlights, shared by both readers.
 *
 * A highlighted range is painted as absolute-positioned bands, one per visual
 * line, instead of a background on the text itself. Inline backgrounds leave a
 * strip of page showing between lines (the line-height leading) and box each
 * inline element on its own; the bands close those gaps so a passage reads as
 * one block, like a physical highlighter.
 */

export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Band extends RectLike {
  /** First band of its block: rounds the top corners. */
  first: boolean;
  /** Last band of its block: rounds the bottom corners. */
  last: boolean;
}

export interface BandOptions {
  /** Rects whose tops differ by at most this many px sit on one line.
   *  Diacritics and raised verse numbers nudge a rect's top. Default 6. */
  tolerance?: number;
  /** A line that starts more than this many px below the previous line's
   *  bottom begins a new block (a paragraph break) instead of being joined to
   *  it. Default: never split. */
  maxGap?: number;
  /** Which text column a rect sits in, for multi-column layouts. Lines are
   *  grouped and joined only within one column. Default: one column. */
  column?: (rect: RectLike) => number;
}

/** Merge a range's client rects into one band per line, and join consecutive
 *  lines into blocks by stretching each band down to the next band's top. A
 *  partial first or last line leaves a small notch at the block's corner. */
export function lineBands(rects: readonly RectLike[], options: BandOptions = {}): Band[] {
  const tolerance = options.tolerance ?? 6;
  const maxGap = options.maxGap ?? Number.POSITIVE_INFINITY;
  const columnOf = options.column ?? (() => 0);
  const lines: { column: number; rects: RectLike[] }[] = [];
  for (const r of rects) {
    const column = columnOf(r);
    const line = lines.find(
      (l) => l.column === column && Math.abs(l.rects[0].top - r.top) <= tolerance,
    );
    if (line) line.rects.push(r);
    else lines.push({ column, rects: [r] });
  }
  const bands = lines.map((line) => {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const r of line.rects) {
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    return { column: line.column, left, right, top, bottom };
  });
  bands.sort((a, b) => a.column - b.column || a.top - b.top);
  const out: Band[] = [];
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const prev = bands[i - 1];
    const next = bands[i + 1];
    const joinsPrev = !!prev && prev.column === b.column && b.top - prev.bottom <= maxGap;
    const joinsNext = !!next && next.column === b.column && next.top - b.bottom <= maxGap;
    out.push({
      left: b.left,
      right: b.right,
      top: b.top,
      bottom: joinsNext ? next.top : b.bottom,
      first: !joinsPrev,
      last: !joinsNext,
    });
  }
  return out;
}

export interface PaintOptions extends BandOptions {
  /** Class list for every band, e.g. `daf-range-highlight daf-range-highlight-section`. */
  className: string;
  /** Added to the first band of each block. */
  firstClass?: string;
  /** Added to the last band of each block. */
  lastClass?: string;
  /** Optional per-range inline background color. */
  bgFor?: (rangeIndex: number) => string | undefined;
}

/**
 * Paint `ranges` into `overlay` as bands positioned against `origin`, which
 * must be a positioned ancestor of `overlay`. Appends; the caller clears the
 * overlay first when repainting.
 */
export function paintRangeOverlay(
  overlay: HTMLElement,
  origin: HTMLElement,
  ranges: readonly Range[],
  options: PaintOptions,
): void {
  if (ranges.length === 0) return;
  const originRect = origin.getBoundingClientRect();
  // getClientRects() returns visually-scaled coordinates when an ancestor is
  // CSS-transformed (mobile fit-to-width). The band divs are appended inside
  // that same transformed frame, so writing scaled px would scale a second
  // time. Divide deltas/dimensions by the effective scale (visual width /
  // layout width) to cancel it. scale === 1 on desktop → no-op.
  const scale = origin.offsetWidth > 0 ? originRect.width / origin.offsetWidth : 1;
  for (let ri = 0; ri < ranges.length; ri++) {
    const rects = Array.from(ranges[ri].getClientRects()).filter(
      (r) => r.width > 0 && r.height > 0,
    );
    if (rects.length === 0) continue;
    const bg = options.bgFor?.(ri);
    for (const b of lineBands(rects, options)) {
      const el = document.createElement('div');
      el.className = options.className;
      if (b.first && options.firstClass) el.classList.add(options.firstClass);
      if (b.last && options.lastClass) el.classList.add(options.lastClass);
      el.style.left = `${(b.left - originRect.left) / scale}px`;
      el.style.top = `${(b.top - originRect.top) / scale}px`;
      el.style.width = `${(b.right - b.left) / scale}px`;
      el.style.height = `${(b.bottom - b.top) / scale}px`;
      if (bg) el.style.backgroundColor = bg;
      overlay.appendChild(el);
    }
  }
}

/** The overlay layer inside `host`, created on first use and emptied. */
export function resetOverlay(host: HTMLElement, className: string): HTMLElement {
  let overlay = Array.from(host.children).find((c) => c.classList.contains(className)) as
    | HTMLElement
    | undefined;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = className;
    host.appendChild(overlay);
  }
  overlay.replaceChildren();
  return overlay;
}
