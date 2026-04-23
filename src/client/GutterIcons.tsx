import { createSignal, createEffect, For, onMount, onCleanup, type JSX } from 'solid-js';

export interface GutterItem {
  kind: 'argument' | 'halacha';
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
  onClick: (kind: 'argument' | 'halacha', index: number) => void;
  /** Which icon type to render. One type per overlay. */
  kind: 'argument' | 'halacha';
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

    // The argument column sits at the left gutter and halacha at the right
    // gutter. Only the icon's own side matters for deciding whether to jump
    // out to the edge: if main text has widened into the icon's normal x
    // at this y (stairs / double-extend regions where a side commentary
    // ended and main widened over the gutter), the icon overlaps text and
    // must move out.
    //
    // Probe at the icon's normal x (side-percent in from the edge). In the
    // narrow main region this lands on the `.daf-main .daf-inner-mid` /
    // `.daf-outer-mid` float spacer — a sibling of `.daf-text`, so the
    // "contains" check stays false. Once that spacer's height is consumed
    // and main text widens into that column, the same probe lands inside
    // `.daf-text`, flipping atEdge on.
    const dafRoot = root.querySelector<HTMLElement>('.daf-root');
    const sidePct = dafRoot
      ? parseFloat(getComputedStyle(dafRoot).getPropertyValue('--daf-side-percent')) || 26
      : 26;
    const sideWidth = (sidePct / 100) * rootRect.width;
    const dafMain = root.querySelector<HTMLElement>('.daf-main .daf-text');
    const side: 'left' | 'right' = props.kind === 'argument' ? 'left' : 'right';
    const probeX = side === 'left'
      ? rootRect.left + sideWidth + 8
      : rootRect.right - sideWidth - 8;
    const isMainAt = (viewportY: number): boolean => {
      if (!dafMain) return false;
      const stack: Element[] = typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(probeX, viewportY)
        : [document.elementFromPoint(probeX, viewportY)].filter(Boolean) as Element[];
      return stack.some((el) => dafMain.contains(el));
    };

    const klass = props.kind === 'argument' ? '.daf-argument-anchor' : '.daf-halacha-anchor';
    const out: GutterItem[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(klass))) {
      const rect = el.getBoundingClientRect();
      const centerViewportY = rect.top + rect.height / 2;
      out.push({
        kind: props.kind,
        index: Number(el.getAttribute('data-idx') ?? -1),
        top: rect.top - rootTop,
        atEdge: isMainAt(centerViewportY),
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
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => queueMicrotask(measure)).catch(() => {});
    }
    onCleanup(() => window.removeEventListener('resize', onResize));
  });

  const isArg = () => props.kind === 'argument';
  const borderColor = () => isArg() ? '#8a2a2b' : '#1e40af';
  const title = () => isArg() ? 'Argument structure & rabbis' : 'Practical halacha';

  // Lucide icons: messages-square (two overlapping speech bubbles — dialog /
  // argument) and gavel (judicial ruling — halacha). Stroke-based for the
  // Lucide house style; stroke-width bumped to 3 so they read clearly at
  // the 9×9 px rendered size.
  const Icon = () =>
    isArg() ? (
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
    ) : (
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
