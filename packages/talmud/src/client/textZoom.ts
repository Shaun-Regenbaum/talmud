/**
 * Desktop text size for the Vilna page.
 *
 * Browser zoom is ctrl/cmd + scroll, which a mouse without a wheel cannot do,
 * and ctrl/cmd + plus is easy to miss. This is an in-app zoom of the page
 * after the layout engine has finished: a CSS scale, the same idea as the
 * mobile fit-to-width transform. Line breaks and the Tzurat HaDaf stay as
 * computed. Changing the font size and re-running layout would reflow the
 * columns, so the control never touches font metrics or content width.
 *
 * Phones keep native pinch-zoom. The saved level is desktop-only.
 */
import { createSignal } from 'solid-js';

export const TEXT_ZOOM_KEY = 'daf.textZoom';
export const TEXT_ZOOM_MIN = 0.8;
export const TEXT_ZOOM_MAX = 2;
export const TEXT_ZOOM_STEP = 0.1;
export const TEXT_ZOOM_DEFAULT = 1;

export function clampTextZoom(value: number): number {
  if (!Number.isFinite(value)) return TEXT_ZOOM_DEFAULT;
  const steps = Math.round(value * 10);
  const clamped = Math.min(TEXT_ZOOM_MAX * 10, Math.max(TEXT_ZOOM_MIN * 10, steps));
  return clamped / 10;
}

export function parseTextZoom(raw: string | null): number {
  if (raw == null || raw.trim() === '') return TEXT_ZOOM_DEFAULT;
  return clampTextZoom(Number(raw));
}

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

const [textZoom, setTextZoomSignal] = createSignal(
  parseTextZoom(browserStorage()?.getItem(TEXT_ZOOM_KEY) ?? null),
);

export { textZoom };

export function setTextZoom(next: number): void {
  const clamped = clampTextZoom(next);
  setTextZoomSignal(clamped);
  try {
    browserStorage()?.setItem(TEXT_ZOOM_KEY, String(clamped));
  } catch {
    /* private mode / full storage — the level still applies this session */
  }
}

export function zoomIn(): void {
  setTextZoom(textZoom() + TEXT_ZOOM_STEP);
}

export function zoomOut(): void {
  setTextZoom(textZoom() - TEXT_ZOOM_STEP);
}

export function resetTextZoom(): void {
  setTextZoom(TEXT_ZOOM_DEFAULT);
}

export function textZoomPercent(value: number): number {
  return Math.round(clampTextZoom(value) * 100);
}

export type TextZoomKeyAction = 'in' | 'out' | 'reset';

/**
 * +/-/0 resize the page when no modifier is held. `=` is the unshifted plus
 * key on a US layout; `_` is shift+minus. Ctrl/cmd + plus stays the browser's
 * own zoom.
 */
export function textZoomKeyAction(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): TextZoomKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === '+' || e.key === '=' || e.key === 'Add') return 'in';
  if (e.key === '-' || e.key === '_' || e.key === 'Subtract') return 'out';
  if (e.key === '0') return 'reset';
  return null;
}

/** Phones keep fit-to-width plus pinch-zoom. The saved text size is desktop-only. */
export function readingScale(isMobile: boolean, fitScale: number, textZoomLevel: number): number {
  return isMobile ? fitScale : textZoomLevel;
}

export interface ScaleFrame {
  wrap: { width?: string; height?: string };
  inner: {
    position: 'relative';
    width?: string;
    transform?: string;
    'transform-origin'?: 'top left';
  };
}

/**
 * Wrapper (reserved visual size) and inner box (layout size + transform).
 * scale === 1 leaves the frame untransformed so the default desktop render
 * matches the pre-zoom layout exactly. The mobile fit-to-width path uses the
 * same shape: layout width 520, scale = surface / 520.
 */
export function pageScaleFrame(
  scale: number,
  layoutWidth: number,
  naturalHeight: number,
): ScaleFrame {
  if (!(scale > 0) || scale === 1) {
    return { wrap: {}, inner: { position: 'relative' } };
  }
  return {
    wrap: {
      width: `${Math.round(layoutWidth * scale)}px`,
      height: naturalHeight > 0 ? `${Math.round(naturalHeight * scale)}px` : undefined,
    },
    inner: {
      position: 'relative',
      width: `${layoutWidth}px`,
      transform: `scale(${scale})`,
      'transform-origin': 'top left',
    },
  };
}
