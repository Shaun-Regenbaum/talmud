// @vitest-environment jsdom
import {
  clusterByLine,
  MarginPod,
  type MarginPodItem,
  POD_CLOSE_GRACE_MS,
  POD_OPEN_DELAY_MS,
} from '@corpus/ui/MarginPod';
import { cleanup, render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const items: MarginPodItem[] = [
  { id: 'argument:0', kind: 'argument', label: 'Argument' },
  { id: 'halacha:0', kind: 'halacha', label: 'Halacha' },
  { id: 'rishonim:0', kind: 'rishonim', label: 'Rishonim' },
];

/** jsdom has no PointerEvent: a plain event carrying the fields the pod reads. */
function pointer(
  target: EventTarget,
  type: string,
  pointerType: 'mouse' | 'touch',
  at: { x?: number; y?: number } = {},
): void {
  const bubbles = type !== 'pointerenter' && type !== 'pointerleave';
  const e = new Event(type, { bubbles, cancelable: true });
  Object.defineProperties(e, {
    pointerType: { value: pointerType },
    clientX: { value: at.x ?? 0 },
    clientY: { value: at.y ?? 0 },
  });
  target.dispatchEvent(e);
}

/** A tap: pointerdown and pointerup on the document (where the pod listens),
 *  then the click on the element. */
function tap(el: HTMLElement, at: { x?: number; y?: number } = {}): void {
  pointer(el, 'pointerdown', 'touch', at);
  pointer(el, 'pointerup', 'touch', at);
  el.click();
}

function mount(overrides: Partial<Parameters<typeof MarginPod>[0]> = {}) {
  const onActivate = vi.fn();
  const onPreview = vi.fn();
  const r = render(() => (
    <MarginPod
      items={items}
      textSide="left"
      x={100}
      y={200}
      onActivate={onActivate}
      onPreview={onPreview}
      {...overrides}
    />
  ));
  const pod = r.container.querySelector<HTMLElement>('.margin-pod') as HTMLElement;
  const icons = Array.from(pod.querySelectorAll<HTMLButtonElement>('.margin-pod-icon'));
  return { ...r, pod, icons, onActivate, onPreview };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('clusterByLine', () => {
  it('groups items on one line and keeps their order', () => {
    const lines = clusterByLine([
      { id: 'a', y: 100 },
      { id: 'b', y: 104 },
      { id: 'c', y: 150 },
    ]);
    expect(lines.map((l) => l.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
  });

  it('measures from the first item on a line, so close lines never chain together', () => {
    const lines = clusterByLine([
      { id: 'a', y: 0 },
      { id: 'b', y: 8 },
      { id: 'c', y: 16 },
    ]);
    expect(lines.map((l) => l.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
  });
});

describe('MarginPod', () => {
  it('opens a single icon straight away, for a click or a tap', () => {
    const one = mount({ items: [items[0]] });
    one.icons[0].click();
    expect(one.onActivate).toHaveBeenCalledWith(items[0]);
    tap(one.icons[0]);
    expect(one.onActivate).toHaveBeenCalledTimes(2);
    expect(one.pod.classList.contains('is-open')).toBe(false);
  });

  it('opens under the mouse after a moment and forgives a brief slip', () => {
    const { pod } = mount();
    pointer(pod, 'pointerenter', 'mouse');
    expect(pod.classList.contains('is-open')).toBe(false);
    vi.advanceTimersByTime(POD_OPEN_DELAY_MS);
    expect(pod.classList.contains('is-open')).toBe(true);

    pointer(pod, 'pointerleave', 'mouse');
    vi.advanceTimersByTime(POD_CLOSE_GRACE_MS - 50);
    pointer(pod, 'pointerenter', 'mouse');
    vi.advanceTimersByTime(POD_CLOSE_GRACE_MS);
    expect(pod.classList.contains('is-open')).toBe(true);

    pointer(pod, 'pointerleave', 'mouse');
    vi.advanceTimersByTime(POD_CLOSE_GRACE_MS);
    expect(pod.classList.contains('is-open')).toBe(false);
  });

  it('reports the icon under the mouse and clears it on close', () => {
    const { pod, icons, onPreview } = mount();
    pointer(pod, 'pointerenter', 'mouse');
    vi.advanceTimersByTime(POD_OPEN_DELAY_MS);
    pointer(icons[1], 'pointerover', 'mouse');
    expect(onPreview).toHaveBeenLastCalledWith(items[1]);
    pointer(pod, 'pointerleave', 'mouse');
    vi.advanceTimersByTime(POD_CLOSE_GRACE_MS);
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it('on touch, opens on the first tap and opens a note on the second', () => {
    const { pod, icons, onActivate } = mount();
    tap(icons[2]);
    expect(pod.classList.contains('is-open')).toBe(true);
    expect(pod.classList.contains('is-touch')).toBe(true);
    expect(onActivate).not.toHaveBeenCalled();
    tap(icons[1]);
    expect(onActivate).toHaveBeenCalledWith(items[1]);
  });

  it('closes on touch only for a tap well away from the pod', () => {
    const { pod, icons } = mount();
    tap(icons[0]);
    // jsdom lays everything out at 0,0: a tap 20px off lands inside the edge.
    pointer(document.body, 'pointerdown', 'touch', { x: 20, y: 20 });
    pointer(document.body, 'pointerup', 'touch', { x: 20, y: 20 });
    expect(pod.classList.contains('is-open')).toBe(true);
    // A drag is a scroll, and scrolling never closes it.
    pointer(document.body, 'pointerdown', 'touch', { x: 400, y: 400 });
    pointer(document.body, 'pointerup', 'touch', { x: 400, y: 480 });
    expect(pod.classList.contains('is-open')).toBe(true);
    pointer(document.body, 'pointerdown', 'touch', { x: 400, y: 400 });
    pointer(document.body, 'pointerup', 'touch', { x: 400, y: 400 });
    expect(pod.classList.contains('is-open')).toBe(false);
  });

  it('keeps one pod open on the page and fades the others', () => {
    const first = mount();
    const second = mount({ items: items.map((i) => ({ ...i, id: `${i.id}b` })) });
    tap(first.icons[0]);
    expect(first.pod.classList.contains('is-open')).toBe(true);
    expect(second.pod.classList.contains('is-dim')).toBe(true);
    tap(second.icons[0]);
    expect(second.pod.classList.contains('is-open')).toBe(true);
    expect(first.pod.classList.contains('is-open')).toBe(false);
  });

  it('opens for the keyboard and closes on Escape', () => {
    const { pod, icons, onPreview } = mount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    icons[0].focus();
    expect(pod.classList.contains('is-open')).toBe(true);
    expect(onPreview).toHaveBeenLastCalledWith(items[0]);
    icons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(icons[1]);
    icons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(pod.classList.contains('is-open')).toBe(false);
  });

  it('rings the icon whose note is open', () => {
    const { icons } = mount({ activeId: 'halacha:0' });
    expect(icons.map((b) => b.classList.contains('is-active'))).toEqual([false, true, false]);
  });
});
