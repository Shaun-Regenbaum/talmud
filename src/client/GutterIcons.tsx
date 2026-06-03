/**
 * GutterIcons — measurement-only component (publishes to gutterStack).
 *
 * Each instance measures the y-positions of its kind's anchor spans in
 * the daf DOM (`.daf-argument-anchor`, `.daf-halacha-anchor`, etc.) and
 * publishes the result to the shared `gutterStack` store. The unified
 * `GutterOverlay` reads the store, groups same-line items across kinds,
 * and renders the clusters with stack-and-expand behaviour.
 *
 * No rendering happens inside this component. Without the shared overlay,
 * same-line items from different kinds (e.g. halacha + aggadata +
 * rishonim) would stack directly on top of each other and only the
 * topmost would be clickable.
 */

import { createEffect, onMount, onCleanup, type JSX } from 'solid-js';
import { publishGutterEntry, clearGutterEntry, type GutterSide } from './gutterStack';
import { t } from './i18n';

export type GutterKind = 'argument' | 'halacha' | 'chart' | 'aggadata' | 'yerushalmi' | 'pesuk' | 'rishonim';

export interface GutterItem {
  kind: GutterKind;
  index: number;
  /** y position in pixels, relative to the daf-root container's top. */
  top: number;
  /** Set when the anchor sits in a full-width text zone (top start spacer
   *  or bottom end spacer) rather than the narrow middle column. Icons
   *  move out to the daf edge in that case so they don't overlap text. */
  atEdge: boolean;
}

/** Per-kind side. Right gutter is busier (halacha + aggadata + rishonim);
 *  left handles argument + pesuk. The overlay uses this to bucket items. */
export function gutterSideFor(kind: GutterKind): GutterSide {
  return kind === 'argument' || kind === 'pesuk' ? 'left' : 'right';
}

export interface GutterIconsProps {
  /** Accessor returning the daf-root container. Anchor y's are measured relative to it. */
  containerRef: () => HTMLElement | null;
  /** Reactive string that changes whenever the tokenized HTML changes (so we re-measure). */
  triggerKey: string;
  onClick: (kind: GutterKind, index: number) => void;
  /** Which icon type to measure. One instance per kind. */
  kind: GutterKind;
  /** Currently-active item key across all kinds, e.g. "argument:2". The
   *  overlay highlights matching icons. */
  activeKey?: string | null;
}

export function GutterIcons(props: GutterIconsProps): JSX.Element {
  const measure = () => {
    const root = props.containerRef();
    if (!root) { clearGutterEntry(props.kind); return; }
    const rootRect = root.getBoundingClientRect();
    const rootTop = rootRect.top;
    // When the daf is CSS-transformed (mobile fit-to-width) getBoundingClientRect
    // reports visually-scaled coordinates, but GutterOverlay applies the
    // published `top` as a layout value inside that same scaled frame — which
    // scales it again. Cancel the scale (visual width / layout width). On
    // desktop scale === 1, a no-op.
    const scale = root.offsetWidth > 0 ? rootRect.width / root.offsetWidth : 1;

    // Determining atEdge: on the anchor's visual line, does main text extend
    // past where the icon would normally sit? If yes (stairs / double-extend
    // regions where a side commentary ended and main widened into the
    // gutter), we must shove the icon all the way out to the daf margin so
    // it doesn't land on top of the text.
    const dafRoot = root.querySelector<HTMLElement>('.daf-root');
    const sidePct = dafRoot
      ? parseFloat(getComputedStyle(dafRoot).getPropertyValue('--daf-side-percent')) || 26
      : 26;
    const sideWidth = (sidePct / 100) * rootRect.width;
    const dafMain = root.querySelector<HTMLElement>('.daf-main .daf-text');
    const side = gutterSideFor(props.kind);
    // The icon's normal x in viewport coordinates — matches the column edge
    // GutterOverlay places clusters at.
    const iconViewportX = side === 'left'
      ? rootRect.left + sideWidth + 8
      : rootRect.right - sideWidth - 8;

    const wordRects: DOMRect[] = [];
    if (dafMain) {
      for (const w of dafMain.querySelectorAll<HTMLElement>('.daf-word')) {
        const r = w.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) wordRects.push(r);
      }
    }

    const TOL = 4;
    const lineExtentAtY = (y: number): { left: number; right: number } | null => {
      let left = Infinity;
      let right = -Infinity;
      for (const r of wordRects) {
        if (y >= r.top - TOL && y <= r.bottom + TOL) {
          if (r.left < left) left = r.left;
          if (r.right > right) right = r.right;
        }
      }
      if (left === Infinity) return null;
      return { left, right };
    };

    const klass = props.kind === 'argument' ? '.daf-argument-anchor'
      : props.kind === 'halacha' ? '.daf-halacha-anchor'
      : props.kind === 'chart' ? '.daf-chart-anchor'
      : props.kind === 'aggadata' ? '.daf-aggadata-anchor'
      : props.kind === 'yerushalmi' ? '.daf-yerushalmi-anchor'
      : props.kind === 'rishonim' ? '.daf-rishonim-anchor'
      : '.daf-pesuk-anchor';
    const SLACK = 2;
    const out: GutterItem[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(klass))) {
      const rect = el.getBoundingClientRect();
      const centerViewportY = rect.top + rect.height / 2;
      const extent = lineExtentAtY(centerViewportY);
      let atEdge = false;
      if (extent) {
        atEdge = side === 'left'
          ? extent.left < iconViewportX - SLACK
          : extent.right > iconViewportX + SLACK;
      }
      out.push({
        kind: props.kind,
        index: Number(el.getAttribute('data-idx') ?? -1),
        top: (rect.top - rootTop) / scale,
        atEdge,
      });
    }
    publishGutterEntry({
      kind: props.kind,
      side,
      items: out,
      activeKey: props.activeKey ?? null,
      onClick: props.onClick,
    });
  };

  // Re-measure whenever the tokenized text changes. Defer twice so layout /
  // daf-renderer height adjustment settles before we read positions.
  createEffect(() => {
    void props.triggerKey;
    void props.activeKey;
    queueMicrotask(() => queueMicrotask(measure));
  });

  onMount(() => {
    let rafId = 0;
    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; measure(); });
    };
    window.addEventListener('resize', schedule);
    const root = props.containerRef();
    let ro: ResizeObserver | null = null;
    if (root && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule);
      ro.observe(root);
    }
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(schedule).catch(() => {});
    }
    onCleanup(() => {
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      clearGutterEntry(props.kind);
    });
  });

  // Measurement-only — rendering happens in GutterOverlay.
  return null;
}

