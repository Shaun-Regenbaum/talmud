/**
 * Tutorial data + persistence. The walkthrough (#tutorial) renders the REAL
 * reader pinned to a fixed daf and a coach (TutorialCoach.tsx) walks you around
 * it — spotlighting real controls, opening a real note. This file carries the
 * featured daf, the ordered step list (which real element each step points at,
 * whether it opens a note, what legend to add), the note-open events, and two
 * localStorage flags. Step copy lives in the i18n.ts catalog (tutorial.*).
 *
 * Persistence:
 *  - 'tutorial:completed' is set when the tour ends (Done or Skip). It suppresses
 *    the first-visit banner.
 *  - 'tutorial:banner-dismissed' is set when the banner's × is clicked. Distinct
 *    from completion — dismissing the banner must not mark the tour done, so it
 *    can still be (re)taken from the Help button.
 */

/** The daf the tutorial features — pinned so the marks/notes are warm and the
 *  coach always points at the same, known content. Berakhot 62b: Bar Kappara's
 *  life-wisdom maxims (eat when hungry, drink when thirsty, and — the memorable
 *  last one — relieve yourself when you need to), woven with halacha, stories,
 *  and quoted verses, so every note type is represented. */
export const FEATURED_DAF = { tractate: 'Berakhot', page: '62b' } as const;

/** A small legend / illustration drawn inside the coach card to supplement a
 *  step that teaches a concept rather than a single control (the mark glyphs,
 *  the generation colour scale, the click-to-translate gesture, the Q&A box). */
export type TourSupplement = 'icons' | 'spectrum' | 'translate' | 'qa';

export interface TourStep {
  id: string;
  /** i18n key naming the chapter this step belongs to. */
  chapterKey: string;
  titleKey: string;
  bodyKey: string;
  /** `data-tour` value of a real element on the embedded daf to spotlight.
   *  Omit for a step that teaches a concept and centres instead. */
  target?: string;
  /** Open the whole-daf Overview note (real side panel / drawer) while this
   *  step is showing, so the reader sees an actual note. */
  note?: boolean;
  /** Keep the mobile top header drawer (tractate / nav / language) open for
   *  this step — its target lives inside it. On desktop the header is always
   *  visible, so this is a no-op there. */
  header?: boolean;
  /** Legend drawn under the body for concept steps. */
  supplement?: TourSupplement;
}

/**
 * The ordered walk around the daf. Chrome that is always present (language,
 * page nav, the margin icons, the chip bar, an open note) is spotlighted on the
 * real element; concepts that have no single anchor (the translate gesture, the
 * name-colour scale) centre with a small legend.
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
    header: true,
    titleKey: 'tutorial.lang.title',
    bodyKey: 'tutorial.lang.body',
  },
  {
    id: 'nav',
    chapterKey: 'tutorial.chapter.reading',
    target: 'daf-nav',
    header: true,
    titleKey: 'tutorial.nav.title',
    bodyKey: 'tutorial.nav.body',
  },
  {
    id: 'translate',
    chapterKey: 'tutorial.chapter.reading',
    titleKey: 'tutorial.translate.title',
    bodyKey: 'tutorial.translate.body',
    supplement: 'translate',
  },
  {
    id: 'marks',
    chapterKey: 'tutorial.chapter.marks',
    target: 'gutter',
    titleKey: 'tutorial.marks.title',
    bodyKey: 'tutorial.marks.body',
    supplement: 'icons',
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
    note: true,
    titleKey: 'tutorial.card.title',
    bodyKey: 'tutorial.card.body',
  },
  {
    id: 'qa',
    chapterKey: 'tutorial.chapter.marks',
    target: 'note-panel',
    note: true,
    titleKey: 'tutorial.qa.title',
    bodyKey: 'tutorial.qa.body',
    supplement: 'qa',
  },
  {
    id: 'underline',
    chapterKey: 'tutorial.chapter.marks',
    titleKey: 'tutorial.underline.title',
    bodyKey: 'tutorial.underline.body',
    supplement: 'spectrum',
  },
  {
    id: 'finish',
    chapterKey: 'tutorial.chapter.done',
    titleKey: 'tutorial.finish.title',
    bodyKey: 'tutorial.finish.body',
  },
];

/** Custom events the embedded DafViewer listens for so the note steps open a
 *  real note (the whole-daf Overview) — a side panel on desktop, a drawer on
 *  mobile — and close it again when a non-note step is shown / the tour ends.
 *  The header events open/collapse the mobile top drawer (no-op on desktop). */
export const TUTORIAL_OPEN_NOTE_EVENT = 'tutorial-open-note';
export const TUTORIAL_CLOSE_NOTE_EVENT = 'tutorial-close-note';
export const TUTORIAL_HEADER_EVENT = 'tutorial-header'; // detail: { open: boolean }

/** Ask the embedded DafViewer to open the whole-daf Overview note. */
export function openTutorialNote(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TUTORIAL_OPEN_NOTE_EVENT));
}

/** Close the note opened for the tour. */
export function closeTutorialNote(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TUTORIAL_CLOSE_NOTE_EVENT));
}

/** Open or collapse the mobile top header drawer (tractate / nav / language). */
export function setTutorialHeader(open: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TUTORIAL_HEADER_EVENT, { detail: { open } }));
}

const COMPLETED_KEY = 'tutorial:completed';
const BANNER_DISMISSED_KEY = 'tutorial:banner-dismissed';

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return true;
  }
}

function writeFlag(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* private mode — the banner simply re-offers next session */
  }
}

/** True once the tour has been finished or skipped. */
export function hasCompletedTutorial(): boolean {
  return readFlag(COMPLETED_KEY);
}

/** Record that the tour ended (Done or Skip). Also suppresses the banner. */
export function markCompleted(): void {
  writeFlag(COMPLETED_KEY);
}

/** True once the first-visit banner has been dismissed. */
export function hasDismissedBanner(): boolean {
  return readFlag(BANNER_DISMISSED_KEY);
}

/** Record that the user dismissed the banner (without taking the tour). */
export function markBannerDismissed(): void {
  writeFlag(BANNER_DISMISSED_KEY);
}
