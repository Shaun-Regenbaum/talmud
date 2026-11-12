import { type ImageFit, sizeCommentaryImages } from './images';
import { computeLayout, type LayoutResult } from './layout';
import { type CommentaryException, type ImageLanding, imageLandings } from './measure';
import type { DafOptions } from './options';
import type { Amud, DafTexts } from './types';

export interface PreparedDaf {
  /** The text to render: same words, with diagrams sized and tagged. */
  texts: DafTexts;
  layout: LayoutResult;
}

/** How big diagrams may be: small in the narrow strip, bigger where the column is wide. */
export function imageFitFor(o: DafOptions): ImageFit {
  const sideText = (o.contentWidth * (1 - o.mainWidth)) / 2 - o.padding.horizontal;
  const halfText = o.contentWidth * Math.min(o.halfway, 1 - o.halfway) - o.padding.horizontal;
  return {
    // About two thirds of the narrow column: it always fits, and leaves a strip for text.
    maxWidth: 0.62 * sideText,
    wideMaxWidth: 0.62 * halfText,
    lineHeight: o.lineHeight.side,
    charsPerLine: Math.floor(sideText / (0.55 * o.fontSize.side)),
  };
}

function exceptionFor(which: 'inner' | 'outer', exception: 0 | 1 | 2): CommentaryException {
  if (exception === 0) return 'none';
  const shortOne = exception === 1 ? 'inner' : 'outer';
  return which === shortOne ? 'short' : 'other';
}

const sameSet = (a: ReadonlySet<number>, b: ReadonlySet<number>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Lay out the daf with its diagrams sized for where they land.
 *
 * We do not know where a diagram lands until the text is laid out, and its
 * size changes the layout. So: size every diagram for the narrow strip, lay
 * out, find the ones that landed in a wide part, give those the bigger size,
 * and lay out again. If the answer keeps flipping we settle on the smaller
 * size for the ones that flip, which always fits.
 */
export function layoutWithImages(raw: DafTexts, options: DafOptions, amud: Amud): PreparedDaf {
  const fit = imageFitFor(options);
  const build = (wide: { inner: Set<number>; outer: Set<number> }): DafTexts => ({
    main: sizeCommentaryImages(raw.main, fit),
    inner: sizeCommentaryImages(raw.inner, fit, wide.inner),
    outer: sizeCommentaryImages(raw.outer, fit, wide.outer),
  });

  let wide = { inner: new Set<number>(), outer: new Set<number>() };
  let texts = build(wide);
  let layout = computeLayout(texts, options, amud);
  const hasImages = texts.inner.includes('daf-img') || texts.outer.includes('daf-img');
  if (!hasImages || fit.wideMaxWidth === undefined || fit.wideMaxWidth <= fit.maxWidth) {
    return { texts, layout };
  }

  const landings = (t: DafTexts, l: LayoutResult) => {
    const one = (which: 'inner' | 'outer') =>
      imageLandings({
        which,
        html: t[which],
        options,
        amud,
        startHeight: l.spacers.start,
        narrowBudget: l.spacers[which],
        endBudget: which === 'inner' ? l.spacers.innerEnd : l.spacers.outerEnd,
        exception: exceptionFor(which, l.spacers.exception),
      });
    return { inner: one('inner'), outer: one('outer') };
  };
  const pick = (m: Map<number, ImageLanding>, keep: (v: ImageLanding) => boolean) =>
    new Set([...m].filter(([, v]) => keep(v)).map(([i]) => i));
  const classify = (t: DafTexts, l: LayoutResult) => {
    const f = landings(t, l);
    return { inner: pick(f.inner, (v) => v.wide), outer: pick(f.outer, (v) => v.wide) };
  };
  // A bigger picture that cannot fit where it lands gets pushed down the page.
  // Anything that ended up more than a few lines from its anchor goes back to
  // the small size, which always fits.
  const maxDrop = 4 * options.lineHeight.side + options.padding.vertical;
  const settle = (): PreparedDaf => {
    for (let pass = 0; pass < 3; pass++) {
      const f = landings(texts, layout);
      const bad = {
        inner: pick(f.inner, (v) => v.drop > maxDrop),
        outer: pick(f.outer, (v) => v.drop > maxDrop),
      };
      const demote = {
        inner: new Set([...wide.inner].filter((i) => bad.inner.has(i))),
        outer: new Set([...wide.outer].filter((i) => bad.outer.has(i))),
      };
      if (demote.inner.size + demote.outer.size === 0) break;
      wide = {
        inner: new Set([...wide.inner].filter((i) => !demote.inner.has(i))),
        outer: new Set([...wide.outer].filter((i) => !demote.outer.has(i))),
      };
      texts = build(wide);
      layout = computeLayout(texts, options, amud);
    }
    return { texts, layout };
  };

  const seen: Array<typeof wide> = [];
  for (let pass = 0; pass < 3; pass++) {
    const next = classify(texts, layout);
    if (sameSet(next.inner, wide.inner) && sameSet(next.outer, wide.outer)) return settle();
    seen.push(wide);
    // Flipping back to an answer we already tried means it will not settle.
    if (seen.some((w) => sameSet(w.inner, next.inner) && sameSet(w.outer, next.outer))) {
      wide = {
        inner: new Set([...next.inner].filter((i) => wide.inner.has(i))),
        outer: new Set([...next.outer].filter((i) => wide.outer.has(i))),
      };
      texts = build(wide);
      layout = computeLayout(texts, options, amud);
      return settle();
    }
    wide = next;
    texts = build(wide);
    layout = computeLayout(texts, options, amud);
  }
  // Out of passes: keep only the images that are wide in the final layout too.
  const last = classify(texts, layout);
  wide = {
    inner: new Set([...wide.inner].filter((i) => last.inner.has(i))),
    outer: new Set([...wide.outer].filter((i) => last.outer.has(i))),
  };
  texts = build(wide);
  layout = computeLayout(texts, options, amud);
  return settle();
}
