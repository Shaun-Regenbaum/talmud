import { type JSX, onCleanup, onMount } from 'solid-js';

/** Native disclosure: links keep ordinary Tab navigation and browser semantics. */
export function ToolbarMenu(props: { label: string; children: JSX.Element }): JSX.Element {
  let menu!: HTMLDetailsElement;
  let trigger!: HTMLElement;
  const closeOutside = (event: PointerEvent) => {
    if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && menu.open && menu.contains(document.activeElement)) {
      menu.open = false;
      trigger.focus();
    }
  };
  onMount(() => {
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
  });
  onCleanup(() => {
    document.removeEventListener('pointerdown', closeOutside);
    document.removeEventListener('keydown', closeOnEscape);
  });
  return (
    <details ref={menu} class="ui-toolbar-menu">
      <summary ref={trigger} class="ui-button">
        {props.label}
      </summary>
      <div class="ui-toolbar-menu-items">{props.children}</div>
    </details>
  );
}
