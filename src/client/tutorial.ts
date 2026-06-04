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
 *  coach always points at the same, known content. Berakhot 8a: a rich early
 *  daf (the "time of favour", the worth of the synagogue, shnayim mikra) with
 *  argument, halacha, aggada, quoted verses, and many named rabbis — so every
 *  note type is represented. */
export const FEATURED_DAF = { tractate: 'Berakhot', page: '8a' } as const;

/** Which real note a step opens behind the coach. The coach asks the embedded
 *  DafViewer to open it; the reader sees the genuine panel / drawer. */
export type TourNote = 'overview' | 'argument' | 'halacha';

/** A small legend / demo drawn inside the coach card to supplement a step that
 *  teaches a concept rather than spotlighting a single element (the mark
 *  glyphs, the generation colour scale, the click-to-translate gesture, the
 *  Q&A box). */
export type TourSupplement = 'icons' | 'spectrum' | 'translate-word' | 'translate-phrase' | 'qa';

export interface TourStep {
  id: string;
  /** i18n key naming the chapter this step belongs to. */
  chapterKey: string;
  titleKey: string;
  bodyKey: string;
  /** `data-tour` value of a real element on the embedded daf to spotlight. */
  target?: string;
  /** Raw CSS selector to spotlight instead of a `data-tour` target (used for
   *  generated daf content like a rabbi name). Takes precedence over `target`. */
  selector?: string;
  /** Which match of `selector` to spotlight: an index, or 'middle' to pick one
   *  in the body (so a rabbi-name highlight isn't crammed against the top). */
  selectorIndex?: number | 'middle';
  /** Expand the in-note Q&A panel ("ask your own question") for this step, so
   *  the real suggested questions are visible. */
  expandQa?: boolean;
  /** Open a real note (panel on desktop, drawer on mobile) for this step. */
  note?: TourNote;
  /** Trigger a real translation on the daf: select one word, or a short run of
   *  words, so the genuine translation popup appears. */
  translate?: 'word' | 'phrase';
  /** Keep the mobile top header drawer (tractate / nav / language) open for
   *  this step — its target lives inside it. No-op on desktop. */
  header?: boolean;
  /** Legend / demo drawn under the body for concept steps. */
  supplement?: TourSupplement;
}

/**
 * The ordered walk around the daf. We spotlight real chrome (language, nav, the
 * margin icons, the chip bar), open real notes (an argument, a halacha, the
 * whole-daf overview, the Q&A), and highlight real daf content (a rabbi name).
 * A couple of concept steps (the translate gesture) centre with a small demo.
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
    id: 'translate-word',
    chapterKey: 'tutorial.chapter.reading',
    selector: '.daf-word-active',
    translate: 'word',
    titleKey: 'tutorial.translateWord.title',
    bodyKey: 'tutorial.translateWord.body',
  },
  {
    id: 'translate-phrase',
    chapterKey: 'tutorial.chapter.reading',
    selector: '.daf-word-active',
    translate: 'phrase',
    titleKey: 'tutorial.translatePhrase.title',
    bodyKey: 'tutorial.translatePhrase.body',
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
    id: 'argument',
    chapterKey: 'tutorial.chapter.marks',
    target: 'note-panel',
    note: 'argument',
    titleKey: 'tutorial.argument.title',
    bodyKey: 'tutorial.argument.body',
  },
  {
    id: 'qa',
    chapterKey: 'tutorial.chapter.marks',
    target: 'argument-qa',
    note: 'argument',
    expandQa: true,
    titleKey: 'tutorial.qa.title',
    bodyKey: 'tutorial.qa.body',
  },
  {
    id: 'halacha',
    chapterKey: 'tutorial.chapter.marks',
    target: 'note-panel',
    note: 'halacha',
    titleKey: 'tutorial.halacha.title',
    bodyKey: 'tutorial.halacha.body',
  },
  {
    id: 'chips',
    chapterKey: 'tutorial.chapter.marks',
    target: 'chips',
    titleKey: 'tutorial.chips.title',
    bodyKey: 'tutorial.chips.body',
  },
  {
    id: 'overview',
    chapterKey: 'tutorial.chapter.marks',
    target: 'note-panel',
    note: 'overview',
    titleKey: 'tutorial.overview.title',
    bodyKey: 'tutorial.overview.body',
  },
  {
    id: 'underline',
    chapterKey: 'tutorial.chapter.marks',
    selector: 'span.rabbi-underline',
    selectorIndex: 'middle',
    titleKey: 'tutorial.underline.title',
    bodyKey: 'tutorial.underline.body',
    supplement: 'spectrum',
  },
  {
    id: 'report',
    chapterKey: 'tutorial.chapter.done',
    target: 'report',
    titleKey: 'tutorial.report.title',
    bodyKey: 'tutorial.report.body',
  },
  {
    id: 'finish',
    chapterKey: 'tutorial.chapter.done',
    titleKey: 'tutorial.finish.title',
    bodyKey: 'tutorial.finish.body',
  },
];

/** Custom events the embedded DafViewer listens for so the note steps open a
 *  real note — an argument, a halacha, or the whole-daf overview — a side panel
 *  on desktop, a drawer on mobile, closed again when a non-note step is shown /
 *  the tour ends. The header events open/collapse the mobile top drawer (no-op
 *  on desktop). */
export const TUTORIAL_OPEN_NOTE_EVENT = 'tutorial-open-note'; // detail: { note: TourNote }
export const TUTORIAL_CLOSE_NOTE_EVENT = 'tutorial-close-note';
export const TUTORIAL_HEADER_EVENT = 'tutorial-header'; // detail: { open: boolean }
/** Ask the embedded DafViewer to actually translate a word / phrase / clear it,
 *  so the translate steps fire the genuine translation popup on the daf. */
export const TUTORIAL_TRANSLATE_EVENT = 'tutorial-translate'; // detail: { kind: 'word'|'phrase'|'clear' }

export function triggerTutorialTranslate(kind: 'word' | 'phrase' | 'clear'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TUTORIAL_TRANSLATE_EVENT, { detail: { kind } }));
}

/** Ask the embedded DafViewer to open a real note of the given kind. */
export function openTutorialNote(note: TourNote): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TUTORIAL_OPEN_NOTE_EVENT, { detail: { note } }));
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
