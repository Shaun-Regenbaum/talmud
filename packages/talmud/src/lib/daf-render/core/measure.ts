import type { DafOptions } from './options';
import type { Amud } from './types';

export interface BaseFont {
  family: string;
  size: number;
}

/**
 * Build the CSS-variable bag used by the daf-render stylesheet. We set all
 * layout-driving variables via inline style so the hidden measurement root
 * gets the same cascade as a visible one.
 */
function computeCssVars(opts: DafOptions, amud: Amud): Record<string, string> {
  const sidePercent = ((1 - opts.mainWidth) / 2) * 100;
  const halfwayPercent = opts.halfway * 100;
  const remainderPercent = 100 - sidePercent;
  const amudB = amud === 'b';

  return {
    '--daf-content-width': `${opts.contentWidth}px`,
    '--daf-side-percent': `${sidePercent}%`,
    '--daf-halfway-percent': `${halfwayPercent}%`,
    '--daf-remainder-percent': `${remainderPercent}%`,
    '--daf-padding-vertical': `${opts.padding.vertical}px`,
    '--daf-padding-horizontal': `${opts.padding.horizontal}px`,
    '--daf-font-main': `"${opts.fontFamily.main}"`,
    '--daf-font-inner': `"${opts.fontFamily.inner}"`,
    '--daf-font-outer': `"${opts.fontFamily.outer}"`,
    '--daf-direction': opts.direction,
    '--daf-font-size-main': `${opts.fontSize.main}px`,
    '--daf-font-size-side': `${opts.fontSize.side}px`,
    '--daf-line-height-main': `${opts.lineHeight.main}px`,
    '--daf-line-height-side': `${opts.lineHeight.side}px`,
    '--daf-inner-float': amudB ? 'right' : 'left',
    '--daf-outer-float': amudB ? 'left' : 'right',
  };
}

function makeHost(opts: DafOptions, amud: Amud, extraVars: Record<string, string>): HTMLDivElement {
  const host = document.createElement('div');
  host.className = 'daf-root';
  const vars = { ...computeCssVars(opts, amud), ...extraVars };
  for (const [k, v] of Object.entries(vars)) host.style.setProperty(k, v);
  host.style.position = 'fixed';
  host.style.top = '-99999px';
  host.style.left = '0';
  host.style.visibility = 'hidden';
  host.style.pointerEvents = 'none';
  return host;
}

function makeSideColumn(which: 'inner' | 'outer', html: string): HTMLDivElement {
  const col = document.createElement('div');
  col.className = `daf-${which}`;
  const start = document.createElement('div');
  start.className = 'daf-spacer daf-start';
  const mid = document.createElement('div');
  mid.className = 'daf-spacer daf-mid';
  const end = document.createElement('div');
  end.className = 'daf-spacer daf-end';
  const text = document.createElement('div');
  text.className = 'daf-text';
  const span = document.createElement('span');
  span.innerHTML = html;
  text.appendChild(span);
  col.appendChild(start);
  col.appendChild(mid);
  col.appendChild(end);
  col.appendChild(text);
  return col;
}

function makeMainColumn(html: string): { col: HTMLDivElement; text: HTMLSpanElement } {
  const col = document.createElement('div');
  col.className = 'daf-main';
  const start = document.createElement('div');
  start.className = 'daf-spacer daf-start';
  const innerMid = document.createElement('div');
  innerMid.className = 'daf-spacer daf-inner-mid';
  const outerMid = document.createElement('div');
  outerMid.className = 'daf-spacer daf-outer-mid';
  const text = document.createElement('div');
  text.className = 'daf-text';
  const span = document.createElement('span');
  span.innerHTML = html;
  text.appendChild(span);
  col.appendChild(start);
  col.appendChild(innerMid);
  col.appendChild(outerMid);
  col.appendChild(text);
  return { col, text: span };
}

export interface CommentaryMeasure {
  totalHeight: number;
  narrowUsed: number;
  endUsed: number;
}

/**
 * Exception state for a commentary column (daf-renderer parity).
 *   'none'  — normal layout: halfway-wide start spacer.
 *   'short' — this commentary is the one too short to fill the top region.
 *             Start spacer spans the full column (text pushed below top) and
 *             a padding-vertical gap is added beneath it.
 *   'other' — the other commentary in an exception case. Start spacer has
 *             zero width so text flows at full container width in the top
 *             region (where the short commentary is absent).
 */
export type CommentaryException = 'none' | 'short' | 'other';

