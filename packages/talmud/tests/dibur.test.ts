import { describe, it, expect } from 'vitest';
import { diburHaMaschil, leadingWords, stripTags } from '../src/lib/context/dibur';

describe('stripTags', () => {
  it('drops markup and collapses whitespace; tolerates undefined', () => {
    expect(stripTags('<b>נגר</b>  הנגרר')).toBe('נגר הנגרר');
    expect(stripTags(undefined)).toBe('');
  });
});

describe('leadingWords', () => {
  it('takes the first n words, stripping tags', () => {
    expect(leadingWords('<b>אחד</b> שנים שלשה ארבעה', 2)).toBe('אחד שנים');
    expect(leadingWords('', 3)).toBeUndefined();
    expect(leadingWords(undefined, 3)).toBeUndefined();
  });
});

describe('diburHaMaschil', () => {
  it('takes the bolded lemma when the comment bolds it (Rishonim / Sefaria)', () => {
    // The exact bug fixed in #23: stripping tags first lost the </b> boundary
    // and ran the lemma into the comment ("…במקדש פיר"), so it never matched.
    expect(diburHaMaschil('<b>נגר הנגרר נועלין בו במקדש</b> פיר נגר שאין בראשו'))
      .toBe('נגר הנגרר נועלין בו במקדש');
    expect(diburHaMaschil('<strong>ההוא שריתא</strong> דהוה ביה')).toBe('ההוא שריתא');
  });

  it('splits on a sentence period when there is no bold (some Rishonim)', () => {
    expect(diburHaMaschil('המונח כאן וכאן אסור. פירש רש"י ז"ל: בשתוקעו'))
      .toBe('המונח כאן וכאן אסור');
  });

  it('splits on the " - " dash (Rashi/Tosafot lemma)', () => {
    expect(diburHaMaschil('זמורה - של גפן:')).toBe('זמורה');
    expect(diburHaMaschil('שהיא קשורה בטפיח - פך ששואבין בו')).toBe('שהיא קשורה בטפיח');
  });

  it('caps the lemma at 6 words and handles empty/undefined', () => {
    expect(diburHaMaschil('א ב ג ד ה ו ז ח')).toBe('א ב ג ד ה ו');
    expect(diburHaMaschil('')).toBeUndefined();
    expect(diburHaMaschil(undefined)).toBeUndefined();
  });
});
