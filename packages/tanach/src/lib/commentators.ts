/**
 * Classic commentators fetched from Sefaria, in display order. The Sefaria index
 * title is `${title} on ${book}` and a verse ref is `${title} on ${book}
 * ${chapter}:${verse}`. Not every commentator covers every book (Ramban/Sforno
 * are Torah; Radak/Metzudat lean Nevi'im-Ketuvim) — a missing one just returns
 * nothing and is skipped.
 */

export interface Commentator {
  key: string;
  /** Sefaria index-title prefix, e.g. "Rashi" -> "Rashi on Genesis 1:1". */
  title: string;
  en: string;
  he: string;
}

export const COMMENTATORS: Commentator[] = [
  { key: 'rashi', title: 'Rashi', en: 'Rashi', he: 'רש״י' },
  { key: 'rashbam', title: 'Rashbam', en: 'Rashbam', he: 'רשב״ם' },
  { key: 'ibn-ezra', title: 'Ibn Ezra', en: 'Ibn Ezra', he: 'אבן עזרא' },
  { key: 'ramban', title: 'Ramban', en: 'Ramban', he: 'רמב״ן' },
  { key: 'sforno', title: 'Sforno', en: 'Sforno', he: 'ספורנו' },
  { key: 'radak', title: 'Radak', en: 'Radak', he: 'רד״ק' },
  { key: 'or-hachaim', title: 'Or HaChaim', en: 'Or HaChaim', he: 'אור החיים' },
  { key: 'metzudat-david', title: 'Metzudat David', en: 'Metzudat David', he: 'מצודת דוד' },
];
