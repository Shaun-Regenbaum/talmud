// @vitest-environment jsdom
import { createHoverIntent } from '@corpus/ui/hoverIntent';
import { centeredScrollTop, revealInPanel, scrollParent } from '@corpus/ui/reveal';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function panelWith(target: HTMLElement): HTMLElement {
  const panel = document.createElement('div');
  panel.style.overflowY = 'auto';
  const inner = document.createElement('section');
  inner.appendChild(target);
  panel.appendChild(inner);
  document.body.appendChild(panel);
  return panel;
}

describe('reveal in a side panel', () => {
  it('centers the target in its panel', () => {
    // Panel 400 px tall scrolled to 100; target 60 px tall, 500 px below the panel top.
    expect(
      centeredScrollTop(
        { top: 0, height: 400, scrollTop: 100, scrollHeight: 2000 },
        { top: 500, height: 60 },
      ),
    ).toBe(100 + 500 - 170);
  });

  it('aligns a target taller than the panel to its top, and never scrolls past either end', () => {
    expect(
      centeredScrollTop(
        { top: 0, height: 400, scrollTop: 0, scrollHeight: 2000 },
        { top: 300, height: 900 },
      ),
    ).toBe(288);
    expect(
      centeredScrollTop(
        { top: 0, height: 400, scrollTop: 0, scrollHeight: 2000 },
        { top: 20, height: 40 },
      ),
    ).toBe(0);
    expect(
      centeredScrollTop(
        { top: 0, height: 400, scrollTop: 1500, scrollHeight: 2000 },
        { top: 380, height: 40 },
      ),
    ).toBe(1600);
  });

  it('finds the panel even when it does not overflow yet', () => {
    const target = document.createElement('p');
    const panel = panelWith(target);
    expect(scrollParent(target)).toBe(panel);
  });

  it('scrolls smoothly and pulses once', () => {
    vi.useFakeTimers();
    const target = document.createElement('p');
    const panel = panelWith(target);
    panel.scrollTo = vi.fn() as typeof panel.scrollTo;
    revealInPanel(target, { reducedMotion: false });
    expect(panel.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    expect(target.classList.contains('ui-reveal-pulse')).toBe(true);
    vi.advanceTimersByTime(1300);
    expect(target.classList.contains('ui-reveal-pulse')).toBe(false);
  });

  it('gives motion-sensitive readers a jump and a still tint, not a pulse', () => {
    vi.useFakeTimers();
    const target = document.createElement('p');
    const panel = panelWith(target);
    panel.scrollTo = vi.fn() as typeof panel.scrollTo;
    revealInPanel(target, { reducedMotion: true });
    expect(panel.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    expect(target.classList.contains('ui-reveal-pulse')).toBe(false);
    expect(target.classList.contains('ui-reveal-tint')).toBe(true);
    vi.advanceTimersByTime(1300);
    expect(target.classList.contains('ui-reveal-tint')).toBe(false);
  });

  it('can pulse without moving the panel', () => {
    const target = document.createElement('p');
    const panel = panelWith(target);
    panel.scrollTo = vi.fn() as typeof panel.scrollTo;
    revealInPanel(target, { scroll: false, reducedMotion: false });
    expect(panel.scrollTo).not.toHaveBeenCalled();
    expect(target.classList.contains('ui-reveal-pulse')).toBe(true);
  });
});

describe('hover that does not flicker', () => {
  it('reports a neighbour directly and clears only after the pointer has left', () => {
    vi.useFakeTimers();
    const seen: (string | null)[] = [];
    const hover = createHoverIntent<string>((v) => seen.push(v));
    hover.enter('a', 'a');
    hover.leave();
    vi.advanceTimersByTime(50);
    hover.enter('b', 'b');
    hover.enter('b', 'b');
    hover.leave();
    vi.advanceTimersByTime(200);
    expect(seen).toEqual(['a', 'b', null]);
  });

  it('clears on dispose only when something is still hovered, after the teardown', async () => {
    const seen: (string | null)[] = [];
    const hover = createHoverIntent<string>((v) => seen.push(v));
    hover.dispose();
    hover.enter('a', 'a');
    hover.dispose();
    expect(seen).toEqual(['a']);
    await Promise.resolve();
    expect(seen).toEqual(['a', null]);
  });
});
