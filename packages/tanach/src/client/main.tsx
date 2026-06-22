import { render } from 'solid-js/web';
// Shared design tokens + the tanach theme, imported BEFORE the app stylesheet
// so styles.css resolves the canonical vars (and the theme's overrides).
import '@corpus/ui/tokens.css';
import '@corpus/ui/themes/tanach.css';
import '@corpus/ui/components.css';
import '@corpus/ui/geomap.css';
import '@corpus/ui/loadprogress.css';
import '@corpus/ui/inspector.css';
import '@corpus/ui/usage.css';
import { AlignPage } from './AlignPage.tsx';
import { App } from './App.tsx';
import { UsagePage } from './UsagePage.tsx';
import './styles.css';

const root = document.getElementById('root');
const path = window.location.pathname.replace(/\/+$/, '');
const page = () => {
  if (path === '/usage') return <UsagePage />;
  if (path === '/align') return <AlignPage />;
  return <App />;
};
if (root) render(page, root);
