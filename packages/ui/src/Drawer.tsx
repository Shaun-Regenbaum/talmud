/**
 * @corpus/ui — Drawer.
 *
 * A fixed right-edge panel with a header (a ref title + a kind label + a close
 * button) and a scrolling body. The shell both apps use for on-demand detail:
 * the tanach reader's perek pills (Overview, …) and its verse-source drawer
 * (Commentary / Talmud / Midrash) both render through it. Styling: `.ui-drawer`
 * in components.css.
 */

import type { JSX } from 'solid-js';

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
  return (
    <aside class="ui-drawer" dir={props.dir ?? 'ltr'}>
      <header class="ui-drawer-head">
        <span class="ui-drawer-ref">{props.title}</span>
        {props.label ? <span class="ui-drawer-kind">{props.label}</span> : null}
        <button
          type="button"
          class="ui-drawer-close"
          onClick={() => props.onClose()}
          aria-label="Close"
        >
          ×
        </button>
      </header>
      <div class="ui-drawer-body">{props.children}</div>
    </aside>
  );
}
