import { render } from 'solid-js/web';
import '../tokens.css';
import '../themes/tanach.css';
import '../components.css';
import '../geomap.css';
import '../worldbubblemap.css';
import '../inspector.css';
import { Gallery } from './Gallery';
import './gallery.css';

const root = document.getElementById('root');
if (root) render(() => <Gallery />, root);
