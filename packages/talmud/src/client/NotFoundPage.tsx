/** Shown for any #route the app does not have. The reader never renders here. */
import type { JSX } from 'solid-js';
import { t } from './i18n';

export function NotFoundPage(): JSX.Element {
  return (
    <main class="page-shell" style={{ '--page-max': '640px', 'padding-top': '4rem' }}>
      <h1 style={{ margin: '0 0 0.5rem', font: '700 1.6rem var(--font-serif, var(--font-ui))' }}>
        {t('notFound.title')}
      </h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 1.25rem' }}>{t('notFound.body')}</p>
      <a class="ui-button ui-button-primary" href="#daf">
        {t('notFound.back')}
      </a>
    </main>
  );
}
