import { createSignal, createEffect, For, onMount, onCleanup, type JSX } from 'solid-js';

export type GutterKind = 'argument' | 'halacha' | 'aggadata' | 'pesuk';

export interface GutterItem {
  kind: GutterKind;
  index: number;
  top: number;
  /** Set when the anchor sits in a full-width text zone (top start spacer
   *  or bottom end spacer) rather than the narrow middle column. Icons
   *  move out to the daf edge in that case so they don't overlap text. */
  atEdge: boolean;
}

export interface GutterIconsProps {
  /** Accessor returning the daf-root container. Anchor y's are measured relative to it. */
  containerRef: () => HTMLElement | null;
  /** Reactive string that changes whenever the tokenized HTML changes (so we re-measure). */
  triggerKey: string;
  onClick: (kind: GutterKind, index: number) => void;
  /** Which icon type to render. One type per overlay. */
  kind: GutterKind;
  /** X position in the narrow middle-column gutter (CSS value). */
  x: string;
  /** X position at the outer edge of the daf, for anchors that fall inside
   *  the full-width start/end regions. CSS value. */
  edgeX: string;
  /** Currently-active icon (highlights its icon). */
  activeKey?: string | null; // e.g. "argument:2" / "halacha:0"
}

export function GutterIcons(props: GutterIconsProps): JSX.Element {
  const [items, setItems] = createSignal<GutterItem[]>([]);

  const measure = () => {
    const root = props.containerRef();
    if (!root) { setItems([]); return; }
    const rootRect = root.getBoundingClientRect();
    const rootTop = rootRect.top;

    // Determining atEdge: on the anchor's visual line, does main text extend
    // past where the icon would normally sit? If yes (stairs / double-extend
    // regions where a side commentary ended and main widened into the
    // gutter), we must shove the icon all the way out to the daf margin so
    // it doesn't land on top of the text.
    //
    // The old implementation tried to probe this with elementsFromPoint at
    // the icon's x, but .daf-root / .daf-text inherit pointer-events:none
    // (only .daf-word spans re-enable hit testing), and the probe x sits
    // right at the narrow text's inner edge — so whether the probe "hit
    // main" depended on whether that exact x landed on a word or a
    // justification gap. Flaky per-line, and biased false in widened rows
    // (big inter-word gaps near the far edge).
    //
    // Replaced with a direct measurement: snapshot every .daf-word rect
    // in the main column, and for each anchor find rects on the same
    // visual line. If the line's text extent crosses the icon's normal x,
    // atEdge flips on. This is robust to inter-word whitespace and works
    // identically in stairs vs double-extend.
    const dafRoot = root.querySelector<HTMLElement>('.daf-root');
    const sidePct = dafRoot
      ? parseFloat(getComputedStyle(dafRoot).getPropertyValue('--daf-side-percent')) || 26
      : 26;
    const sideWidth = (sidePct / 100) * rootRect.width;
    const dafMain = root.querySelector<HTMLElement>('.daf-main .daf-text');
    const side: 'left' | 'right' =
      props.kind === 'halacha' || props.kind === 'aggadata' ? 'right' : 'left';
    // The icon's normal x in viewport coordinates. Matches ARG_X / HALACHA_X
    // in DafViewer.tsx (calc(sidePct% +/- 8px)).
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

    // A word is "on this line" when the anchor's y lies vertically inside
    // its rect (plus a small tolerance for inline-block anchors whose
    // baseline alignment nudges their rect slightly). Half a line-height
    // is plenty; 4px keeps us from slurping in adjacent lines when a line
    // wraps tightly against another.
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
      : props.kind === 'aggadata' ? '.daf-aggadata-anchor'
      : '.daf-pesuk-anchor';
    // 2px inward slack so the line's outermost word just grazing the icon
    // position doesn't flip the state.
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
        top: rect.top - rootTop,
        atEdge,
      });
    }
    setItems(out);
  };

  // Re-measure whenever the tokenized text changes. Defer twice so layout /
  // daf-renderer height adjustment settles before we read positions.
  createEffect(() => {
    void props.triggerKey;
    queueMicrotask(() => queueMicrotask(measure));
  });

  onMount(() => {
    // Re-measure on any layout shift that can move anchor positions:
    //   • window resize (responsive width changes)
    //   • daf reflow (late font load, analysis/halacha injection adding
    //     anchors, narrow→wide transitions when layout-case reclassifies)
    //   • document.fonts.ready (first-paint, before Mekorot fonts landed)
    //
    // Without a ResizeObserver, icons measured while the daf was still
    // collapsing to its final height would stick with stale `atEdge`
    // decisions — and the widened bottom is exactly where `atEdge` needs
    // to flip on. rAF-coalesce so a cascade of mutations only triggers
    // one re-measure per frame.
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
    });
  });

  const borderColor = () =>
    props.kind === 'argument' ? '#8a2a2b'
      : props.kind === 'halacha' ? '#1e40af'
      : props.kind === 'aggadata' ? '#7c3aed'
      : '#d97706';
  const title = () =>
    props.kind === 'argument' ? 'Argument structure & rabbis'
      : props.kind === 'halacha' ? 'Practical halacha'
      : props.kind === 'aggadata' ? 'Aggada — narrative on this line'
      : 'Pasuk — Tanach citation';

  // Lucide icons: messages-square (argument dialog), gavel (halacha ruling),
  // book-open (aggada narrative). Stroke-based Lucide house style; stroke-
  // width 3 so they read at the 9×9 px rendered size.
  const Icon = () =>
    props.kind === 'argument' ? (
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
    ) : (
      // Hebrew letter פ (Pe — first letter of "pasuk") rendered as a glyph
      // inside the orange circle. The Mekorot Vilna fallback chain matches
      // the daf's Hebrew typography so the letter reads as a citation badge.
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

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        'pointer-events': 'none',
      }}
    >
      <For each={items()}>
        {(it) => {
          const key = `${it.kind}:${it.index}`;
          const active = () => props.activeKey === key;
          return (
            <button
              onClick={() => props.onClick(it.kind, it.index)}
              title={title()}
              style={{
                position: 'absolute',
                top: `${it.top}px`,
                left: it.atEdge ? props.edgeX : props.x,
                transform: 'translate(-50%, -50%)',
                width: '14px',
                height: '14px',
                'border-radius': '50%',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                border: 'none',
                background: borderColor(),
                color: '#fff',
                cursor: 'pointer',
                'box-shadow': active() ? `0 0 0 2px ${borderColor()}60` : 'none',
                padding: 0,
                'line-height': 0,
                'pointer-events': 'auto',
              }}
            >
              <Icon />
            </button>
          );
        }}
      </For>
    </div>
  );
}
