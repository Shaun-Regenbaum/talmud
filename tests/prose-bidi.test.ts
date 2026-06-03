import { describe, it, expect } from 'vitest';
import { stripEchoParens } from '../src/client/hebraize';
import { bidiSegments } from '../src/client/Hebraized';

// The Hebrew/Aramaic runs that BidiText wraps in <bdi>. Wrong boundaries are
// exactly what scrambles the visual order, so assert them directly.
const heRuns = (s: string): string[] => bidiSegments(s).filter((p) => p.he).map((p) => p.text);

describe('bidiSegments — keep a quoted Hebrew/Aramaic citation in one bidi run', () => {
  it('keeps an internal ASCII gershayim abbreviation intact (the Ritva scramble)', () => {
    // Before the fix, the ASCII " inside בק"ש split this into `בק` + `ש של…`,
    // and the bidi algorithm reordered it into the broken `'בק … ),` render.
    const para = `The ריטב״א makes this explicit: 'בק"ש של ערבית זמנה תלוי בשכיבה (in the evening Shema), the obligation`;
    expect(heRuns(para)).toEqual(['ריטב״א', 'בק"ש של ערבית זמנה תלוי בשכיבה']);
  });

  it('keeps a geresh abbreviation (ר\' יוחנן) as one run', () => {
    expect(heRuns("quoting ר' יוחנן on the matter")).toEqual(["ר' יוחנן"]);
  });

  it('does NOT swallow an English apostrophe-s after a Hebrew word', () => {
    // The run must end on a Hebrew letter, so `'s` (Latin) stays outside.
    expect(heRuns("the verse's בשכבך describes")).toEqual(['בשכבך']);
    expect(heRuns("Rabbi עקיבא's view")).toEqual(['עקיבא']);
  });

  it('keeps a closing ASCII quote OUT of the run (it keeps its English position)', () => {
    // A wrapped Aramaic quote: the run is the Hebrew inside, the quotes flank it.
    expect(heRuns("It insists: 'שמע מינה שעורא דעני לחוד וקודם.' The dispute"))
      .toEqual(['שמע מינה שעורא דעני לחוד וקודם']);
  });

  it('leaves pure-English text with no bidi runs (no spurious isolation)', () => {
    expect(heRuns("but to 'the time of lying down.'")).toEqual([]);
  });
});

describe('stripEchoParens — drop redundant all-Hebrew gloss parentheticals', () => {
  it('drops an all-Hebrew paren right after a Hebrew term (the broken case)', () => {
    // term followed by a malformed/duplicated all-Hebrew "gloss"
    expect(stripEchoParens('a knife of מלא צואר וחוץ לצואר (מלא צואר וחוץ לצואר וחוץ לצואר) suffices'))
      .toBe('a knife of מלא צואר וחוץ לצואר suffices');
  });
  it('still collapses an exact echo', () => {
    expect(stripEchoParens('the מעשה (מעשה) here')).toBe('the מעשה here');
  });
  it('KEEPS a real English gloss', () => {
    expect(stripEchoParens('valid שחיטה (ritual slaughter) requires')).toBe('valid שחיטה (ritual slaughter) requires');
  });
  it('keeps an all-Hebrew paren that is NOT after a Hebrew term', () => {
    expect(stripEchoParens('the verse (בראשית) opens')).toBe('the verse (בראשית) opens');
  });
  it('KEEPS a genuine Hebrew clarification that adds new words (not an echo)', () => {
    // The paren shares no words with the term, so it is a real clarification,
    // not a redundant restatement — must survive.
    expect(stripEchoParens('cited by רבי עקיבא (תנא) here')).toBe('cited by רבי עקיבא (תנא) here');
  });
  it('keeps a Hebrew paren with a digit/other script (only Hebrew bodies match)', () => {
    expect(stripEchoParens('the daf דף (דף 2) here')).toBe('the daf דף (דף 2) here');
  });
  it('KEEPS a quoted paren that adds a new word (not a pure repetition)', () => {
    // Shares words with the term but introduces 'מבחוץ' — a real clarification.
    expect(stripEchoParens("a knife 'מלא צואר' (מלא צואר מבחוץ) here"))
      .toBe("a knife 'מלא צואר' (מלא צואר מבחוץ) here");
  });
  it('drops a quote-wrapped echo, keeping the closing quote (the production case)', () => {
    // A closing quote sits between the term and the paren; the echo must still
    // be dropped, and the quote that wraps the term must be preserved.
    expect(stripEchoParens("says the knife must be 'מלא צואר וחוץ לצואר' (מלא צואר וחוץ לצואר). The Gemara"))
      .toBe("says the knife must be 'מלא צואר וחוץ לצואר'. The Gemara");
  });
});
