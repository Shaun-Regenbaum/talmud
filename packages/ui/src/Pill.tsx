/**
 * @corpus/ui — Pill.
 *
 * A small rounded chip-button, used for whole-unit affordances (the tanach
 * reader's perek pills: Overview / Geography / Tidbit). Styling lives in
 * components.css (`.ui-pill`), driven by the shared tokens; the app imports
 * @corpus/ui/components.css once.
 */

import type { JSX } from 'solid-js';

export interface PillProps {
  /** Selected state (the open pill). */
  active?: boolean;
  onClick?: () => void;
  title?: string;
  children: JSX.Element;
}

export function Pill(props: PillProps): JSX.Element {
  return (
    <button
      type="button"
      class="ui-pill"
      classList={{ active: props.active }}
      title={props.title}
      onClick={() => props.onClick?.()}
    >
      {props.children}
    </button>
  );
}

/** A centered row of pills, sitting at the top of a unit (chapter / daf). */
export function PillRow(props: { children: JSX.Element }): JSX.Element {
  return <div class="ui-pill-row">{props.children}</div>;
}
