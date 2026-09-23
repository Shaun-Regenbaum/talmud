/**
 * Hover that does not flicker. Entering reports the new target at once;
 * leaving waits a moment, so sliding from one item to its neighbour reports
 * the neighbour instead of passing through "nothing". Shared by the argument
 * map and the reading map so both feel the same under the pointer.
 */

/** How long an item stays hovered after the pointer leaves it. */
export const HOVER_LEAVE_MS = 120;

// ── Scrolling under a still pointer is not hovering ──
// When a panel scrolls itself (revealInPanel), the browser reports whatever
// now sits under the unmoved pointer as hovered. After selecting a statement,
// that made the daf preview a different statement from the one selected.
// Pointer hovers are ignored from the scroll until the pointer really moves.
let heldAt: { x: number; y: number } | null = null;
let lastPointer: { x: number; y: number } | null = null;
let tracking = false;

function trackPointer(): void {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      if (heldAt && Math.hypot(e.clientX - heldAt.x, e.clientY - heldAt.y) > 2) heldAt = null;
      lastPointer = { x: e.clientX, y: e.clientY };
    },
    { capture: true, passive: true },
  );
}

/** Ignore pointer hovers until the pointer moves. Call before scrolling a panel
 *  that may slide new items under a resting pointer. */
export function holdHoverUntilPointerMoves(): void {
  trackPointer();
  if (lastPointer) heldAt = { ...lastPointer };
}

/** True while mouse hovers are being ignored after a panel scrolled. Touch has
 *  no hover and keyboard focus is never held. */
export function hoverHeld(): boolean {
  return heldAt !== null;
}

export interface HoverIntent<T> {
  enter: (value: T, key: string) => void;
  leave: () => void;
  /** Report "nothing hovered" if something still is. Deferred to a microtask:
   *  this runs while the map is being torn down, and a host that writes state
   *  in response must not do it in the middle of that teardown. */
  dispose: () => void;
}

export function createHoverIntent<T>(
  emit: (value: T | null) => void,
  delay = HOVER_LEAVE_MS,
): HoverIntent<T> {
  let current: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  trackPointer();
  return {
    enter(value, key) {
      clearTimeout(timer);
      if (current === key) return;
      current = key;
      emit(value);
    },
    leave() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (current === null) return;
        current = null;
        emit(null);
      }, delay);
    },
    dispose() {
      clearTimeout(timer);
      if (current !== null) {
        current = null;
        queueMicrotask(() => emit(null));
      }
    },
  };
}