// Color + tooltip + glyph metadata per kind. Exported so GutterOverlay
// (and any future consumers) render consistently with what GutterIcons
// publishes to the shared store.
export function colorForKind(kind: GutterKind): string {
  return kind === 'argument' ? '#8a2a2b'
    : kind === 'halacha' ? '#1e40af'
    : kind === 'chart' ? '#0e7490'
    : kind === 'aggadata' ? '#7c3aed'
    : kind === 'yerushalmi' ? '#0f766e'
    : kind === 'rishonim' ? '#475569'
    : '#d97706';
}

export function titleForKind(kind: GutterKind): string {
  return kind === 'argument' ? t('gutter.argument')
    : kind === 'halacha' ? t('gutter.halacha')
    : kind === 'chart' ? t('gutter.chart')
    : kind === 'aggadata' ? t('gutter.aggadata')
    : kind === 'yerushalmi' ? t('gutter.yerushalmi')
    : kind === 'rishonim' ? t('gutter.rishonim')
    : t('gutter.pesukim');
}

/** SVG/glyph for an icon, sized to the 14×14 button. Stroke-based Lucide
 *  icons for argument/halacha/aggadata; Hebrew letters for pesuk and rishonim. */
export function GutterGlyph(props: { kind: GutterKind }): JSX.Element {
  return props.kind === 'argument' ? (
    <svg
      viewBox="0 0 24 24"
      width="9"
      height="9"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      <path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" />
    </svg>
  ) : props.kind === 'halacha' ? (
    <svg
      viewBox="0 0 24 24"
      width="9"
      height="9"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381" />
      <path d="m16 16 6-6" />
      <path d="m21.5 10.5-8-8" />
      <path d="m8 8 6-6" />
      <path d="m8.5 7.5 8 8" />
    </svg>
  ) : props.kind === 'aggadata' ? (
    <svg
      viewBox="0 0 24 24"
      width="9"
      height="9"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  ) : props.kind === 'yerushalmi' ? (
    <span
      aria-hidden="true"
      style={{
        'font-family': '"Mekorot Vilna", "SBL Hebrew", "Frank Ruehl", "Times New Roman", serif',
        'font-size': '11px',
        'font-weight': 700,
        'line-height': 1,
        color: '#fff',
      }}
    >
      י
    </span>
  ) : props.kind === 'chart' ? (
    <svg
      viewBox="0 0 24 24"
      width="9"
      height="9"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
    </svg>
  ) : props.kind === 'rishonim' ? (
    <span
      aria-hidden="true"
      style={{
        'font-family': '"Mekorot Vilna", "SBL Hebrew", "Frank Ruehl", "Times New Roman", serif',
        'font-size': '11px',
        'font-weight': 700,
        'line-height': 1,
        color: '#fff',
      }}
    >
      ר
    </span>
  ) : (
    <span
      aria-hidden="true"
      style={{
        'font-family': '"Mekorot Vilna", "SBL Hebrew", "Frank Ruehl", "Times New Roman", serif',
        'font-size': '11px',
        'font-weight': 700,
        'line-height': 1,
        color: '#fff',
      }}
    >
      פ
    </span>
  );
}
