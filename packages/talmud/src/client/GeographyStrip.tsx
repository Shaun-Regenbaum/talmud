import type { JSX } from 'solid-js';
import { GeographyMap, type GeographyMapProps } from './GeographyMap';

// Thin wrapper for the right strip: GeographyMap's internal flex layout
// (Israel and Bavel side-by-side with flex:1 each) adapts to the 220px strip
// width — the SVGs shrink, text reflows. If this gets too cramped we'll flip
// to layout="column". The narrower aspect is the trade-off for putting the
// map right next to the daf.
export function GeographyStrip(props: GeographyMapProps): JSX.Element {
  return <GeographyMap {...props} layout="row" />;
}
