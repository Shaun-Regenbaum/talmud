import { Button } from '@corpus/ui/Button';
import { Drawer } from '@corpus/ui/Drawer';
import { InlineHint } from '@corpus/ui/InlineHint';
import { LangToggle } from '@corpus/ui/LangToggle';
import { PageNavigation } from '@corpus/ui/PageNavigation';
import { ToolbarMenu } from '@corpus/ui/ToolbarMenu';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createSignal, Show } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

describe('shared reader controls', () => {
  it('updates pressed state and forwards native button events', () => {
    const [selected, setSelected] = createSignal(false);
    const view = render(() => (
      <Button active={selected()} onClick={() => setSelected((value) => !value)}>
        Inspect
      </Button>
    ));
    const button = view.getByRole('button', { name: 'Inspect' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps language selection reactive and gives both buttons a pressed state', () => {
    const [lang, setLang] = createSignal<'en' | 'he'>('en');
    const view = render(() => <LangToggle lang={lang()} onChange={setLang} />);
    fireEvent.click(view.getByRole('button', { name: 'עב' }));
    expect(lang()).toBe('he');
    expect(view.getByRole('button', { name: 'עב' }).getAttribute('aria-pressed')).toBe('true');
    expect(view.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('disables unavailable navigation without disabling the other direction', () => {
    const [chapter, setChapter] = createSignal(1);
    const view = render(() => (
      <PageNavigation
        label="Chapter navigation"
        previousLabel="Previous chapter"
        nextLabel="Next chapter"
        previousDisabled={chapter() === 1}
        onPrevious={() => setChapter((n) => n - 1)}
        onNext={() => setChapter((n) => n + 1)}
      >
        <span>{chapter()}</span>
      </PageNavigation>
    ));
    expect(
      (view.getByRole('button', { name: 'Previous chapter' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Next chapter' }));
    expect(chapter()).toBe(2);
    expect(
      (view.getByRole('button', { name: 'Previous chapter' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('closes the secondary links with Escape and returns focus to its trigger', () => {
    const view = render(() => (
      <ToolbarMenu label="More">
        <a href="#about">About</a>
      </ToolbarMenu>
    ));
    const menu = view.container.querySelector('details')!;
    const summary = view.container.querySelector('summary')!;
    menu.open = true;
    view.getByRole('link', { name: 'About' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
});

describe('shared study drawers', () => {
  it('returns focus to the opener after Escape', () => {
    const [open, setOpen] = createSignal(false);
    const view = render(() => (
      <>
        <Button onClick={() => setOpen(true)}>Open notes</Button>
        <Show when={open()}>
          <Drawer title="Notes" onClose={() => setOpen(false)}>
            Notes
          </Drawer>
        </Show>
      </>
    ));
    const trigger = view.getByRole('button', { name: 'Open notes' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(view.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(view.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses a term explanation before its containing drawer', () => {
    const [open, setOpen] = createSignal(true);
    const view = render(() => (
      <Show when={open()}>
        <Drawer title="Notes" onClose={() => setOpen(false)}>
          <InlineHint label="Term explanation" content="Explanation">
            Term
          </InlineHint>
        </Drawer>
      </Show>
    ));
    const hint = view.getByRole('button', { name: 'Term explanation' });
    fireEvent.focus(hint);
    expect(document.querySelector('[role="tooltip"]')).toBeTruthy();
    fireEvent.keyDown(hint, { key: 'Escape' });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(view.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(hint, { key: 'Escape' });
    expect(view.queryByRole('dialog')).toBeNull();
  });
});
