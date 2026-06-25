// @vitest-environment jsdom
import { fireEvent, render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { ErrorBadge } from '../../src/client/ErrorBadge';

// The whole point: a failed card shows a compact badge (the short label) and
// keeps the full error OUT of the content flow until hover/focus.

describe('ErrorBadge', () => {
  it('shows only the short label by default; detail is not in the flow', () => {
    const { container, getByRole } = render(() => (
      <ErrorBadge tone="error" label="Couldn't load" detail="TypeError: boom at line 1" />
    ));
    expect(container.textContent).toContain("Couldn't load");
    expect(container.textContent).not.toContain('TypeError: boom');
    // No tooltip rendered yet; the detail lives on the button's title/aria.
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    const btn = getByRole('button');
    expect(btn.getAttribute('title')).toBe('TypeError: boom at line 1');
  });

  it('reveals the full detail in an overlay on hover and hides it on leave', () => {
    const { container, getByRole } = render(() => (
      <ErrorBadge tone="error" label="Couldn't load" detail="TypeError: boom at line 1" />
    ));
    const btn = getByRole('button');
    fireEvent.mouseEnter(btn);
    const tip = container.querySelector('[role="tooltip"]');
    expect(tip?.textContent).toBe('TypeError: boom at line 1');
    fireEvent.mouseLeave(btn);
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('reveals on keyboard focus too (accessible)', () => {
    const { container, getByRole } = render(() => (
      <ErrorBadge tone="error" label="Couldn't load" detail="schema mismatch" />
    ));
    fireEvent.focus(getByRole('button'));
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('schema mismatch');
  });

  it('does not render a redundant overlay when detail equals the label', () => {
    const { container, getByRole } = render(() => (
      <ErrorBadge tone="calm" label="Paused" detail="Paused" />
    ));
    fireEvent.mouseEnter(getByRole('button'));
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  });
});
