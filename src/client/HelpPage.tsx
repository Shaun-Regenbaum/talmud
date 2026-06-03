/**
 * #help — a static guide that doubles as the tour's replay surface. Lists what
 * the interactive tour covers (one entry per chapter, derived from TOUR_STEPS
 * so it can't drift) and offers a button to (re)start it. The floating TopBar
 * (mounted by App on non-daf routes) carries the language switch + Help button.
 */
import { For, type JSX } from 'solid-js';
import { t } from './i18n';
import { startTour, TOUR_STEPS } from './tutorial';

export function HelpPage(): JSX.Element {
  // Unique chapter keys in tour order.
  const chapters = (): string[] => {
    const seen: string[] = [];
    for (const s of TOUR_STEPS) if (!seen.includes(s.chapterKey)) seen.push(s.chapterKey);
    return seen;
  };

  return (
    <main class="page-shell" style={{ 'max-width': '640px', margin: '0 auto', padding: '64px 16px 48px' }}>
      <h1 style={{ 'font-size': '28px', 'margin-bottom': '8px' }}>{t('help.page.title')}</h1>
      <p style={{ color: '#374151', 'line-height': 1.5, 'margin-bottom': '20px' }}>{t('help.page.intro')}</p>

      <button
        type="button"
        onClick={() => startTour(0)}
        style={{
          background: '#2563eb', color: '#fff', border: '1px solid #2563eb',
          'border-radius': '2px', padding: '10px 18px', 'font-size': '15px',
          'font-weight': 600, cursor: 'pointer',
        }}
      >
        {t('help.page.start')}
      </button>

      <h2 style={{ 'font-size': '15px', 'text-transform': 'uppercase', 'letter-spacing': '0.04em', color: '#6b7280', 'margin-top': '32px', 'margin-bottom': '10px' }}>
        {t('help.page.covers')}
      </h2>
      <ul style={{ 'list-style': 'disc', 'padding-inline-start': '20px', color: '#374151', 'line-height': 1.7 }}>
        <For each={chapters()}>{(key) => <li>{t(key)}</li>}</For>
      </ul>
    </main>
  );
}
