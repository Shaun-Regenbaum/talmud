/**
 * First-visit nudge on the reader: a slim, dismissible bar offering the tour.
 * It renders in normal flow (it pushes content rather than covering it) and is
 * shown only until the user either takes the tour (→ completion) or dismisses it.
 * The two flags are distinct on purpose — dismissing must not mark the tour
 * done, so it stays reachable from the Help button.
 */
import { createSignal, type JSX, Show } from 'solid-js';
import { t } from './i18n';
import { hasCompletedTutorial, hasDismissedBanner, markBannerDismissed } from './tutorial';

export function TutorialBanner(): JSX.Element {
  const [visible, setVisible] = createSignal(!hasCompletedTutorial() && !hasDismissedBanner());

  const dismiss = () => {
    markBannerDismissed();
    setVisible(false);
  };

  return (
    <Show when={visible()}>
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '10px',
          'flex-wrap': 'wrap',
          margin: '0 0 0.6rem',
          padding: '8px 12px',
          border: '1px solid var(--line)',
          'border-radius': '8px',
          background: '#faf6f3',
        }}
      >
        <span
          style={{ flex: '1 1 auto', 'font-size': '13px', color: 'var(--fg)', 'min-width': '0' }}
        >
          {t('tutorial.banner.text')}
        </span>
        <button
          type="button"
          class="tb-primary"
          onClick={() => {
            window.location.hash = 'tutorial';
          }}
          style={{
            height: 'auto',
            padding: '6px 12px',
            'font-size': '13px',
            'border-radius': '6px',
          }}
        >
          {t('tutorial.banner.action')}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('tutorial.banner.dismiss')}
          title={t('tutorial.banner.dismiss')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            'font-size': '18px',
            'line-height': 1,
            padding: '2px 6px',
          }}
        >
          ×
        </button>
      </div>
    </Show>
  );
}
