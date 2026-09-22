import { type JSX, splitProps } from 'solid-js';

export function Select(props: JSX.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  const [local, rest] = splitProps(props, ['class']);
  return <select {...rest} class={`ui-select ${local.class ?? ''}`} />;
}
