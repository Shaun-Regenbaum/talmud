import { render } from 'solid-js/web';
import { App } from './App.tsx';
import './styles.css';

const root = document.getElementById('root');
if (root) render(() => <App />, root);
