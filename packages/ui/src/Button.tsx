/**
 * @corpus/ui — Button.
 *
 * The standard bordered control button used in app chrome (chapter / daf nav,
 * toggles). Chrome, so it renders in --font-ui. Styling: `.ui-button` in
 * components.css. `active` marks a pressed/selected state; `disabled` greys it.
 */

import type { JSX } from 'solid-js';

export interface ButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  'aria-label'?: string;
  children: JSX.Element;
}

export function Button(props: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class="ui-button"
      classList={{ active: props.active }}
      disabled={props.disabled}
      title={props.title}
      aria-label={props['aria-label']}
      onClick={() => props.onClick?.()}
    >
      {props.children}
    </button>
  );
}
