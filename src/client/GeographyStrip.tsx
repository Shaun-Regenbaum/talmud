import { type JSX } from 'solid-js';
import { GeographyMap, type GeographyMapProps } from './GeographyMap';

// Thin wrapper for v1: the right strip is narrower than the original aside
// card, and GeographyMap's internal flex layout (Israel and Bavel side-by-
// side with flex:1 each) already adapts to width — the SVGs shrink, text
// reflows. If this gets too cramped at 220px we'll switch to stacked mode
// via a new `orientation` prop. For now the narrower aspect is the trade-
// off for putting the map right next to the daf.
export function GeographyStrip(props: GeographyMapProps): JSX.Element {
  return <GeographyMap {...props} layout="column" />;
}
