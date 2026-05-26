/**
 * Floating EN/HE language toggle, mounted once in App.tsx so it rides above
 * every hash-routed page. Kept as a fixed corner control rather than a full
 * top bar so it doesn't reflow each page's existing header/layout; it can be
 * folded into a unified header later. Positioned with logical `inset-inline-end`
 * so it sits top-right in LTR and top-left in RTL (he) automatically.
 */
import { type JSX } from 'solid-js';
import { lang, setLang, type Lang } from './i18n';

export function TopBar(): JSX.Element {
  // Shares the daf header's `.tb-seg` / `.tb-seg-btn` segmented-control styling
  // (see styles.css) so the language switch looks identical whether it's folded
  // into the daf header or floating here over the other routes.
  const btn = (value: Lang, label: string): JSX.Element => (
    <button
      type="button"
      class="tb-seg-btn"
      classList={{ 'is-active': lang() === value }}
      onClick={() => setLang(value)}
      aria-pressed={lang() === value}
    >
      {label}
    </button>
  );

  return (
    <div
      class="tb-seg"
      role="group"
      aria-label="Language"
      style={{
        position: 'fixed',
        top: '8px',
        'inset-inline-end': '8px',
        'z-index': '2000',
        'box-shadow': '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      {btn('en', 'EN')}
      {btn('he', 'עב')}
    </div>
  );
}
