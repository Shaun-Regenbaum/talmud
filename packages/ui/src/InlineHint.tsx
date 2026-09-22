import { createSignal, createUniqueId, type JSX, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

/** An inline explanation that works with a pointer, keyboard, or touch. */
export function InlineHint(props: {
  label: string;
  children: JSX.Element;
  content: JSX.Element;
}): JSX.Element {
  const id = createUniqueId();
  const [position, setPosition] = createSignal<{ x: number; y: number; below: boolean } | null>(
    null,
  );
  let trigger: HTMLButtonElement | undefined;
  const close = () => setPosition(null);
  const open = () => {
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const half = Math.min(144, (innerWidth - 32) / 2);
    const below = box.top < 96;
    setPosition({
      x: Math.min(Math.max(box.left + box.width / 2, 16 + half), innerWidth - 16 - half),
      y: below ? box.bottom + 8 : box.top - 8,
      below,
    });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && position()) {
      event.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  onCleanup(() => {
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
  });
  return (
    <>
      <button
        ref={trigger}
        type="button"
        class="ui-inline-hint"
        aria-label={props.label}
        aria-describedby={position() ? id : undefined}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={open}
      >
        {props.children}
      </button>
      <Show when={position()}>
        {(point) => (
          <Portal>
            <div
              id={id}
              role="tooltip"
              class="ui-hint-tip"
              classList={{ below: point().below }}
              style={{ left: `${point().x}px`, top: `${point().y}px` }}
            >
              {props.content}
            </div>
          </Portal>
        )}
      </Show>
    </>
  );
}
