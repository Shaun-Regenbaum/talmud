/**
 * Show the reader where to look in a side panel: scroll the target to the
 * vertical middle of whatever panel holds it (the Talmud aside, the Tanach
 * drawer, the phone bottom sheet), then pulse it once, softly.
 *
 * Styles live in components.css (`.ui-reveal-pulse`, `.ui-reveal-tint`).
 */

const PULSE_MS = 1200;
/** How long a reveal keeps the target centered while its text is still
 *  loading and growing. The reader's own scroll ends it sooner. */
const FOLLOW_MS = 2000;
const USER_SCROLL = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** The nearest ancestor set to scroll vertically (a side panel, a drawer, a
 *  bottom sheet), or null when the target sits in the page itself. A panel
 *  that does not overflow yet still counts, so a short panel never falls
 *  through to scrolling the whole page. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The scrollTop that centers `target` inside `container`. A target taller than
 *  the container aligns its top instead, so its opening lines stay in view. */
export function centeredScrollTop(
  container: { top: number; height: number; scrollTop: number; scrollHeight: number },
  target: { top: number; height: number },
): number {
  const offset = target.top - container.top + container.scrollTop;
  const wanted =
    target.height >= container.height - 24
      ? offset - 12
      : offset - (container.height - target.height) / 2;
  const max = Math.max(0, container.scrollHeight - container.height);
  return Math.round(Math.min(max, Math.max(0, wanted)));
}

export interface RevealOptions {
  /** Scroll the target to the middle of its panel. Default true; false only
   *  pulses it where it is. */
  scroll?: boolean;
  /** Pulse after scrolling. Default true. */
  pulse?: boolean;
  /** Override the reader's motion preference (tests). */
  reducedMotion?: boolean;
}

function scrollToMiddle(target: HTMLElement, behavior: ScrollBehavior): void {
  const container = scrollParent(target);
  if (!container) {
    target.scrollIntoView?.({ block: 'center', behavior });
    return;
  }
  const box = container.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const top = centeredScrollTop(
    {
      top: box.top,
      height: container.clientHeight,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
    },
    { top: rect.top, height: rect.height },
  );
  if (typeof container.scrollTo === 'function') container.scrollTo({ top, behavior });
  else container.scrollTop = top;
}

/** Panel text often arrives after the reveal (a summary still loading), and
 *  the panel may relayout (a map expanding a section above the target). Keep
 *  the target centered meanwhile, until the reader scrolls or time is up. */
function followGrowth(target: HTMLElement, behavior: ScrollBehavior): void {
  const container = scrollParent(target);
  if (!container || typeof ResizeObserver === 'undefined') return;
  let done = false;
  const observer = new ResizeObserver(() => {
    if (!done) scrollToMiddle(target, behavior);
  });
  const stop = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    clearTimeout(timer);
    for (const type of USER_SCROLL) container.removeEventListener(type, stop);
  };
  const timer = setTimeout(stop, FOLLOW_MS);
  for (const type of USER_SCROLL) container.addEventListener(type, stop, { passive: true });
  // The target grows as its text loads; content above it (a map expanding a
  // section) pushes it down. Watch both.
  observer.observe(target);
  for (const child of Array.from(container.children)) observer.observe(child);
}

export function revealInPanel(target: HTMLElement, options: RevealOptions = {}): void {
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth';
  if (options.scroll !== false) {
    scrollToMiddle(target, behavior);
    followGrowth(target, behavior);
  }
  if (options.pulse === false) return;
  // Motion-sensitive readers get a brief still tint instead of a pulse.
  const cls = reduced ? 'ui-reveal-tint' : 'ui-reveal-pulse';
  const previous = timers.get(target);
  if (previous) clearTimeout(previous);
  target.classList.remove('ui-reveal-pulse', 'ui-reveal-tint');
  // Restart the animation when the same target is revealed twice in a row.
  void target.offsetWidth;
  target.classList.add(cls);
  timers.set(
    target,
    setTimeout(() => {
      target.classList.remove(cls);
      timers.delete(target);
    }, PULSE_MS),
  );
}
