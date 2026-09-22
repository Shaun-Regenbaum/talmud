import { type JSX, Show } from 'solid-js';

export interface ReaderHeaderProps {
  title: string;
  children: JSX.Element;
  utilities?: JSX.Element;
  hint?: JSX.Element;
  collapsed?: boolean;
}

/** Apps own navigation and data; this component owns the shared header layout. */
export function ReaderHeader(props: ReaderHeaderProps): JSX.Element {
  return (
    <header class="ui-reader-header" classList={{ 'is-collapsed': props.collapsed }}>
      <h1 class="ui-reader-title">{props.title}</h1>
      {props.children}
      <Show when={props.hint}>
        <div class="ui-reader-hint">{props.hint}</div>
      </Show>
      <Show when={props.utilities}>
        <div class="ui-reader-utilities">{props.utilities}</div>
      </Show>
    </header>
  );
}
