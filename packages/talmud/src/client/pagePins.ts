import { createContext, useContext } from 'solid-js';
import type { ReadingPins } from '../lib/sage-graph/reading-pins';

/**
 * The graph and store revisions the open daf page shows. Cards and connection lists in the page's
 * sidebar read these same revisions, so they can never disagree with the page. On a daf page they are
 * required: while the page's graph loads, or if it failed, nothing is read (fail closed), and `retry`
 * reloads the page's graph. Outside a daf page nothing is required.
 */
export interface PageRevisions {
  required: boolean;
  pins: () => ReadingPins | undefined;
  loading: () => boolean;
  retry: () => void;
}
export const PagePins = createContext<PageRevisions>({
  required: false,
  pins: () => undefined,
  loading: () => false,
  retry: () => undefined,
});
export const usePagePins = () => useContext(PagePins);
