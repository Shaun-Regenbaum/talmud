import type { JSX } from 'solid-js';
/** Reference and title shared by chapter and portion overviews. Text stays with the caller. */
export function StudyOverview(props: {
  reference: string;
  title: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <div class="ui-study-overview">
      <p class="ui-study-reference">{props.reference}</p>
      <h3 class="ui-study-title">{props.title}</h3>
      {props.children}
    </div>
  );
}
