import { type JSX, splitProps } from 'solid-js';

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button(props: ButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'classList', 'active', 'variant']);
  return (
    <button
      type="button"
      {...rest}
      class={`ui-button ${local.class ?? ''}`}
      classList={{
        ...local.classList,
        active: local.active,
        'ui-button-primary': local.variant === 'primary',
      }}
      aria-pressed={local.active === undefined ? props['aria-pressed'] : local.active}
    />
  );
}
