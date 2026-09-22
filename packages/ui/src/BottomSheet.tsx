import type { JSX } from 'solid-js';
/** Fixed mobile shelf. Children own their scroll area and pinned controls. */
export function BottomSheet(props: {
  children: JSX.Element;
  zIndex?: number;
  tour?: string;
}): JSX.Element {
  return (
    <div class="ui-bottom-sheet" data-tour={props.tour} style={{ 'z-index': props.zIndex ?? 100 }}>
      {props.children}
    </div>
  );
}
