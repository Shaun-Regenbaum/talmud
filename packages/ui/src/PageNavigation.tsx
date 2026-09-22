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

/** Keep page numbers and directional arrows in reading order in either language. */
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
        ‹
      </button>
      {props.children}
      <button
        type="button"
        aria-label={props.nextLabel}
        disabled={props.nextDisabled}
        onClick={props.onNext}
      >
        ›
      </button>
    </nav>
  );
}
