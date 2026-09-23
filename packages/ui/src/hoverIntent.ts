/**
 * Hover that does not flicker. Entering reports the new target at once;
 * leaving waits a moment, so sliding from one item to its neighbour reports
 * the neighbour instead of passing through "nothing". Shared by the argument
 * map and the reading map so both feel the same under the pointer.
 */

/** How long an item stays hovered after the pointer leaves it. */
export const HOVER_LEAVE_MS = 120;

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
