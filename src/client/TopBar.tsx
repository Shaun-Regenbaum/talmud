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
  const btn = (value: Lang, label: string): JSX.Element => (
    <button
      type="button"
      onClick={() => setLang(value)}
      aria-pressed={lang() === value}
      style={{
        border: 'none',
        background: lang() === value ? '#1f2937' : 'transparent',
        color: lang() === value ? '#fff' : '#6b7280',
        padding: '0.2rem 0.55rem',
        'border-radius': '5px',
        'font-size': '0.8rem',
        'font-weight': lang() === value ? '700' : '500',
        cursor: 'pointer',
        'line-height': '1.2',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: '8px',
        'inset-inline-end': '8px',
        'z-index': '2000',
        display: 'flex',
        gap: '2px',
        padding: '3px',
        background: '#fff',
        border: '1px solid #d6d3d1',
        'border-radius': '7px',
        'box-shadow': '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      {btn('en', 'EN')}
      {btn('he', 'עב')}
    </div>
  );
}
