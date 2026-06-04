/**
 * #tutorial — the guided walkthrough. It renders the REAL reader pinned to a
 * fixed daf (Berakhot 8a) in "embedded" mode (so it never disturbs where the
 * actual reader sits) and lays the TutorialCoach over it. The coach walks you
 * around the page, spotlighting real controls and opening a real note. Because
 * this is our own dedicated page — fixed daf, no competing routes — the coach's
 * positioning is reliable in a way the old live-page overlay never was.
 *
 * On mount we fire a warm request for the featured daf so its marks, notes, and
 * suggested-question lists are generated ahead of time — the walkthrough then
 * shows real content instead of "Learning…". (Per-question answers still
 * generate on click; the coach's note steps say so.)
 */
import { onMount, type JSX } from 'solid-js';
import DafViewer from './DafViewer';
import { TutorialCoach } from './TutorialCoach';
import { FEATURED_DAF } from './tutorial';
import { lang } from './i18n';

export function TutorialPage(): JSX.Element {
  onMount(() => {
    // Fire-and-forget warm so the featured daf is ready when the user arrives.
    try {
      void fetch('/api/warm-daf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tractate: FEATURED_DAF.tractate, page: FEATURED_DAF.page, lang: lang() }),
      }).catch(() => {});
    } catch {
      /* warming is best-effort */
    }
  });

  return (
    <>
      <DafViewer initialTractate={FEATURED_DAF.tractate} initialPage={FEATURED_DAF.page} embedded />
      <TutorialCoach />
    </>
  );
}
