import type { JSX } from 'solid-js';
import { Show } from 'solid-js';
import { t } from './i18n';
import './personCard.css';
export function PersonStatus(props: {
  children: JSX.Element;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <p
      class="person-status"
      classList={{ 'person-status-error': props.error }}
      role={props.error ? 'alert' : 'status'}
    >
      {props.children}
      <Show when={props.onRetry}>
        <button
          type="button"
          class="person-retry"
          onClick={props.onRetry}
          aria-label={t('sages.connections.retry')}
          title={t('sages.connections.retry')}
        >
          <span aria-hidden="true">↻</span>
        </button>
      </Show>
    </p>
  );
}
