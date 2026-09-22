import { render } from 'solid-js/web';
// Shared reader theme and corpus-specific Hebrew font.
import '@corpus/ui/tokens.css';
import '@corpus/ui/themes/talmud.css';
import '@corpus/ui/geomap.css';
import '@corpus/ui/worldbubblemap.css';
import '@corpus/ui/loadprogress.css';
import '@corpus/ui/components.css';
import App from './App';
import { installGlobalErrorLogger } from './missLog';

installGlobalErrorLogger();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
render(() => <App />, root);
