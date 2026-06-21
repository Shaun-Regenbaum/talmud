import { render } from 'solid-js/web';
// Shared design tokens + the tanach theme, imported BEFORE the app stylesheet
// so styles.css resolves the canonical vars (and the theme's overrides).
import '@corpus/ui/tokens.css';
import '@corpus/ui/themes/tanach.css';
import '@corpus/ui/components.css';
import { App } from './App.tsx';
import { UsagePage } from './UsagePage.tsx';
import './styles.css';

const root = document.getElementById('root');
const isUsage = window.location.pathname.replace(/\/+$/, '') === '/usage';
if (root) render(() => (isUsage ? <UsagePage /> : <App />), root);
