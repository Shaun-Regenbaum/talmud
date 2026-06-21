import { render } from 'solid-js/web';
// Shared design tokens (the talmud theme matches this app's existing :root, so
// it adds the vars the kit needs — --font-ui/--surface/--font-hebrew/… —
// without re-tinting) + the GeoMap styles.
import '@corpus/ui/tokens.css';
import '@corpus/ui/themes/talmud.css';
import '@corpus/ui/geomap.css';
import App from './App';
import { installGlobalErrorLogger } from './missLog';

installGlobalErrorLogger();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
render(() => <App />, root);
