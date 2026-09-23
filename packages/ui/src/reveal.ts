/**
 * Show the reader where to look in a side panel: scroll the target to the
 * vertical middle of whatever panel holds it (the Talmud aside, the Tanach
 * drawer, the phone bottom sheet), then pulse it once, softly.
 *
 * Styles live in components.css (`.ui-reveal-pulse`, `.ui-reveal-tint`).
 */

const PULSE_MS = 1200;
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

export function revealInPanel(target: HTMLElement, options: RevealOptions = {}): void {
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth';
  if (options.scroll !== false) scrollToMiddle(target, behavior);
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
