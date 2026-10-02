import type { JSX } from 'solid-js';

export interface PageNavigationProps {
  label: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  children: JSX.Element;
  'data-tour'?: string;
}

/** Page numbers stay left-to-right in either language. In Hebrew the two arrow
 *  buttons swap sides and point the other way (next is on the left, the
 *  direction Hebrew reads), which components.css does under html[dir=rtl]. */
export function PageNavigation(props: PageNavigationProps): JSX.Element {
  return (
    <nav
      class="ui-page-navigation"
      aria-label={props.label}
      dir="ltr"
      data-tour={props['data-tour']}
    >
      <button
        type="button"
        aria-label={props.previousLabel}
        disabled={props.previousDisabled}
        onClick={props.onPrevious}
      >
        <span class="ui-page-arrow">‹</span>
      </button>
      {props.children}
      <button
        type="button"
        aria-label={props.nextLabel}
        disabled={props.nextDisabled}
        onClick={props.onNext}
      >
        <span class="ui-page-arrow">›</span>
      </button>
    </nav>
  );
}
