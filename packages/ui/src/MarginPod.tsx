/**
 * The margin icons beside the text, shared by both readers.
 *
 * Icons whose words sit on the same line form one pod. At rest the icons
 * overlap so a sliver of each shows. Opening spreads them into a small rounded
 * pod centered on the line, with a short tick pointing at the text:
 *
 * - Mouse: opens as the pointer arrives. The pod and a margin around it count
 *   as inside, and it closes a moment after the pointer really leaves, so a
 *   small slip does not close it.
 * - Touch: the first tap opens the pod with finger-sized icons; a tap on an
 *   icon opens that note; only a tap well away from the pod closes it.
 * - Keyboard: tabbing onto an icon opens its pod; arrows move; Esc closes.
 *
 * A pod with one icon never opens: a click or tap opens its note directly.
 * Only one pod is open on the page at a time, and the others fade back.
 */

import {
  createMemo,
  createSignal,
  createUniqueId,
  Index,
  type JSX,
  onCleanup,
  onMount,
} from 'solid-js';
import { colorForKind, GLYPH_SCALE, ReaderIcon, type ReaderIconKind } from './ReaderIcon';
import './marginpod.css';

export interface MarginPodItem {
  /** Unique on the page, e.g. "argument:2" or "8:gemara". */
  id: string;
  kind: ReaderIconKind;
  /** Tooltip and accessible name. */
  label: string;
}

export interface MarginPodProps {
  items: readonly MarginPodItem[];
  /** The side of the pod the text is on. The tick points that way. */
  textSide: 'left' | 'right';
  /** Center of the resting icon in the positioned parent: px, or any CSS length. */
  x: number | string;
  y: number;
  /** The item whose note is open; drawn with a ring. */
  activeId?: string | null;
  onActivate: (item: MarginPodItem) => void;
  /** The item under the pointer or keyboard focus, or null when there is none.
   *  Readers use it to highlight the item's words. */
  onPreview?: (item: MarginPodItem | null) => void;
  /** Optional data-tour marker for the guided tour. */
  tour?: string;
}

/** Waiting this long before opening lets the pointer pass over a pod. */
export const POD_OPEN_DELAY_MS = 50;
/** How long a pod stays open after the pointer leaves its forgiving edge. */
export const POD_CLOSE_GRACE_MS = 260;
/** A tap closes an open pod only when it lands this far outside its edge. */
export const POD_FAR_TAP_PX = 28;
/** Resting icon size, and the open sizes for a mouse and for a finger. */
export const POD_REST_SIZE = 14;
export const POD_OPEN_SIZE = 18;
export const POD_TOUCH_SIZE = 28;
/** How much of each resting icon shows above the one in front of it. */
const SLIVER = 3;
const BG_PAD = 6;
const GAP = { mouse: 6, touch: 10 } as const;
/** The forgiving edge around an open pod. */
const EDGE = { mouse: 14, touch: 22 } as const;

type Mode = 'mouse' | 'touch' | 'keys';

/** Group items whose centers are within `tolerance` px of the first item on
 *  their line. Input order is kept within a line. */
export function clusterByLine<T extends { y: number }>(items: readonly T[], tolerance = 10): T[][] {
  const sorted = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.y - b.item.y || a.i - b.i)
    .map((e) => e.item);
  const lines: T[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && item.y - line[0].y <= tolerance) line.push(item);
    else lines.push([item]);
  }
  return lines;
}

// ── Page-wide state: one open pod, and the input that caused the last event ──
const [openPod, setOpenPod] = createSignal<string | null>(null);
let lastInput: 'mouse' | 'touch' | 'keys' = 'mouse';
let tapStart: { x: number; y: number } | null = null;
const pods = new Map<
  string,
  { root: () => HTMLElement | undefined; hit: () => HTMLElement | undefined; close: () => void }
>();
let listening = false;

function listen(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastInput = e.pointerType === 'mouse' || !e.pointerType ? 'mouse' : 'touch';
      const id = openPod();
      const pod = id ? pods.get(id) : undefined;
      if (!pod) return;
      if (lastInput === 'mouse') {
        if (!pod.root()?.contains(e.target as Node)) pod.close();
      } else tapStart = { x: e.clientX, y: e.clientY };
    },
    true,
  );
  document.addEventListener(
    'pointerup',
    (e) => {
      const start = tapStart;
      tapStart = null;
      const id = openPod();
      const pod = id ? pods.get(id) : undefined;
      if (!pod || !start || e.pointerType === 'mouse') return;
      // A drag is a scroll, not a tap: scrolling never closes the pod.
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;
      const box = pod.hit()?.getBoundingClientRect();
      if (!box) return;
      const far =
        e.clientX < box.left - POD_FAR_TAP_PX ||
        e.clientX > box.right + POD_FAR_TAP_PX ||
        e.clientY < box.top - POD_FAR_TAP_PX ||
        e.clientY > box.bottom + POD_FAR_TAP_PX;
      if (far) pod.close();
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow')) lastInput = 'keys';
    },
    true,
  );
}

