/**
 * Tutorial data + persistence. The interactive walkthrough lives on its own
 * fully-controlled page (TutorialPage.tsx) at the #tutorial route, so this file
 * carries only the ordered step list (which mockup each step illustrates) and
 * two localStorage flags. The step copy lives in the i18n.ts catalog
 * (tutorial.*); the page owns its own step index locally.
 *
 * Persistence:
 *  - 'tutorial:completed' is set when the tour ends (Done or Skip). It suppresses
 *    the first-visit banner.
 *  - 'tutorial:banner-dismissed' is set when the banner's × is clicked. Distinct
 *    from completion — dismissing the banner must not mark the tour done, so it
 *    can still be (re)taken from the Help button.
 */

/** Which self-contained mockup a step illustrates. Every step that teaches a
 *  piece of chrome or a gesture draws one; welcome / finish are text only. */
export type TourMockup = 'icons' | 'spectrum' | 'translate' | 'qa' | 'lang' | 'nav' | 'chips' | 'card';

export interface TourStep {
  id: string;
  /** i18n key naming the chapter this step belongs to. */
  chapterKey: string;
  titleKey: string;
  bodyKey: string;
  /** Self-contained illustration drawn under the body. Omit for text-only steps. */
  mockup?: TourMockup;
}

/**
 * The ordered tour. Each step draws its own static mockup, so nothing depends on
 * the live reader being mounted or laid out a particular way.
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
    titleKey: 'tutorial.lang.title',
    bodyKey: 'tutorial.lang.body',
    mockup: 'lang',
  },
  {
    id: 'nav',
    chapterKey: 'tutorial.chapter.reading',
    titleKey: 'tutorial.nav.title',
    bodyKey: 'tutorial.nav.body',
    mockup: 'nav',
  },
  {
    id: 'translate',
    chapterKey: 'tutorial.chapter.reading',
    titleKey: 'tutorial.translate.title',
    bodyKey: 'tutorial.translate.body',
    mockup: 'translate',
  },
  {
    id: 'marks',
    chapterKey: 'tutorial.chapter.marks',
    titleKey: 'tutorial.marks.title',
    bodyKey: 'tutorial.marks.body',
    mockup: 'icons',
  },
  {
    id: 'chips',
    chapterKey: 'tutorial.chapter.marks',
    titleKey: 'tutorial.chips.title',
    bodyKey: 'tutorial.chips.body',
    mockup: 'chips',
  },
  {
    id: 'card',
    chapterKey: 'tutorial.chapter.marks',
    titleKey: 'tutorial.card.title',
    bodyKey: 'tutorial.card.body',
    mockup: 'card',
  },
  {
    id: 'underline',
    chapterKey: 'tutorial.chapter.marks',
    titleKey: 'tutorial.underline.title',
    bodyKey: 'tutorial.underline.body',
    mockup: 'spectrum',
  },
  {
    id: 'qa',
    chapterKey: 'tutorial.chapter.marks',
    titleKey: 'tutorial.qa.title',
    bodyKey: 'tutorial.qa.body',
    mockup: 'qa',
  },
  {
    id: 'finish',
    chapterKey: 'tutorial.chapter.done',
    titleKey: 'tutorial.finish.title',
    bodyKey: 'tutorial.finish.body',
  },
];

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
