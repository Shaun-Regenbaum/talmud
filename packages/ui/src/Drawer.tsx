/**
 * @corpus/ui — Drawer.
 *
 * A fixed right-edge panel with a header (a ref title + a kind label + a close
 * button) and a scrolling body. The shell both apps use for on-demand detail:
 * the tanach reader's perek pills (Overview, …) and its verse-source drawer
 * (Commentary / Talmud / Midrash) both render through it. Styling: `.ui-drawer`
 * in components.css.
 */

import { createUniqueId, type JSX, onCleanup, onMount } from 'solid-js';

export interface DrawerProps {
  /** The reference shown at the head, e.g. "Genesis 22" or "Genesis 22:5". */
  title: JSX.Element;
  /** Optional kind label, e.g. "Overview" / "Commentary". */
  label?: JSX.Element;
  /** Reading direction for the panel (English ltr / Hebrew rtl). */
  dir?: 'ltr' | 'rtl';
  onClose: () => void;
  children: JSX.Element;
}

export function Drawer(props: DrawerProps): JSX.Element {
  const titleId = createUniqueId();
  let closeButton: HTMLButtonElement | undefined;
  const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      props.onClose();
    }
  };
  onMount(() => {
    closeButton?.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onKey);
    if (priorFocus?.isConnected) priorFocus.focus({ preventScroll: true });
  });
  return (
    <aside role="dialog" aria-labelledby={titleId} class="ui-drawer" dir={props.dir ?? 'ltr'}>
      <header class="ui-drawer-head">
        <span id={titleId} class="ui-drawer-ref">
          {props.title}
        </span>
        {props.label ? <span class="ui-drawer-kind">{props.label}</span> : null}
        <button
          ref={closeButton}
          type="button"
          class="ui-drawer-close"
          onClick={() => props.onClose()}
          aria-label={props.dir === 'rtl' ? 'סגירה' : 'Close'}
        >
          ×
        </button>
      </header>
      <div class="ui-drawer-body">{props.children}</div>
    </aside>
  );
}