export function MarginPod(props: MarginPodProps): JSX.Element {
  const id = createUniqueId();
  const [mode, setMode] = createSignal<Mode>('mouse');
  let root: HTMLDivElement | undefined;
  let hit: HTMLDivElement | undefined;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  const count = () => props.items.length;
  const isOpen = () => openPod() === id && count() > 1;
  const dim = () => openPod() !== null && openPod() !== id;

  const open = (m: Mode) => {
    if (count() < 2) return;
    clearTimeout(closeTimer);
    setMode(m);
    setOpenPod(id);
  };
  const close = () => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (openPod() === id) setOpenPod(null);
    props.onPreview?.(null);
  };

  onMount(() => {
    listen();
    pods.set(id, { root: () => root, hit: () => hit, close });
  });
  onCleanup(() => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    pods.delete(id);
    if (openPod() === id) setOpenPod(null);
  });

  const layout = createMemo(() => {
    const n = count();
    const spread = isOpen();
    const touch = mode() === 'touch';
    const size = spread ? (touch ? POD_TOUCH_SIZE : POD_OPEN_SIZE) : POD_REST_SIZE;
    const gap = touch ? GAP.touch : GAP.mouse;
    let ys: number[];
    let podH = 0;
    if (spread) {
      const h = n * size + (n - 1) * gap;
      podH = h + BG_PAD * 2;
      ys = props.items.map((_, i) => -h / 2 + size / 2 + i * (size + gap));
    } else {
      ys = props.items.map((_, i) => i * SLIVER - ((n - 1) * SLIVER) / 2);
    }
    // Keep an open pod below the top of its reader.
    const shift = spread ? Math.max(0, podH / 2 - props.y + 2) : 0;
    ys = ys.map((y) => y + shift);
    const podW = size + BG_PAD * 2;
    const edge = touch ? EDGE.touch : EDGE.mouse;
    const restTop = ys[0] - size / 2;
    const restBottom = ys[ys.length - 1] + size / 2;
    const hitBox = spread
      ? {
          left: -podW / 2 - edge,
          top: shift - podH / 2 - edge,
          width: podW + edge * 2,
          height: podH + edge * 2,
        }
      : {
          left: -size / 2 - 3,
          top: restTop - 3,
          width: size + 6,
          height: restBottom - restTop + 6,
        };
    return { size, ys, podW, podH, shift, hitBox, spread };
  });

  const itemAt = (target: EventTarget | null): MarginPodItem | undefined => {
    const button = (target as Element | null)?.closest?.('.margin-pod-icon');
    const i = Number(button?.getAttribute('data-index'));
    return Number.isInteger(i) ? props.items[i] : undefined;
  };
  const icons = () =>
    Array.from(root?.querySelectorAll<HTMLButtonElement>('.margin-pod-icon') ?? []);

  const px = (v: number) => `${v}px`;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the pod listens for its own buttons (hover to spread, focus to open, arrows to move); every action is one of those buttons
    <div
      ref={root}
      class="margin-pod"
      classList={{ 'is-open': layout().spread, 'is-touch': mode() === 'touch', 'is-dim': dim() }}
      data-count={count()}
      data-text-side={props.textSide}
      data-tour={props.tour}
      style={{ left: typeof props.x === 'number' ? px(props.x) : props.x, top: px(props.y) }}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(closeTimer);
        if (!isOpen() && count() > 1) {
          clearTimeout(openTimer);
          openTimer = setTimeout(() => open('mouse'), POD_OPEN_DELAY_MS);
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
        closeTimer = setTimeout(close, count() > 1 ? POD_CLOSE_GRACE_MS : 0);
      }}
      onPointerOver={(e) => {
        if (e.pointerType !== 'mouse') return;
        const item = itemAt(e.target);
        if (item && (isOpen() || count() === 1)) props.onPreview?.(item);
      }}
      onClick={(e) => {
        const item = itemAt(e.target);
        const touch = lastInput === 'touch';
        if (count() === 1) {
          if (item) props.onActivate(item);
          return;
        }
        if (!isOpen()) {
          if (touch) {
            // The first tap only opens the pod; the icons are too close to aim at.
            e.preventDefault();
            open('touch');
          } else if (item) props.onActivate(item);
          return;
        }
        if (item) props.onActivate(item);
      }}
      onFocusIn={(e) => {
        const item = itemAt(e.target);
        if (lastInput !== 'keys') return;
        if (!isOpen()) open('keys');
        if (item) props.onPreview?.(item);
      }}
      onFocusOut={(e) => {
        if (root?.contains(e.relatedTarget as Node | null)) return;
        if (lastInput === 'keys') close();
      }}
      onKeyDown={(e) => {
        const list = icons();
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape' && isOpen()) {
          e.stopPropagation();
          close();
        } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && at >= 0 && list.length > 1) {
          e.preventDefault();
          const next = list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
          next.focus();
        }
      }}
    >
      <div
        ref={hit}
        class="margin-pod-hit"
        style={{
          left: px(layout().hitBox.left),
          top: px(layout().hitBox.top),
          width: px(layout().hitBox.width),
          height: px(layout().hitBox.height),
        }}
      />
      <div
        class="margin-pod-bg"
        style={{
          left: px(-layout().podW / 2),
          top: px(layout().shift - layout().podH / 2),
          width: px(layout().podW),
          height: px(layout().podH),
        }}
      />
      <span
        class="margin-pod-tick"
        style={{
          left: px(props.textSide === 'left' ? -layout().podW / 2 - 8 : layout().podW / 2),
        }}
      />
      <Index each={props.items}>
        {(item, i) => (
          <button
            type="button"
            class="margin-pod-icon"
            classList={{ 'is-active': props.activeId === item().id }}
            data-index={i}
            data-kind={item().kind}
            aria-label={item().label}
            title={item().label}
            style={{
              '--pod-y': px(layout().ys[i] ?? 0),
              '--pod-size': px(layout().size),
              '--pod-ink': colorForKind(item().kind),
              'z-index': 10 + i,
            }}
          >
            <ReaderIcon kind={item().kind} size={Math.round(layout().size * GLYPH_SCALE)} />
          </button>
        )}
      </Index>
    </div>
  );
}