/**
 * Measure a side commentary column. Semantics driven by two budgets and an
 * optional exception mode:
 *
 *   narrowBudget — height of the mid spacer (the narrow-width region).
 *                  Infinity means unbounded: text stays at sideWidth throughout
 *                  (natural flow, no widening). Finite means text widens into
 *                  the end region after this height.
 *
 *   endBudget    — height of the end spacer (the halfway-width region past
 *                  mid). 0 means no end spacer: text overflowing past mid flows
 *                  at full container width (daf-renderer Stairs semantics).
 *                  Infinity means unbounded halfway region: text stays at
 *                  halfway forever. Finite means text is at halfway for
 *                  endBudget, then overflows at full width.
 *
 *   exception    — see CommentaryException. Default 'none'.
 */
export function measureCommentary(params: {
  which: 'inner' | 'outer';
  html: string;
  options: DafOptions;
  amud: Amud;
  startHeight: number;
  narrowBudget: number;
  endBudget: number;
  exception?: CommentaryException;
}): CommentaryMeasure {
  if (!params.html || typeof document === 'undefined') {
    return { totalHeight: 0, narrowUsed: 0, endUsed: 0 };
  }

  const midHeight = Number.isFinite(params.narrowBudget)
    ? Math.max(0, params.narrowBudget)
    : 99999;
  const endHeight = Number.isFinite(params.endBudget)
    ? Math.max(0, params.endBudget)
    : 99999;

  const exception = params.exception ?? 'none';
  const startWidth = exception === 'short' ? '100%' : exception === 'other' ? '0%' : `${params.options.halfway * 100}%`;
  const startPad = exception === 'none' ? `${params.options.padding.horizontal / 2}px` : '0px';
  const startGap = exception === 'short' ? `${params.options.padding.vertical}px` : '0px';

  const vars: Record<string, string> = {
    '--daf-start': `${params.startHeight}px`,
    [params.which === 'inner' ? '--daf-inner' : '--daf-outer']: `${midHeight}px`,
    [params.which === 'inner' ? '--daf-inner-end' : '--daf-outer-end']: `${endHeight}px`,
    [params.which === 'inner' ? '--daf-outer' : '--daf-inner']: '0px',
    [params.which === 'inner' ? '--daf-outer-end' : '--daf-inner-end']: '0px',
    [`--daf-${params.which}-start-width`]: startWidth,
    [`--daf-${params.which}-start-pad`]: startPad,
    [`--daf-${params.which}-start-gap`]: startGap,
  };

  const host = makeHost(params.options, params.amud, vars);
  const col = makeSideColumn(params.which, params.html);
  host.appendChild(col);
  document.body.appendChild(host);

  const span = col.querySelector('.daf-text span') as HTMLSpanElement;
  const textRect = span.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const totalHeight = textRect.bottom - hostRect.top;

  host.remove();

  const narrowUsed = Math.max(0, Math.min(totalHeight - params.startHeight, midHeight));
  const endUsed = Math.max(0, Math.min(totalHeight - params.startHeight - midHeight, endHeight));
  return { totalHeight, narrowUsed, endUsed };
}

/**
 * Measure the main column's rendered bottom (relative to the daf-root top),
 * given inner/outer commentary heights as obstacles. Uses the real daf DOM
 * and CSS; inner/outer columns are rendered as sibling obstacles (same
 * absolute-positioned overlay as in the live render), each with its mid
 * spacer sized to the provided heights.
 */
export function measureMainBottom(params: {
  html: string;
  options: DafOptions;
  amud: Amud;
  startHeight: number;
  innerBottom: number;
  outerBottom: number;
}): number {
  if (!params.html || typeof document === 'undefined') return params.startHeight;

  const innerMid = Math.max(0, params.innerBottom - params.startHeight);
  const outerMid = Math.max(0, params.outerBottom - params.startHeight);

  const vars: Record<string, string> = {
    '--daf-start': `${params.startHeight}px`,
    '--daf-inner': `${innerMid}px`,
    '--daf-outer': `${outerMid}px`,
    '--daf-inner-end': '0px',
    '--daf-outer-end': '0px',
  };

  const host = makeHost(params.options, params.amud, vars);

  // Sibling obstacles mimicking the real inner/outer overlay columns
  const innerObs = makeSideColumn('inner', '');
  innerObs.style.opacity = '0';
  host.appendChild(innerObs);
  const outerObs = makeSideColumn('outer', '');
  outerObs.style.opacity = '0';
  host.appendChild(outerObs);

  const { col: mainCol, text } = makeMainColumn(params.html);
  host.appendChild(mainCol);

  document.body.appendChild(host);

  const textRect = text.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const mainBottom = textRect.bottom - hostRect.top;

  host.remove();
  return mainBottom;
}
