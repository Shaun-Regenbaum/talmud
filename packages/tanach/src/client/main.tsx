import { render } from 'solid-js/web';
import { App } from './App.tsx';
import { UsagePage } from './UsagePage.tsx';
import './styles.css';

const root = document.getElementById('root');
const isUsage = window.location.pathname.replace(/\/+$/, '') === '/usage';
if (root) render(() => (isUsage ? <UsagePage /> : <App />), root);
