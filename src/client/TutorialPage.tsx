/**
 * #tutorial — the guided walkthrough. It renders the REAL reader pinned to a
 * fixed daf (Berakhot 62b) in "embedded" mode (so it never disturbs where the
 * actual reader sits) and lays the TutorialCoach over it. The coach walks you
 * around the page, spotlighting real controls and opening a real note. Because
 * this is our own dedicated page — fixed daf, no competing routes — the coach's
 * positioning is reliable in a way the old live-page overlay never was.
 */
import { type JSX } from 'solid-js';
import DafViewer from './DafViewer';
import { TutorialCoach } from './TutorialCoach';
import { FEATURED_DAF } from './tutorial';

export function TutorialPage(): JSX.Element {
  return (
    <>
      <DafViewer initialTractate={FEATURED_DAF.tractate} initialPage={FEATURED_DAF.page} embedded />
      <TutorialCoach />
    </>
  );
}
