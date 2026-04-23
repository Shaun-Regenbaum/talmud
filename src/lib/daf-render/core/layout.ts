import type { DafOptions } from './options';
import type { DafTexts, SpacerHeights, ColumnGeometry, LayoutCase, Amud } from './types';
import {
  measureCommentary,
  measureMainBottom,
  type CommentaryMeasure,
  type CommentaryException,
} from './measure';

export interface DafGeometry extends ColumnGeometry {
  topWidth: number;
}

export function computeGeometry(options: DafOptions): DafGeometry {
  const content = options.contentWidth;
  const padH = options.padding.horizontal;
  const midWidth = content * options.mainWidth - 2 * padH;
  const sideWidth = (content * (1 - options.mainWidth)) / 2;
  const topWidth = content * options.halfway - padH;
  const fullWidth = content - 2 * padH;
  return { midWidth, sideWidth, fullWidth, totalContentWidth: content, topWidth };
}

export interface LayoutResult {
  spacers: SpacerHeights & { innerEnd: number; outerEnd: number };
  geometry: DafGeometry;
  totalHeight: number;
}

export function computeLayout(
  texts: DafTexts,
  options: DafOptions,
  amud: Amud = 'a',
): LayoutResult {
  const geometry = computeGeometry(options);
  const hasInner = !!texts.inner;
  const hasOuter = !!texts.outer;
  // With both commentaries absent there's no top region to reserve — main
  // text should flow from y=0 at full content width. Keep the normal top
  // region whenever at least one commentary is present so the surviving
  // commentary can anchor it in 'other' mode.
  const startHeight = (hasInner || hasOuter) ? 4.3 * options.lineHeight.side : 0;

  // --- Pass 1a: default naturals (no exception) ------------------------------
  const innerNat0 = measureCommentary({
    which: 'inner', html: texts.inner, options, amud, startHeight,
    narrowBudget: Infinity, endBudget: 0, exception: 'none',
  });
  const outerNat0 = measureCommentary({
    which: 'outer', html: texts.outer, options, amud, startHeight,
    narrowBudget: Infinity, endBudget: 0, exception: 'none',
  });

  // --- Detect exception ------------------------------------------------------
  // Exception modes fire when exactly one commentary occupies the top region.
  // A commentary is "absent from top" either because it's entirely missing
  // (empty html) or because its natural flow fits within startHeight. In
  // both cases the present/longer commentary moves to 'other' mode (zero-
  // width start spacer → text flows at full container width in the top
  // region instead of at halfway).
  let exception: 0 | 1 | 2 = 0;
  let innerExc: CommentaryException = 'none';
  let outerExc: CommentaryException = 'none';
  if (!hasInner && hasOuter) {
    exception = 1; innerExc = 'short'; outerExc = 'other';
  } else if (!hasOuter && hasInner) {
    exception = 2; innerExc = 'other'; outerExc = 'short';
  } else if (hasInner && hasOuter) {
    const innerTooShort = innerNat0.totalHeight <= startHeight;
    const outerTooShort = outerNat0.totalHeight <= startHeight;
    if (innerTooShort && !outerTooShort) {
      exception = 1; innerExc = 'short'; outerExc = 'other';
    } else if (outerTooShort && !innerTooShort) {
      exception = 2; innerExc = 'other'; outerExc = 'short';
    }
  }

  // --- Pass 1b (if exception): re-measure naturals with exception layout -----
  const innerNatural = exception ? measureCommentary({
    which: 'inner', html: texts.inner, options, amud, startHeight,
    narrowBudget: Infinity, endBudget: 0, exception: innerExc,
  }) : innerNat0;
  const outerNatural = exception ? measureCommentary({
    which: 'outer', html: texts.outer, options, amud, startHeight,
    narrowBudget: Infinity, endBudget: 0, exception: outerExc,
  }) : outerNat0;

  // --- Pass 2: main bottom ---------------------------------------------------
  const mainBottom = measureMainBottom({
    html: texts.main,
    options, amud, startHeight,
    innerBottom: innerNatural.totalHeight,
    outerBottom: outerNatural.totalHeight,
  });

  // --- Classify --------------------------------------------------------------
  const minComm = Math.min(innerNatural.totalHeight, outerNatural.totalHeight);
  const maxComm = Math.max(innerNatural.totalHeight, outerNatural.totalHeight);
  const layoutCase: LayoutCase =
    mainBottom <= minComm ? 'double-wrap'
    : mainBottom < maxComm ? 'stairs'
    : 'double-extend';

  const widenBudget = Math.max(0, mainBottom - startHeight);

  // --- Pass 3: case-specific re-measurement, preserving exception ----------
  const remeasure = (
    which: 'inner' | 'outer',
    html: string,
    natural: CommentaryMeasure,
    exc: CommentaryException,
    narrowBudget: number,
    endBudget: number,
  ): CommentaryMeasure => {
    if (natural.totalHeight <= mainBottom) return natural;
    return measureCommentary({ which, html, options, amud, startHeight, narrowBudget, endBudget, exception: exc });
  };

  let inner: CommentaryMeasure = innerNatural;
  let outer: CommentaryMeasure = outerNatural;

  if (layoutCase === 'stairs') {
    inner = remeasure('inner', texts.inner, innerNatural, innerExc, widenBudget, 0);
    outer = remeasure('outer', texts.outer, outerNatural, outerExc, widenBudget, 0);
  } else if (layoutCase === 'double-wrap') {
    // Shared end = shorter commentary's halfway overflow
    const innerHalf = measureCommentary({
      which: 'inner', html: texts.inner, options, amud, startHeight,
      narrowBudget: widenBudget, endBudget: Infinity, exception: innerExc,
    });
    const outerHalf = measureCommentary({
      which: 'outer', html: texts.outer, options, amud, startHeight,
      narrowBudget: widenBudget, endBudget: Infinity, exception: outerExc,
    });
    const sharedEnd = Math.min(innerHalf.endUsed, outerHalf.endUsed);
    inner = measureCommentary({
      which: 'inner', html: texts.inner, options, amud, startHeight,
      narrowBudget: widenBudget, endBudget: sharedEnd, exception: innerExc,
    });
    outer = measureCommentary({
      which: 'outer', html: texts.outer, options, amud, startHeight,
      narrowBudget: widenBudget, endBudget: sharedEnd, exception: outerExc,
    });
  }

  const totalHeight = Math.max(mainBottom, inner.totalHeight, outer.totalHeight);

  const result: LayoutResult = {
    spacers: {
      start: startHeight,
      inner: inner.narrowUsed,
      outer: outer.narrowUsed,
      innerEnd: inner.endUsed,
      outerEnd: outer.endUsed,
      end: 0,
      layoutCase,
      exception,
    },
    geometry,
    totalHeight,
  };

  if (typeof window !== 'undefined') {
    const r = Math.round;
    // eslint-disable-next-line no-console
    console.log(
      `[daf-render] w=${options.contentWidth} case=${layoutCase} exception=${exception}`,
      `inner: narrow=${r(inner.narrowUsed)} end=${r(inner.endUsed)}`,
      `| outer: narrow=${r(outer.narrowUsed)} end=${r(outer.endUsed)}`,
      `| main=${r(mainBottom)} root=${r(totalHeight)}`,
    );
  }

  return result;
}
