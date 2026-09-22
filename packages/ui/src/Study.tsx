import { type JSX, Show, splitProps } from 'solid-js';
import { Button } from './Button';

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  const [local, rest] = splitProps(props, ['class']);
  return <input {...rest} class={`ui-input ${local.class ?? ''}`} />;
}

export function SectionHeading(props: { title: JSX.Element; detail?: JSX.Element }): JSX.Element {
  return (
    <div class="ui-section-heading">
      <h4>{props.title}</h4>
      <Show when={props.detail}>
        <span>{props.detail}</span>
      </Show>
    </div>
  );
}

export function StatusMessage(props: {
  children: JSX.Element;
  tone?: 'loading' | 'empty' | 'error' | 'paused';
  onRetry?: () => void;
  retryLabel?: string;
}): JSX.Element {
  return (
    <div
      class="ui-status"
      classList={{ 'is-error': props.tone === 'error' }}
      role={props.tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <span>{props.children}</span>
      <Show when={props.onRetry && props.retryLabel}>
        <Button onClick={props.onRetry}>{props.retryLabel}</Button>
      </Show>
    </div>
  );
}

export function SourceCard(props: {
  title: JSX.Element;
  reference?: JSX.Element;
  children?: JSX.Element;
  actions?: JSX.Element;
}): JSX.Element {
  return (
    <section class="ui-source-card">
      <div class="ui-source-heading">
        <h4>{props.title}</h4>
        <Show when={props.reference}>
          <span class="ui-source-reference" dir="auto">
            {props.reference}
          </span>
        </Show>
      </div>
      <div class="ui-source-content">{props.children}</div>
      <Show when={props.actions}>
        <div class="ui-source-actions">{props.actions}</div>
      </Show>
    </section>
  );
}

export interface ChoiceCardProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  title: JSX.Element;
  detail?: JSX.Element;
  meta?: JSX.Element;
  active?: boolean;
  stripe?: string;
}
export function ChoiceCard(props: ChoiceCardProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'title',
    'detail',
    'meta',
    'active',
    'stripe',
    'class',
    'children',
  ]);
  return (
    <button
      type="button"
      {...rest}
      class={`ui-choice-card ${local.class ?? ''}`}
      aria-pressed={local.active}
      classList={{ active: local.active }}
    >
      <Show when={local.stripe}>
        <span class="ui-choice-stripe" style={{ background: local.stripe }} />
      </Show>
      <span class="ui-choice-copy">
        <strong>{local.title}</strong>
        <Show when={local.detail}>
          <span>{local.detail}</span>
        </Show>
        {local.children}
      </span>
      <Show when={local.meta}>
        <span class="ui-choice-meta">{local.meta}</span>
      </Show>
    </button>
  );
}

export function FilterChip(props: {
  active: boolean;
  onClick: () => void;
  children: JSX.Element;
  count?: number;
}): JSX.Element {
  return (
    <Button class="ui-filter-chip" active={props.active} onClick={props.onClick}>
      {props.children}
      <Show when={props.count !== undefined}>
        <span class="ui-filter-count">{props.count}</span>
      </Show>
    </Button>
  );
}

export function StatCard(props: {
  label: JSX.Element;
  value: JSX.Element;
  detail?: JSX.Element;
}): JSX.Element {
  return (
    <div class="ui-stat-card">
      <div class="ui-stat-label">{props.label}</div>
      <div class="ui-stat-value">{props.value}</div>
      <Show when={props.detail}>
        <div class="ui-stat-detail">{props.detail}</div>
      </Show>
    </div>
  );
}
