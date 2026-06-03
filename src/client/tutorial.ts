/**
 * First-time-user tutorial state — a single module-level signal pair (active +
 * step index) so any hash-routed page can read it without a context provider,
 * mirroring the i18n.ts pattern. The actual rendering lives in
 * TutorialOverlay.tsx; the step copy lives in the i18n.ts catalog (tutorial.*),
 * so this file carries only structure (which element each step points at, what
 * illustration to draw) and the lifecycle (start / next / prev / skip / end).
 *
 * Persistence: one localStorage flag ('tutorial:completed') drives the
 * first-visit auto-launch. The tour is always replayable from the ? button and
 * the #help route, which call startTour() directly regardless of the flag.
 */
import { createSignal } from 'solid-js';

const COMPLETED_KEY = 'tutorial:completed';

/** Custom events the DafViewer listens for, so the "Inside a note" step can
 *  open a real note (the whole-daf Overview) — a side panel on desktop, a
 *  bottom drawer on mobile — and close it again when the step is left. */
export const TUTORIAL_OPEN_NOTE_EVENT = 'tutorial-open-note';
export const TUTORIAL_CLOSE_NOTE_EVENT = 'tutorial-close-note';

/** Illustration drawn inside a centered fallback card (or alongside a tooltip)
 *  when a step teaches a legend rather than a single on-screen element. */
export type TourIllustration = 'icons' | 'spectrum' | 'translate' | 'qa' | 'card';

export interface TourStep {
  id: string;
  /** i18n key naming the chapter this step belongs to (for the #help list). */
  chapterKey: string;
  /** `data-tour` value to spotlight. Omit for a step that is always a centered
   *  card (a legend or a gesture that has no single anchor element). */
  target?: string;
  titleKey: string;
  bodyKey: string;
  illustration?: TourIllustration;
}

/**
 * The ordered tour. Chrome that is always present (language, page nav, the
 * margin icons) is spotlighted on the real element; legends and gestures that
 * have no single stable anchor (card anatomy, the underline spectrum, translate
 * gesture, Q&A) render as centered illustrative cards. The marks/layers toggles
 * are intentionally omitted — they live behind dev mode, not a user surface.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    chapterKey: 'tutorial.chapter.welcome',
    titleKey: 'tutorial.welcome.title',
    bodyKey: 'tutorial.welcome.body',
  },
  {
    id: 'lang',
    chapterKey: 'tutorial.chapter.welcome',
    target: 'lang',
    titleKey: 'tutorial.lang.title',
    bodyKey: 'tutorial.lang.body',
  },
  {
    id: 'nav',
    chapterKey: 'tutorial.chapter.reading',
    target: 'daf-nav',
    titleKey: 'tutorial.nav.title',
    bodyKey: 'tutorial.nav.body',
  },
  {
    id: 'translate',
    chapterKey: 'tutorial.chapter.reading',
    titleKey: 'tutorial.translate.title',
    bodyKey: 'tutorial.translate.body',
    illustration: 'translate',
  },
  {
    id: 'marks',
    chapterKey: 'tutorial.chapter.marks',
    target: 'gutter',
    titleKey: 'tutorial.marks.title',
    bodyKey: 'tutorial.marks.body',
    illustration: 'icons',
  },
  {
    id: 'chips',
    chapterKey: 'tutorial.chapter.marks',
    target: 'chips',
    titleKey: 'tutorial.chips.title',
    bodyKey: 'tutorial.chips.body',
  },
  {
    id: 'card',
    chapterKey: 'tutorial.chapter.marks',
    target: 'note-panel',
    titleKey: 'tutorial.card.title',
    bodyKey: 'tutorial.card.body',
  },
  {
    id: 'underline',
    chapterKey: 'tutorial.chapter.marks',
    titleKey: 'tutorial.underline.title',
    bodyKey: 'tutorial.underline.body',
    illustration: 'spectrum',
  },
  {
    id: 'qa',
    chapterKey: 'tutorial.chapter.marks',
    titleKey: 'tutorial.qa.title',
    bodyKey: 'tutorial.qa.body',
    illustration: 'qa',
  },
  {
    id: 'finish',
    chapterKey: 'tutorial.chapter.done',
    titleKey: 'tutorial.finish.title',
    bodyKey: 'tutorial.finish.body',
  },
];

const [tourActive, setTourActive] = createSignal(false);
const [tourIndex, setTourIndex] = createSignal(0);

export { tourActive, tourIndex };

/** The step currently shown, or null when the tour is inactive / out of range. */
export function currentStep(): TourStep | null {
  if (!tourActive()) return null;
  return TOUR_STEPS[tourIndex()] ?? null;
}

export function hasCompletedTutorial(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(COMPLETED_KEY) !== null;
  } catch {
    return true;
  }
}

function markCompleted(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COMPLETED_KEY, '1');
  } catch {
    /* private mode — the tour simply re-offers next session */
  }
}

export function startTour(fromIndex = 0): void {
  setTourIndex(Math.max(0, Math.min(fromIndex, TOUR_STEPS.length - 1)));
  setTourActive(true);
}

/** End the tour. Always records completion so the auto-launch won't fire again;
 *  the user can still replay from the ? button / #help. */
export function endTour(): void {
  setTourActive(false);
  markCompleted();
}

export function nextStep(): void {
  if (tourIndex() >= TOUR_STEPS.length - 1) {
    endTour();
    return;
  }
  setTourIndex(tourIndex() + 1);
}

export function prevStep(): void {
  setTourIndex(Math.max(0, tourIndex() - 1));
}

export const skipTour = endTour;

/** Ask the DafViewer to open the whole-daf Overview note (side panel / drawer)
 *  so the "Inside a note" step shows the real thing. */
export function openTutorialNote(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TUTORIAL_OPEN_NOTE_EVENT));
}

/** Close the note opened for the tour (when the step is left / the tour ends). */
export function closeTutorialNote(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TUTORIAL_CLOSE_NOTE_EVENT));
}

/** Launch the tour automatically the first time a user lands on the daf reader.
 *  Safe to call repeatedly — it no-ops once completion is recorded or the tour
 *  is already running. */
export function maybeAutoStart(): void {
  if (hasCompletedTutorial() || tourActive()) return;
  startTour(0);
}
